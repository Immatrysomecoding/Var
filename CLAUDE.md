# CLAUDE.md

> **Living project document.** Every session with Claude should start here.
> Update this file when phases complete, bugs are fixed, or priorities shift.

---

## What Is This

**VAR Basic** — a containerized sports replay system for pickleball courts.

Goal: YouTube-quality live streaming + professional VAR replay, running on a local edge machine at a venue.

Stack: FastAPI · MediaMTX · HLS.js · FFmpeg · SQLite · Docker Compose · Nginx

---

## Current State (as of 2026-03-29)

### What Works

- RTSP ingest via MediaMTX
- HLS playback in browser (8–10s latency)
- DVR-style 60s replay window on courtside screen
- Camera switching UI (4 buttons)
- Clip generation via API (FFmpeg concat + trim), async with job polling
- Clip metadata sidecar JSON written beside every clip
- Event logging to SQLite
- Public viewer via `/f/{sessionId}`
- Fake camera dev mode (looped MP4)
- All config driven by env vars (VENUE_ID, FIELD_ID, MEDIA_HOST, etc.)

### What Is Broken / Incomplete

| #   | Issue                                                               | Severity     | Status     | File                                 |
| --- | ------------------------------------------------------------------- | ------------ | ---------- | ------------------------------------ |
| 1   | `/data/recordings` not mounted in API container — clips will fail   | **CRITICAL** | ✅ Fixed   | `docker-compose.yml`                 |
| 2   | `MEDIA_HOST=localhost` hardcoded — phones/remote access broken      | **CRITICAL** | ✅ Fixed   | `screen/app.js`, `viewer/index.html` |
| 3   | Only `court1_camA` is actually recorded — other 3 cameras empty     | **HIGH**     | ✅ Fixed   | `recorder/record.sh`                 |
| 4   | Event log for clip uses hardcoded `"screen-local"` not real session | **HIGH**     | ✅ Fixed   | `api/routers/clips.py`               |
| 5   | `values.yml` config is not read by any service — all hardcoded      | **HIGH**     | ✅ Fixed   | `api/config.py`                      |
| 6   | No reconnect logic if RTSP stream drops                             | **HIGH**     | ✅ Fixed   | `recorder/record.sh`                 |
| 7   | Recordings grow forever, no cleanup                                 | **MEDIUM**   | ✅ Fixed   | `api/database.py`                    |
| 8   | No DB indexes on events table — will slow as data grows             | **MEDIUM**   | ✅ Fixed   | `api/database.py`                    |
| 9   | DVR window: no "seconds behind live" indicator                      | **MEDIUM**   | ✅ Fixed   | `screen/app.js`                      |
| 10  | Clip duration always 10s — not user-adjustable                      | **LOW**      | ✅ Fixed   | `screen/app.js`                      |
| 11  | No retry/error recovery in viewer if HLS stalls                     | **LOW**      | ✅ Fixed   | `viewer/index.html`                  |
| 12  | HLS latency 8–10s — target is <3s                                   | **FUTURE**   | ✅ Fixed   | `mediamtx.yml`                       |

---

## Roadmap

### Phase 1 — Stabilize (Fix What's Broken) ✅ COMPLETE

**Goal:** System works reliably, accessible from phone on local network.

- [x] **Fix API volume** — mounted `./data/recordings:/data/recordings:ro` and `./data/clips:/data/clips` in `docker-compose.yml`
- [x] **Fix remote access** — `MEDIA_HOST` now uses `window.location.hostname` in `screen/app.js` and `viewer/index.html`; API URLs auto-resolve from browser
- [x] **Fix session ID in clip event log** — `session_id` field added to `ClipRequest`, passed through to event INSERT
- [x] **Multi-camera recorder** — `record.sh` now spawns parallel ffmpeg processes for all 4 cameras
- [x] **Recorder reconnect** — infinite retry loop + `-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5` flags
- [x] **Add DB indexes** — `CREATE INDEX IF NOT EXISTS` on `events(session_id)` and `events(ts)`
- [x] **Recording cleanup** — background thread deletes segments older than `RECORDING_TTL_HOURS` (default 2h) every 30 min

### Phase 2 — Production Quality ✅ COMPLETE

- [x] Enable LL-HLS in MediaMTX + tune HLS.js for <3s latency
- [x] "Seconds behind live" display (`screen/app.js`)
- [x] Clip duration selector (5s / 10s / 15s / 30s)
- [x] Clip preview (opens in new tab on ready)
- [x] Replay speed control — skipped, not needed for VAR use case
- [x] Auto-refresh on stream loss (`screen/app.js` + `viewer/index.html`)
- [x] QR code on screen for spectator URL
- [x] Health checks + resource limits in docker-compose
- [x] Async clip generation (background task + job ID)

### Phase 2.5 — Cleanup & Foundation ✅ COMPLETE

**Goal:** Prepare codebase for multi-court (Phase 3) and AI training data (Phase 4).

- [x] **DB schema expanded** — added `clips`, `cameras`, `venues` tables + 4 indexes on `clips`
- [x] **Clip path restructured** — output is now `/data/clips/{session_id}/{clip_id}.mp4`; sidecar JSON at `/data/clips/{session_id}/{clip_id}.json`
- [x] **Recording path restructured** — segments now at `/data/recordings/{venue_id}/{field_id}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4`
- [x] **API split into routers** — `api/config.py`, `api/database.py`, `api/models.py`, `api/routers/{sessions,events,clips}.py`, slim `api/main.py`
- [x] **Config wired via env vars** — `VENUE_ID`, `FIELD_ID`, `MEDIA_HOST`, `RECORDINGS_ROOT`, `CLIPS_ROOT`, `RECORDING_TTL_HOURS`, `DEFAULT_CAMERAS` all in `api/config.py`
- [x] **SQLite concurrency fixed** — `threading.Lock()` on all write operations in `database.py`; reads are lock-free
- [x] **Integration tests** — `tests/conftest.py` + `tests/test_api.py`, 7 tests covering every endpoint, all passing

---

## Architecture (Current)

```
RTSP cameras / fake-camera FFmpeg
        ↓
   MediaMTX (port 8554 RTSP in, 8888 HLS out)
    segments: 2s, buffer: 30 segments = 60s DVR
        ↓              ↓
   recorder       HLS stream
   (record.sh)    ↓
   5-sec .mp4  screen/app.js (HLS.js DVR mode)
   segments    viewer/index.html
        ↓
   /data/recordings/{venue_id}/{field_id}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
        ↓
   api/routers/clips.py  POST /api/clip
   → FFmpeg concat N segments → trim → /data/clips/{session_id}/{clip_id}.mp4
                                       /data/clips/{session_id}/{clip_id}.json  ← sidecar
```

**Ports:**
| Port | Service |
|------|---------|
| 8000 | API (FastAPI) |
| 8081 | Viewer (spectator) |
| 8082 | Screen (courtside) |
| 8554 | MediaMTX RTSP input |
| 8888 | MediaMTX HLS output |

---

## Running the System

```bash
# Dev (fake looped camera)
docker compose -f docker-compose.yml -f fake-camera.yml up --build

# Stop
docker compose -f docker-compose.yml -f fake-camera.yml down

# Production (real cameras)
docker compose up --build
```

**Test API:**

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/session `
  -ContentType "application/json" `
  -Body '{"field_id":"court1","stream_path":"court1_camA"}'
```

HLS stream: `http://localhost:8888/{cameraId}/index.m3u8`

Run tests: `python -m pytest tests/ -v` from the repo root.

---

## Key Files

| File                      | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `api/main.py`             | App init, middleware, mounts, health endpoint  |
| `api/config.py`           | All env vars and constants                     |
| `api/database.py`         | DB connection, schema init, cleanup thread     |
| `api/models.py`           | Pydantic request models                        |
| `api/routers/sessions.py` | `/api/session` endpoints                       |
| `api/routers/events.py`   | `/api/event` endpoint                          |
| `api/routers/clips.py`    | `/api/clip` endpoints + FFmpeg job runner      |
| `screen/app.js`           | Courtside UI controller (HLS.js, DVR, clip)    |
| `screen/index.html`       | Courtside UI layout                            |
| `viewer/index.html`       | Public viewer (session-based)                  |
| `recorder/record.sh`      | FFmpeg RTSP → 5s MP4 segments                  |
| `docker-compose.yml`      | Service orchestration                          |
| `mediamtx.yml`            | HLS hub config (segment size, buffer)          |
| `values.yml`              | Future config spec (not yet wired up)          |
| `fake-camera.yml`         | Dev compose override (loops sample.mp4)        |
| `tests/conftest.py`       | pytest fixtures (in-process ASGI client)       |
| `tests/test_api.py`       | Integration tests for all API endpoints        |

---

## Known Constraints

- **Latency:** LL-HLS enabled, target <3s. Real-world result depends on network/hardware.
- **Fake camera:** Timestamp discontinuities at loop boundaries → playback stalls. Real cameras won't have this.
- **Clip generation:** Runs in thread pool (2 workers). Each clip blocks one worker for several seconds.
- **Windows dev:** Running on Windows 11. Paths in FFmpeg concat file must use forward slashes (handled via `.as_posix()`).

---

## Docs

Full roadmap: `docs/roadmap.md` | API reference: `docs/api-reference.md` | Services & DB: `docs/services.md` | Workflow: `docs/workflow.md`
