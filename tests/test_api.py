import pytest


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_health_detailed(client):
    resp = await client.get("/api/health/detailed")
    assert resp.status_code == 200
    body = resp.json()
    assert "ok" in body
    assert "mediamtx" in body
    assert "cameras" in body
    assert "db" in body
    assert "disk_free_gb" in body
    # DB should be reachable; mediamtx will be unreachable in test env
    assert body["db"] is True


# ── Config ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_config(client):
    resp = await client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert "venue_id" in body
    assert "venue_name" in body
    assert "fields" in body
    assert isinstance(body["fields"], list)
    assert "pin_required" in body


@pytest.mark.asyncio
async def test_list_fields(client):
    resp = await client.get("/api/fields")
    assert resp.status_code == 200
    body = resp.json()
    assert "fields" in body
    assert isinstance(body["fields"], list)


@pytest.mark.asyncio
async def test_get_field_not_found(client):
    resp = await client.get("/api/fields/nonexistent-field")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_camera_status(client):
    resp = await client.get("/api/cameras/court1_camA/status")
    assert resp.status_code == 200
    body = resp.json()
    assert "camera_id" in body
    assert "streaming" in body


@pytest.mark.asyncio
async def test_verify_pin_no_pin_configured(client):
    """When no PIN is configured, verify-pin should return ok=True."""
    resp = await client.post(
        "/api/config/verify-pin",
        json={"pin": "anything"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


# ── Sessions ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_session(client):
    resp = await client.post(
        "/api/session",
        json={"field_id": "court1", "stream_path": "court1_camA"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "session_id" in body
    assert body["field_id"] == "court1"
    assert body["stream_path"] == "court1_camA"
    assert "venue_id" in body
    assert "viewer_url" in body


@pytest.mark.asyncio
async def test_get_session_existing(client):
    create_resp = await client.post(
        "/api/session",
        json={"field_id": "court1", "stream_path": "court1_camA"},
    )
    session_id = create_resp.json()["session_id"]

    resp = await client.get(f"/api/session/{session_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == session_id
    assert body["field_id"] == "court1"
    assert "stream_url_hls" in body
    assert "stream_url_rtsp" in body
    assert "viewer_count" in body


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    resp = await client.get("/api/session/doesnotexist")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "session not found"


@pytest.mark.asyncio
async def test_session_join_leave(client):
    create_resp = await client.post(
        "/api/session",
        json={"field_id": "court1", "stream_path": "court1_camA"},
    )
    session_id = create_resp.json()["session_id"]

    join_resp = await client.post(f"/api/session/{session_id}/join")
    assert join_resp.status_code == 200
    assert join_resp.json()["viewer_count"] == 1

    join_resp2 = await client.post(f"/api/session/{session_id}/join")
    assert join_resp2.json()["viewer_count"] == 2

    leave_resp = await client.post(f"/api/session/{session_id}/leave")
    assert leave_resp.status_code == 200
    assert leave_resp.json()["viewer_count"] == 1


# ── Events ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_event(client):
    resp = await client.post(
        "/api/event",
        json={"session_id": "sess123", "event": "point_scored", "meta": {"score": 3}},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_log_event_with_camera_id(client):
    resp = await client.post(
        "/api/event",
        json={
            "session_id": "sess123",
            "event": "camera_switch",
            "camera_id": "court1_camA",
            "meta": {},
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ── Clips ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_clip_no_segments(client):
    """Should return 404 when no recording segments exist for the camera."""
    resp = await client.post(
        "/api/clip",
        json={
            "field_id": "court1",
            "camera_id": "court1_camA",
            "seconds": 10,
            "session_id": "sess-abc",
        },
    )
    assert resp.status_code == 404
    assert "no recording segments" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_get_clip_job_not_found(client):
    resp = await client.get("/api/clip/unknownjobid")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "job not found"


@pytest.mark.asyncio
async def test_list_clips_empty(client):
    """Clip list for a new session should return empty list."""
    resp = await client.get("/api/clips?session_id=nonexistent-session")
    assert resp.status_code == 200
    body = resp.json()
    assert "clips" in body
    assert body["clips"] == []


@pytest.mark.asyncio
async def test_list_clips_no_filter(client):
    """Clip list without filter should return list (may be empty)."""
    resp = await client.get("/api/clips")
    assert resp.status_code == 200
    assert "clips" in resp.json()
