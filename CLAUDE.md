# CLAUDE.md

> **Living project document.** Every session with Claude should start here.
> Update this file when phases complete, bugs are fixed, or priorities shift.

---

## What Is This

**VAR Basic** — a containerized sports replay system for pickleball courts.

Goal: YouTube-quality live streaming + professional VAR replay, running on a local edge machine at a venue.

Stack: FastAPI · MediaMTX · HLS.js · FFmpeg · SQLite · Docker Compose · Nginx · React (Lavaro UI)

---

## Current State (as of 2026-05-13)

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
- **Lavaro UI** — production-grade React frontend (replaces old plain HTML screens)

### What Is Broken / Incomplete

| #   | Issue                                               | Severity   | Status    | File              |
| --- | --------------------------------------------------- | ---------- | --------- | ----------------- |
| 1   | Fake camera pushes `court1_camA` — only cam A works | **MEDIUM** | Known     | `fake-camera.yml` |
| 2   | Viewer counter resets on API restart (in-memory)    | **LOW**    | By design |                   |
| 3   | Score not synced to backend — local state only      | **LOW**    | By design | No score API yet  |

---

## Roadmap

### Phase 1 — Stabilize ✅ COMPLETE

### Phase 2 — Production Quality ✅ COMPLETE

### Phase 2.5 — Cleanup & Foundation ✅ COMPLETE

### Phase 3 — Platform ✅ COMPLETE

### Phase 3.1 — UI/UX ✅ COMPLETE

### Phase 3.2 — Lavaro UI ✅ COMPLETE

**Goal:** Replace plain HTML screens with a branded, production-grade React UI that integrates fully with the VAR backend.

- [x] **Landing page** — shown on the physical court monitor; single "Enter Courtside" button; no spectator entry
- [x] **Courtside interface** at `/courtside` — full operator view integrated with API
- [x] **Spectator view** at `/f/:sessionId` — direct URL (no landing page), accessed by scanning QR
- [x] **Real HLS video** — HLS.js player connected to MediaMTX streams
- [x] **Timeline scrubber** — syncs to actual HLS DVR position; seeks real video
- [x] **Camera grid from API** — cameras loaded from `GET /api/config`; online/offline polled every 15s
- [x] **Field selector** — dropdown shown when venue has multiple courts
- [x] **PIN overlay** — calls `POST /api/config/verify-pin`; result stored in sessionStorage
- [x] **Session lifecycle** — `POST /api/session` on field select; join/leave on spectator entry/exit
- [x] **Real clip saving** — `POST /api/clip` with real session_id, camera_id, offset, duration
- [x] **Clip history** — `GET /api/clips?session_id=...`; auto-refreshes every 15s; animated on new entry
- [x] **Real QR code** — generated from `/f/{sessionId}` URL using qrcode.react
- [x] **System status strip** — mediamtx health + disk space from `GET /api/health/detailed`
- [x] **Score widget** — local state with Framer Motion pulse animation + Akira Expanded font
- [x] **Lavaro brand** — exact hex palette, Unbounded + Akira Expanded fonts, breathing dots, shimmer states
- [x] **17 integration tests** — all passing after UI changes

---

## Architecture (Current)

```
values.yml  ──→  api/config.py  ──→  DB seed (venues/fields/cameras)
                                 └──→  GET /api/config|fields|cameras
                                 └──→  PIN check

RTSP cameras / fake-camera FFmpeg
        ↓
   MediaMTX (port 8554 RTSP in, 8888 HLS out, 9997 API)
   wildcard path ~.*: {} — accepts any stream
        ↓
   HLS stream ──→  Lavaro UI (React, port 3000)
                   ├── /            Landing page (court monitor)
                   ├── /courtside   Operator interface
                   └── /f/:id       Spectator view (QR entry)

   recorder (record.sh) reads cameras from values.yml
        ↓
   /data/recordings/{venue_id}/{field_id}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
        ↓
   api/routers/clips.py  POST /api/clip
   → FFmpeg concat → trim → /data/clips/{session_id}/{clip_id}.mp4
```

**Ports:**
| Port | Service |
|------|---------|
| 8000 | API (FastAPI) |
| 3000 | Lavaro UI (React / Vite dev server) |
| 8081 | Legacy viewer HTML (still served by Nginx, now superseded) |
| 8082 | Legacy screen HTML (still served by Nginx, now superseded) |
| 8554 | MediaMTX RTSP input |
| 8888 | MediaMTX HLS output |
| 9997 | MediaMTX API (internal) |

---

## Running the System

### 1. Start / Stop (daily use)

```
on.bat    ← double-click when customer arrives
off.bat   ← double-click when done
```

Both files are in the project root. `on.bat` starts the Docker backend and the Lavaro UI server. `off.bat` stops everything.

> **First-time setup only:**
> ```bash
> cp .env.example .env
> # Edit .env: set MEDIA_HOST to your LAN IP (e.g. 192.168.1.50)
>
> cd lavaro-ui-mockup
> pnpm install        # install UI dependencies once
> cp .env.example .env
> # Edit lavaro-ui-mockup/.env: set VITE_MEDIA_HOST to same LAN IP
> ```

### 3. How to check the UI

| What to check | URL |
|---------------|-----|
| Landing page (court monitor view) | `http://localhost:3000/` |
| Courtside operator interface | `http://localhost:3000/courtside` |
| Spectator view (replace ID) | `http://localhost:3000/f/{sessionId}` |
| Get a real session ID | See PowerShell command below |

**Get a session ID to test the spectator view:**
```powershell
# Creates a session and returns the session_id
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/session `
  -ContentType "application/json" `
  -Body '{"field_id":"court-1","stream_path":"court1_camA"}'
# Copy the session_id value, then open:
# http://localhost:3000/f/{session_id}
```

**Test API directly:**
```powershell
Invoke-RestMethod -Method Get  -Uri http://localhost:8000/api/config
Invoke-RestMethod -Method Get  -Uri http://localhost:8000/api/fields
Invoke-RestMethod -Method Get  -Uri http://localhost:8000/api/health/detailed
```

### 4. Run tests

```bash
# Integration tests (no Docker needed)
python -m pytest tests/ -v

# Smoke test (requires Docker stack running)
sh tests/smoke_test.sh
```

**Expected result:** `17 passed` — all green.

---

## Key Files

### Backend

| File                        | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `values.yml`                | **Master config** — venue, fields, cameras, PIN                                    |
| `.env.example`              | Copy to `.env`; set MEDIA_HOST for your network                                    |
| `api/main.py`               | App init, lifespan (DB seed), middleware, mounts                                   |
| `api/config.py`             | All config: loads values.yml + env var overrides                                   |
| `api/database.py`           | DB connection, schema, migrations, cleanup, disk check                             |
| `api/models.py`             | Pydantic request models                                                            |
| `api/routers/sessions.py`   | `/api/session` CRUD + join/leave viewer counter                                    |
| `api/routers/events.py`     | `/api/event` endpoint                                                              |
| `api/routers/clips.py`      | `/api/clip` + `/api/clips` endpoints + FFmpeg runner                               |
| `api/routers/config_api.py` | `/api/config`, `/api/fields`, `/api/cameras/{id}/status`, `/api/config/verify-pin` |
| `api/routers/health.py`     | `/api/health` + `/api/health/detailed`                                             |
| `recorder/record.sh`        | FFmpeg RTSP → 5s MP4 segments; reads cameras from values.yml                       |
| `docker-compose.yml`        | Service orchestration; mounts values.yml; reads .env                               |
| `mediamtx.yml`              | HLS hub config (wildcard path, LL-HLS, API enabled)                                |
| `fake-camera.yml`           | Dev compose override (loops sample.mp4 as court1_camA)                             |
| `tests/conftest.py`         | pytest fixtures (temp DB, in-process ASGI client)                                  |
| `tests/test_api.py`         | Integration tests (17 tests, all passing)                                          |
| `tests/smoke_test.sh`       | End-to-end smoke test (curl-based, stack must be up)                               |

### Lavaro UI (`lavaro-ui-mockup/`)

| File                                      | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `client/src/pages/Home.tsx`               | Landing page — court monitor entry, Courtside button only       |
| `client/src/pages/Courtside.tsx`          | Operator interface — cameras, video, score, clips, QR           |
| `client/src/pages/Spectator.tsx`          | Spectator view — loaded via QR scan at `/f/:sessionId`          |
| `client/src/lib/api.ts`                   | Typed API client — all fetch calls to FastAPI backend           |
| `client/src/hooks/useHlsPlayer.ts`        | HLS.js player hook — attach/detach, DVR seek, live edge detect  |
| `client/src/hooks/useScoreAnimation.ts`   | Score pulse animation trigger (Framer Motion)                   |
| `client/src/hooks/useClipSave.ts`         | 3-state clip save machine (idle → saving → saved)               |
| `client/src/components/BreathingDot.tsx`  | Animated breathing status dot (live/recording indicators)       |
| `client/src/index.css`                    | Brand tokens, Unbounded + Akira Expanded fonts, keyframes       |
| `.env.example`                            | UI env vars: VITE_API_BASE_URL, VITE_MEDIA_HOST                 |

### Legacy (still functional, superseded by Lavaro UI)

| File                  | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `screen/index.html`   | Old plain-HTML courtside screen (port 8082)    |
| `screen/app.js`       | Old courtside JS — camera switching, HLS, clips|
| `viewer/index.html`   | Old plain-HTML spectator viewer (port 8081)    |

---

## Known Constraints

- **Fake camera:** Only pushes `court1_camA`. Other cameras show as offline (expected in dev).
- **Viewer counter:** In-memory dict, resets on API restart.
- **mediamtx camera status:** Only actively streaming cameras appear online.
- **Clip generation:** Runs in thread pool (2 workers). Each clip blocks one worker for several seconds.
- **Windows dev:** Running on Windows 11. FFmpeg concat paths use forward slashes (handled via `.as_posix()`).
- **PIN security:** PIN lock is accidental-touch prevention only — not authentication.
- **Score:** Scoreboard is local React state only — not persisted or synced via API.
- **Lavaro UI dev server:** Runs separately from Docker on port 3000. In production, build with `pnpm build` and serve `dist/public/` via Nginx.

---

## Docs

Full roadmap: `docs/roadmap.md` | API reference: `docs/api-reference.md` | Services & DB: `docs/services.md`
