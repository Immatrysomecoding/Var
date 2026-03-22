# CLAUDE.md

> **Living project document.** Every session with Claude should start here.
> Update this file when phases complete, bugs are fixed, or priorities shift.

---

## What Is This

**VAR Basic** — a containerized sports replay system for pickleball courts.

Goal: YouTube-quality live streaming + professional VAR replay, running on a local edge machine at a venue.

```
RTSP Cameras → MediaMTX → HLS → Browser (Screen/Viewer)
                    ↓
               Recorder → 5s MP4 segments
                    ↓
               API → FFmpeg concat → Clips
```

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
| 11  | No retry/error recovery in viewer if HLS stalls                     | **LOW**      | ❌ Pending | `viewer/index.html`                  |
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

---

### Phase 2 — Production Quality

**Goal:** Smooth streaming, polished UI/UX, reliable under real conditions.

#### Streaming & Latency

- [ ] Enable **LL-HLS** (Low-Latency HLS) in MediaMTX — `hlsPartDuration: 200ms` is already set, needs browser-side tuning
- [ ] Tune HLS.js: `lowLatencyMode: true`, `liveSyncDurationCount: 2`, `liveMaxLatencyDurationCount: 4`
- [ ] Add **latency indicator** to screen UI (current lag from live edge)
- [ ] Test and tune for **<3s latency** target

#### Screen UI/UX

- [ ] **"Seconds behind live"** display — show offset from live edge in real time
- [ ] **Clip duration selector** — let operator choose 5s / 10s / 15s / 30s before clipping
- [ ] **Clip preview** — show generated clip inline after creation
- [ ] **Clip download button** — direct download link
- [ ] **Replay speed control** — 0.5×, 0.25× slow motion (HTML5 `video.playbackRate`)
- [ ] **Auto-refresh on stream loss** — detect HLS error, retry with backoff
- [ ] **Camera labels** — configurable names (e.g. "Baseline", "Net", "Side") instead of Cam A/B/C/D
- [ ] **Full-screen mode** — single click goes fullscreen
- [ ] **Keyboard shortcuts** — space=play/pause, left/right=5s seek, L=go live, C=clip

#### Viewer UI/UX

- [ ] **QR code on screen** — show QR for current session URL so spectators can scan
- [ ] **Viewer count** — show how many are watching (basic event count)
- [ ] **Loading / buffering state** — better spinner and error messages
- [ ] **Mobile-responsive layout** — test on phone, fix padding/font sizes

#### Reliability

- [ ] **Health checks** in `docker-compose.yml` for all services
- [ ] **API error handling** — proper 4xx/5xx with meaningful messages
- [ ] **Async clip generation** — offload FFmpeg to background task, return job ID, poll for completion
- [ ] **Resource limits** — set memory/CPU limits in docker-compose for stability

---

### Phase 3 — Platform

**Goal:** Multi-court, multi-venue, production-deployable.

#### Multi-Court Support

- [ ] Dynamic camera/field config loaded from `values.yml` (or DB)
- [ ] Recorder scales per camera (Docker Compose `deploy.replicas` or separate services)
- [ ] Screen UI loads camera list from API instead of hardcoded HTML
- [ ] Session links to specific court + cameras

#### Access & Auth

- [ ] **PIN-based screen lock** — prevent spectators from touching courtside screen
- [ ] **Viewer-only public URLs** — session links are read-only
- [ ] **Admin panel** — basic management UI for sessions, clips, cameras
- [ ] Optional: simple token auth on API for multi-venue deployments

#### Storage

- [ ] **Configurable storage backends** — local disk (default), NAS, S3
- [ ] **Clip archival** — retain important clips, auto-delete raw segments
- [ ] **Session export** — zip clips + events for a session

#### Deployment

- [ ] **`MEDIA_HOST` auto-detection** — detect LAN IP at startup for zero-config local deployment
- [ ] **One-command setup** — `./setup.sh` that configures `values.yml` and starts the stack
- [ ] **Reverse proxy config** — Nginx or Caddy for HTTPS + single domain
- [ ] **Portability** — test on Raspberry Pi 5 / mini PC (ARM builds)

---

### Phase 4 — AI Integration

**Goal:** Automatic highlights, officiating assistance, training data pipeline.

#### Clip Intelligence

- [ ] **Auto-event detection** — detect rallies, faults, let calls from audio (volume spike) or motion (frame diff)
- [ ] **Auto-clip on event** — trigger clip generation automatically when event detected
- [ ] **Clip tagging UI** — label clips: "fault", "highlight", "disputed", "winner"
- [ ] **Export labeled clips** — structured dataset (video + label + timestamp) for ML training

#### AI Officiating (V2)

- [ ] **Ball tracking** — detect ball in/out using computer vision (YOLO or custom model)
- [ ] **Line call assist** — overlay "IN" / "OUT" prediction on replay
- [ ] **Confidence score** — show model confidence so referee makes final call
- [ ] **Disputed point review** — flag clip for review, show multiple angles

#### Analytics

- [ ] **Shot heatmaps** — where balls land on court
- [ ] **Player position tracking** — basic skeleton detection
- [ ] **Match stats** — rally length, shot count, fault rate
- [ ] **Event timeline** — visual event log per match

#### Training Data Pipeline

- [ ] SQLite events → labeled video clip dataset
- [ ] Clip storage with metadata (camera angle, court position, player IDs)
- [ ] Export in COCO / custom JSON format for model training
- [ ] Integration hook for external ML inference service

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

---

## Services

| Service    | Image                        | Purpose                 |
| ---------- | ---------------------------- | ----------------------- |
| `mediamtx` | `bluenviron/mediamtx:latest` | RTSP → HLS hub          |
| `api`      | Python 3.12 (custom)         | Sessions, events, clips |
| `screen`   | `nginx:alpine`               | Courtside display       |
| `viewer`   | `nginx:alpine`               | Public spectator        |
| `recorder` | `linuxserver/ffmpeg:latest`  | RTSP → 5s MP4 segments  |

---

## API Reference

| Method | Endpoint            | Body                             | Returns                 |
| ------ | ------------------- | -------------------------------- | ----------------------- |
| GET    | `/api/health`       | —                                | status                  |
| POST   | `/api/session`      | `{field_id, stream_path}`        | session_id, stream URLs |
| GET    | `/api/session/{id}` | —                                | session metadata        |
| POST   | `/api/event`        | `{session_id, event_type, meta}` | ok                      |
| POST   | `/api/clip`         | `{field_id, camera_id, seconds}` | clip URL                |

**Event types:** `open` · `close` · `camera_switch` · `replay_back_5` · `forward_5` · `go_live` · `clip_created`

---

## Database

SQLite at `/data/meta/meta.db`

```sql
sessions(session_id, field_id, stream_path, created_at)
events(id, session_id, event_type, ts, meta)
```

Schema auto-created in `api/main.py` on startup. No migrations yet.

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

## Task Tracking Doc

Google Doc: https://docs.google.com/document/d/1S01zXphTJm4g9bAP_krcapi_8mYwpPtN7A6rjE8IN5k/edit
When asked to sync progress, check the repo state and update the doc accordingly.
