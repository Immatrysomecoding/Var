# CLAUDE.md

> **Living project document.** Every session with Claude should start here.
> Update this file when phases complete, bugs are fixed, or priorities shift.

---

## What Is This

**VAR Basic** — a containerized sports replay system for pickleball courts.

Goal: YouTube-quality live streaming + professional VAR replay, running on a local edge machine at a venue.

Stack: FastAPI · MediaMTX · HLS.js · FFmpeg · SQLite · Docker Compose · Nginx

---

## Current State (as of 2026-03-30)

### What Works

- RTSP ingest via MediaMTX (wildcard paths — any camera stream accepted)
- HLS playback in browser (<3s latency with LL-HLS)
- DVR-style 60s replay window on courtside screen
- **Dynamic camera buttons** loaded from API (not hardcoded HTML)
- **Multi-court field selector** — switch between courts, cameras reload per court
- **PIN lock** on courtside screen (set `access.screen_pin` in values.yml)
- Clip generation via API (FFmpeg concat + trim), async with job polling
- Clip metadata stored in DB + sidecar JSON
- Event logging to SQLite with camera_id
- Public viewer via `/f/{sessionId}` showing venue name, field name, viewer count, clip list
- Fake camera dev mode (looped MP4)
- **All config driven by values.yml** (venue, fields, cameras, PIN)
- **Structured JSON logging** to stdout
- **Disk space warning** if `/data` < 5 GB free

### What Is Broken / Incomplete

| #   | Issue                                               | Severity   | Status | File          |
| --- | --------------------------------------------------- | ---------- | ------ | ------------- |
| 1   | Fake camera pushes `court1_camA` — only cam A works | **MEDIUM** | Known  | `fake-camera.yml` |
| 2   | Viewer counter resets on API restart (in-memory)    | **LOW**    | By design |            |

---

## Roadmap

### Phase 1 — Stabilize ✅ COMPLETE

### Phase 2 — Production Quality ✅ COMPLETE

### Phase 2.5 — Cleanup & Foundation ✅ COMPLETE

### Phase 3 — Platform ✅ COMPLETE

**Goal:** Multi-court, multi-venue, production-deployable.

- [x] **values.yml is now the config source of truth** — venue name, field list, camera list, PIN all come from values.yml; env vars override at deploy time
- [x] **mediamtx wildcard path** — `~.*: {}` accepts any camera stream without pre-registration
- [x] **recorder reads cameras from values.yml** — grep/sed parser in record.sh; falls back to DEFAULT_CAMERAS env var
- [x] **DB migrations** — `fields` table added; `sessions.venue_id`, `events.camera_id`, `cameras.position` added via ALTER TABLE; all existing data preserved
- [x] **venues/fields/cameras seeded from values.yml** on every API startup (upsert, idempotent)
- [x] **GET /api/config** — full venue + field + camera config, pin_required flag
- [x] **GET /api/fields** + **GET /api/fields/{id}** — field + camera list with live streaming status
- [x] **GET /api/cameras/{id}/status** — checks mediamtx API at :9997
- [x] **POST /api/config/verify-pin** — client-side PIN validation
- [x] **GET /api/health/detailed** — mediamtx, cameras, db, disk_free_gb
- [x] **GET /api/clips** — filter by session_id and/or field_id
- [x] **GET /api/session/{id}** — now includes venue_name, field_name, viewer_count
- [x] **POST /api/session/{id}/join** + **/leave** — viewer counter
- [x] **Screen UI dynamic cameras** — buttons loaded from /api/config at startup, offline cameras greyed out
- [x] **Screen UI field selector** — dropdown shown when >1 field; switching reloads cameras + creates new session
- [x] **Screen PIN lock** — overlay shown if `access.screen_pin` set in values.yml; PIN stored in sessionStorage
- [x] **Viewer improvements** — shows venue + field name, viewer count, session clip list
- [x] **Structured JSON logging** — Python logging with JSON formatter on all API output
- [x] **Disk space warning** — logs warning every 30 min if /data < 5 GB free
- [x] **17 integration tests** — all passing, cover all new endpoints
- [x] **tests/smoke_test.sh** — hits every endpoint, prints PASS/FAIL

---

## Architecture (Current)

```
values.yml  ──→  api/config.py  ──→  DB seed (venues/fields/cameras)
                                 └──→  GET /api/config|fields|cameras
                                 └──→  PIN check (screen)

RTSP cameras / fake-camera FFmpeg
        ↓
   MediaMTX (port 8554 RTSP in, 8888 HLS out, 9997 API)
   wildcard path ~.*: {} — accepts any stream
        ↓              ↓
   recorder       HLS stream
   (record.sh,    ↓
   reads cam list screen/app.js  ← loads cameras from /api/config
   from values.yml) viewer/index.html ← shows venue/field/viewers/clips
        ↓
   /data/recordings/{venue_id}/{field_id}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
        ↓
   api/routers/clips.py  POST /api/clip
   → FFmpeg concat → trim → /data/clips/{session_id}/{clip_id}.mp4
                          → /data/clips/{session_id}/{clip_id}.json
```

**Ports:**
| Port | Service |
|------|---------|
| 8000 | API (FastAPI) |
| 8081 | Viewer (spectator) |
| 8082 | Screen (courtside) |
| 8554 | MediaMTX RTSP input |
| 8888 | MediaMTX HLS output |
| 9997 | MediaMTX API (internal) |

---

## Running the System

```bash
# 1. Copy .env.example → .env and set MEDIA_HOST to your LAN IP
cp .env.example .env
# Edit .env: MEDIA_HOST=192.168.1.50

# Dev (fake looped camera)
docker compose -f docker-compose.yml -f fake-camera.yml up --build

# Stop
docker compose -f docker-compose.yml -f fake-camera.yml down

# Production (real cameras)
docker compose up --build

# Run integration tests (local Python, no Docker needed)
python -m pytest tests/ -v

# Smoke test (requires running stack)
sh tests/smoke_test.sh
```

**Test API:**
```powershell
Invoke-RestMethod -Method Get  -Uri http://localhost:8000/api/config
Invoke-RestMethod -Method Get  -Uri http://localhost:8000/api/fields
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/session `
  -ContentType "application/json" `
  -Body '{"field_id":"court-1","stream_path":"court1_camA"}'
```

HLS stream: `http://localhost:8888/{cameraId}/index.m3u8`

---

## Key Files

| File                         | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `values.yml`                 | **Master config** — venue, fields, cameras, PIN       |
| `.env.example`               | Copy to `.env`; set MEDIA_HOST for your network       |
| `api/main.py`                | App init, lifespan (DB seed), middleware, mounts      |
| `api/config.py`              | All config: loads values.yml + env var overrides      |
| `api/database.py`            | DB connection, schema, migrations, cleanup, disk check |
| `api/models.py`              | Pydantic request models                               |
| `api/routers/sessions.py`    | `/api/session` CRUD + join/leave viewer counter       |
| `api/routers/events.py`      | `/api/event` endpoint                                 |
| `api/routers/clips.py`       | `/api/clip` + `/api/clips` endpoints + FFmpeg runner  |
| `api/routers/config_api.py`  | `/api/config`, `/api/fields`, `/api/cameras/{id}/status`, `/api/config/verify-pin` |
| `api/routers/health.py`      | `/api/health` + `/api/health/detailed`                |
| `screen/app.js`              | Courtside UI — dynamic cameras, field selector, PIN   |
| `screen/index.html`          | Courtside UI layout                                   |
| `viewer/index.html`          | Public viewer — venue/field name, viewer count, clips |
| `recorder/record.sh`         | FFmpeg RTSP → 5s MP4 segments; reads cameras from values.yml |
| `docker-compose.yml`         | Service orchestration; mounts values.yml; reads .env  |
| `mediamtx.yml`               | HLS hub config (wildcard path, LL-HLS, API enabled)   |
| `fake-camera.yml`            | Dev compose override (loops sample.mp4 as court1_camA) |
| `tests/conftest.py`          | pytest fixtures (temp DB, in-process ASGI client)     |
| `tests/test_api.py`          | Integration tests (17 tests, all passing)             |
| `tests/smoke_test.sh`        | End-to-end smoke test (curl-based, stack must be up)  |

---

## Known Constraints

- **Fake camera:** Only pushes `court1_camA`. Other cameras show as offline in the UI (expected in dev).
- **Viewer counter:** In-memory dict, resets on API restart.
- **mediamtx camera status:** Only cameras that are actively streaming appear as online.
- **Clip generation:** Runs in thread pool (2 workers). Each clip blocks one worker for several seconds.
- **Windows dev:** Running on Windows 11. Paths in FFmpeg concat file must use forward slashes (handled via `.as_posix()`).
- **PIN security:** PIN lock is accidental-touch prevention only — not authentication.

---

## Docs

Full roadmap: `docs/roadmap.md` | API reference: `docs/api-reference.md` | Services & DB: `docs/services.md`
