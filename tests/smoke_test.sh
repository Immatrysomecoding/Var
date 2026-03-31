#!/bin/sh
# Smoke test — hits every API endpoint and prints PASS / FAIL.
# Run after `docker compose up --build` with the stack running.
# Usage: sh tests/smoke_test.sh [API_BASE]
#   API_BASE defaults to http://localhost:8000

set -eu

API="${1:-http://localhost:8000}"
PASS=0
FAIL=0
SESSION_ID=""
JOB_ID=""

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

check() {
    label="$1"
    url="$2"
    method="${3:-GET}"
    body="${4:-}"
    expected_status="${5:-200}"

    if [ -n "$body" ]; then
        actual=$(curl -s -o /tmp/smoke_body -w "%{http_code}" \
            -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$body")
    else
        actual=$(curl -s -o /tmp/smoke_body -w "%{http_code}" \
            -X "$method" "$url")
    fi

    if [ "$actual" = "$expected_status" ]; then
        green "  PASS  [$actual] $label"
        PASS=$((PASS + 1))
        cat /tmp/smoke_body
        echo ""
    else
        red "  FAIL  [$actual != $expected_status] $label"
        cat /tmp/smoke_body
        echo ""
        FAIL=$((FAIL + 1))
    fi
}

echo ""
echo "=== VAR Smoke Test — $API ==="
echo ""

# ── Health ────────────────────────────────────────────────────────────────────
check "GET /api/health"          "$API/api/health"
check "GET /api/health/detailed" "$API/api/health/detailed"

# ── Config ───────────────────────────────────────────────────────────────────
check "GET /api/config"  "$API/api/config"
check "GET /api/fields"  "$API/api/fields"

# Test specific field (use court-1 from values.yml)
check "GET /api/fields/court-1" "$API/api/fields/court-1"
check "GET /api/fields/nonexistent (404)" "$API/api/fields/nonexistent-xyz" GET "" 404

check "GET /api/cameras/court1_camA/status" "$API/api/cameras/court1_camA/status"

check "POST /api/config/verify-pin (no pin)" \
    "$API/api/config/verify-pin" POST '{"pin":"1234"}'

# ── Session ───────────────────────────────────────────────────────────────────
echo "[creating session...]"
SESS_RESP=$(curl -s -X POST "$API/api/session" \
    -H "Content-Type: application/json" \
    -d '{"field_id":"court-1","stream_path":"court1_camA"}')
echo "$SESS_RESP"
SESSION_ID=$(echo "$SESS_RESP" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$SESSION_ID" ]; then
    green "  PASS  [200] POST /api/session -> $SESSION_ID"
    PASS=$((PASS + 1))
else
    red "  FAIL  POST /api/session — no session_id in response"
    FAIL=$((FAIL + 1))
fi

check "GET /api/session/{id}"     "$API/api/session/$SESSION_ID"
check "GET /api/session/bad (404)" "$API/api/session/doesnotexist" GET "" 404

check "POST /api/session/{id}/join"  "$API/api/session/$SESSION_ID/join"  POST ""
check "POST /api/session/{id}/leave" "$API/api/session/$SESSION_ID/leave" POST ""

# ── Event ─────────────────────────────────────────────────────────────────────
check "POST /api/event" "$API/api/event" POST \
    "{\"session_id\":\"$SESSION_ID\",\"event\":\"smoke_test\",\"meta\":{}}"

# ── Clip (no segments — expect 404) ───────────────────────────────────────────
check "POST /api/clip (no segments → 404)" "$API/api/clip" POST \
    "{\"field_id\":\"court-1\",\"camera_id\":\"court1_camA\",\"seconds\":10,\"session_id\":\"$SESSION_ID\"}" \
    404

check "GET /api/clip/badjob (404)" "$API/api/clip/badjobid" GET "" 404

# ── Clip list ──────────────────────────────────────────────────────────────────
check "GET /api/clips"                        "$API/api/clips"
check "GET /api/clips?session_id=..."         "$API/api/clips?session_id=$SESSION_ID"
check "GET /api/clips?field_id=court-1"       "$API/api/clips?field_id=court-1"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

[ "$FAIL" -eq 0 ]
