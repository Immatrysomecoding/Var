# Roadmap

## Phase 1 — Stabilize ✅ COMPLETE

**Goal:** System works reliably, accessible from phone on local network.

- [x] Fix API volume mounts for recordings and replays
- [x] Fix remote access — `MEDIA_HOST` resolved from `window.location.hostname` in all UIs
- [x] Fix session ID in clip event log
- [x] Multi-camera recorder — parallel ffmpeg for all cameras
- [x] Recorder reconnect — infinite retry with reconnect flags
- [x] DB indexes on `events(session_id)` and `events(ts)`
- [x] Recording cleanup — background thread, 2h TTL, runs every 30 min

---

## Phase 2 — Production Quality ✅ COMPLETE

**Goal:** Smooth streaming, polished UI/UX, reliable under real conditions.

- [x] Enable **LL-HLS** — `hlsPartDuration: 200ms` in `mediamtx.yml`
- [x] Tune HLS.js — `lowLatencyMode: true`, `liveSyncDurationCount: 2`
- [x] **"Seconds behind live"** — offset from live edge shown in timeline label
- [x] **Clip duration selector** — 5s / 10s / 15s / 30s buttons
- [x] **Clip preview** — clip opens in new tab when ready
- [x] **Auto-refresh on stream loss** — fatal HLS error triggers reconnect
- [x] **QR code** — generated after session init, shows spectator URL
- [x] **Keyboard shortcuts** — Space=play/pause, ←/→=5s seek, L=go live, C=clip
- [x] **Health checks** in `docker-compose.yml` for all services
- [x] **Resource limits** — memory + CPU caps on all containers
- [x] **Async clip generation** — FFmpeg runs in thread pool, returns `job_id`
- [x] **Clip job cleanup** — jobs pruned after 10 minutes

---

## Phase 2.5 — Cleanup & Foundation ✅ COMPLETE

**Goal:** Prepare codebase for multi-court (Phase 3) and AI training data (Phase 4).

- [x] **DB schema expanded** — added `clips`, `cameras`, `venues` tables + 4 indexes on `clips`
- [x] **Clip path restructured** — `/data/clips/{session_id}/{clip_id}.mp4` + sidecar JSON
- [x] **Recording path restructured** — `/data/recordings/{venue_id}/{field_id}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4`
- [x] **API split into routers** — `config.py`, `database.py`, `models.py`, `routers/{sessions,events,clips}.py`
- [x] **Config wired via env vars**
- [x] **SQLite concurrency fixed** — `threading.Lock()` on all writes
- [x] **Integration tests** — 7 tests in `tests/test_api.py`, all passing

---

## Phase 3 — Platform ✅ COMPLETE

**Goal:** Multi-court, multi-venue, production-deployable.

- [x] **values.yml is config source of truth** — venue, fields, cameras, PIN read from values.yml; env vars override
- [x] **mediamtx wildcard path** — any camera stream accepted without pre-registration
- [x] **recorder reads cameras from values.yml** — grep/sed parser, env var fallback
- [x] **DB migrations** — `fields` table; `sessions.venue_id`, `events.camera_id`, `cameras.position` added
- [x] **Venues/fields/cameras seeded from values.yml** on startup (upsert, idempotent)
- [x] **GET /api/config** — venue + field + camera config, `pin_required` flag
- [x] **GET /api/fields** + **GET /api/fields/{id}** — with live streaming status per camera
- [x] **GET /api/cameras/{id}/status** — mediamtx API check
- [x] **GET /api/health/detailed** — mediamtx, cameras, db, disk_free_gb
- [x] **GET /api/clips** — filterable by session_id / field_id
- [x] **POST /api/session/{id}/join** + **/leave** — viewer counter
- [x] **GET /api/session/{id}** — now returns venue_name, field_name, viewer_count
- [x] **POST /api/config/verify-pin** — PIN validation
- [x] **Screen UI: dynamic cameras** — buttons loaded from API, offline cameras greyed
- [x] **Screen UI: multi-court field selector** — dropdown when >1 field
- [x] **Screen PIN lock** — overlay if `access.screen_pin` set; sessionStorage token
- [x] **Viewer: venue/field display** — shows venue + court name in title
- [x] **Viewer: viewer count** — join on load, leave on beforeunload
- [x] **Viewer: session clip list** — shows all clips for the session
- [x] **JSON structured logging** — all API logs output as JSON to stdout
- [x] **Disk space warning** — logs warning every 30 min if < 5 GB free
- [x] **.env.example** created; docker-compose reads .env for MEDIA_HOST etc.
- [x] **17 integration tests** — all passing
- [x] **tests/smoke_test.sh** — curl-based end-to-end smoke test

---

## Phase 4 — AI Integration

**Goal:** Automatic highlights, officiating assistance, training data pipeline.

#### Clip Intelligence

- [ ] **Auto-event detection** — detect rallies, faults, let calls from audio or motion
- [ ] **Auto-clip on event** — trigger clip generation automatically when event detected
- [ ] **Clip tagging UI** — label clips: "fault", "highlight", "disputed", "winner"
- [ ] **Export labeled clips** — structured dataset for ML training

#### AI Officiating (V2)

- [ ] **Ball tracking** — detect ball in/out using computer vision
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
