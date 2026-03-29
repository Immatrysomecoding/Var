import pytest


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


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
    assert "viewer_url" in body


@pytest.mark.asyncio
async def test_get_session_existing(client):
    # Create first
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


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    resp = await client.get("/api/session/doesnotexist")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "session not found"


# ── Events ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_event(client):
    resp = await client.post(
        "/api/event",
        json={"session_id": "sess123", "event": "point_scored", "meta": {"score": 3}},
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
