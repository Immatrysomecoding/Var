# CLAUDE.md

> **Living project document.** Every session with Claude should start here.
> Update this file when phases complete, bugs are fixed, or priorities shift.

---

## What Is This

**VAR Basic** — a containerized sports replay system for pickleball courts.

Goal: YouTube-quality live streaming + professional VAR replay, running on a local edge machine at a venue.

Stack: FastAPI · MediaMTX · HLS.js · FFmpeg · SQLite · Docker Compose · Nginx

---

## Current State (as of 2026-03-22)

### What Works

- RTSP ingest via MediaMTX
- HLS playback in browser (8–10s latency)
- DVR-style 60s replay window on courtside screen
- Camera switching UI (4 buttons)
- Clip generation via API (FFmpeg concat + trim)
- Event logging to SQLite
- Public viewer via `/f/{sessionId}`
- Fake camera dev mode (looped MP4)

### What Is Broken / Incomplete

| #   | Issue                                                               | Severity     | Status     | File                                 |
| --- | ------------------------------------------------------------------- | ------------ | ---------- | ------------------------------------ |
| 1   | `/data/recordings` not mounted in API container — clips will fail   | **CRITICAL** | ✅ Fixed   | `docker-compose.yml`                 |
| 2   | `MEDIA_HOST=localhost` hardcoded — phones/remote access broken      | **CRITICAL** | ✅ Fixed   | `screen/app.js`, `viewer/index.html` |
| 3   | Only `court1_camA` is actually recorded — other 3 cameras empty     | **HIGH**     | ✅ Fixed   | `recorder/record.sh`                 |
| 4   | Event log for clip uses hardcoded `"screen-local"` not real session | **HIGH**     | ✅ Fixed   | `api/main.py`                        |
| 5   | `values.yml` config is not read by any service — all hardcoded      | **HIGH**     | ❌ Pending | everywhere                           |
| 6   | No reconnect logic if RTSP stream drops                             | **HIGH**     | ✅ Fixed   | `recorder/record.sh`                 |
| 7   | Recordings grow forever, no cleanup                                 | **MEDIUM**   | ✅ Fixed   | `api/main.py`                        |
| 8   | No DB indexes on events table — will slow as data grows             | **MEDIUM**   | ✅ Fixed   | `api/main.py`                        |
| 9   | DVR window: no "seconds behind live" indicator                      | **MEDIUM**   | ❌ Pending | `screen/app.js`                      |
| 10  | Clip duration always 10s — not user-adjustable                      | **LOW**      | ❌ Pending | `screen/app.js`                      |
| 11  | No retry/error recovery in viewer if HLS stalls                     | **LOW**      | ✅ Fixed   | `viewer/index.html`                  |
| 12  | HLS latency 8–10s — target is <3s                                   | **FUTURE**   | ❌ Pending | `mediamtx.yml`                       |

---

## Roadmap

### Phase 1 — Stabilize (Fix What's Broken) ✅ COMPLETE

**Goal:** System works reliably, accessible from phone on local network.

- [x] **Fix API volume** — mounted `./data/recordings:/data/recordings:ro` and `./data/replays:/data/replays` in `docker-compose.yml`
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
   /data/recordings/{cameraId}/YYYY-MM-DD_HH-MM-SS.mp4
        ↓
   api/main.py  POST /api/clip
   → FFmpeg concat N segments → trim → /data/clips/replay_{id}.mp4
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

API routes in `api/main.py` — schema auto-created on startup.

---

## Key Files

| File                 | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `api/main.py`        | All backend logic                           |
| `screen/app.js`      | Courtside UI controller (HLS.js, DVR, clip) |
| `screen/index.html`  | Courtside UI layout                         |
| `viewer/index.html`  | Public viewer (session-based)               |
| `recorder/record.sh` | FFmpeg RTSP → 5s MP4 segments               |
| `docker-compose.yml` | Service orchestration                       |
| `mediamtx.yml`       | HLS hub config (segment size, buffer)       |
| `values.yml`         | Future config spec (not yet wired up)       |
| `fake-camera.yml`    | Dev compose override (loops sample.mp4)     |

---

## Known Constraints

- **Latency:** 8–10s current. Target <3s. Cause: standard HLS buffering. Fix: LL-HLS tuning.
- **Fake camera:** Timestamp discontinuities at loop boundaries → playback stalls. Real cameras won't have this.
- **Clip generation:** Synchronous FFmpeg in API thread. Blocks requests during clip. Fix: async task queue.
- **Single camera recorder:** Only `court1_camA` recorded. Must fix before real deployment.
- **Windows dev:** Running on Windows 11. Paths in FFmpeg concat file must use forward slashes (handled via `.as_posix()`).

---

## Docs

Full roadmap: `docs/roadmap.md` | API reference: `docs/api-reference.md` | Services & DB: `docs/services.md` | Workflow: `docs/workflow.md`
