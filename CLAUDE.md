# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VAR Basic** — a containerized video streaming and replay system for pickleball courts. Cameras push RTSP streams → MediaMTX hub converts to HLS → FastAPI backend handles sessions/clips/events → Nginx serves two web interfaces (courtside screen + public viewer).

## Running the System

```bash
# Start with fake camera (development)
docker compose -f docker-compose.yml -f fake-camera.yml up --build

# Stop
docker compose -f docker-compose.yml -f fake-camera.yml down

# Start with real cameras
docker compose up --build
```

**Service ports:**
- `8000` — API (FastAPI)
- `8081` — Viewer (public spectator interface, accessed via `/f/{sessionId}`)
- `8082` — Screen (courtside display)
- `8554` — MediaMTX RTSP input
- `8888` — MediaMTX HLS output

## Creating a Session (Manual Test)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/session `
  -ContentType "application/json" `
  -Body '{"field_id":"court1","stream_path":"court1_camA"}'
```

HLS stream URL: `http://localhost:8888/{cameraId}/index.m3u8`

## Architecture

```
RTSP cameras / fake-camera FFmpeg
        ↓
   MediaMTX (streaming hub)
    RTSP → HLS segments (2s each)
        ↓              ↓
   recorder       mediamtx HLS
   (record.sh)    (port 8888)
   5-sec .mp4         ↓
   segments       screen/viewer
        ↓          (HLS.js)
   /data/recordings/
        ↓
   api/main.py
   (concat+trim segments → clips)
```

**Key data flows:**
- **Recording:** `recorder/record.sh` runs FFmpeg to save 5-second MP4 segments from RTSP into `/data/recordings/{cameraId}/`
- **Replay (Screen):** `screen/app.js` uses HLS.js DVR mode with a 60s rolling window; seeks by manipulating `hls.currentTime` relative to live edge
- **Clips:** `POST /api/clip` concatenates the latest N segments via FFmpeg concat + trim, saves to `/data/clips/`
- **Events:** Every user action (camera switch, seek, clip) is POSTed to `POST /api/event` and stored in SQLite for future ML use

## Services

| Service | Image | Source |
|---------|-------|--------|
| `mediamtx` | `bluenviron/mediamtx:latest` | `mediamtx.yml` config |
| `api` | Custom Python 3.12 | `api/` |
| `screen` | `nginx:alpine` | `screen/` |
| `viewer` | `nginx:alpine` | `viewer/` |
| `recorder` | `linuxserver/ffmpeg:latest` | `recorder/record.sh` |

## API Endpoints

- `GET /api/health`
- `POST /api/session` — `{field_id, stream_path}` → sessionId + stream URLs
- `GET /api/session/{session_id}`
- `POST /api/event` — `{session_id, event_type, meta}` (event types: `open`, `close`, `camera_switch`, `replay_back_5`, `forward_5`, `go_live`, `clip_created`)
- `POST /api/clip` — `{field_id, camera_id, seconds: 5-60}` → clip URL

## Database

SQLite at `/data/meta/meta.db`. Two tables: `sessions` and `events`. Schema is auto-created in `api/main.py` on startup.

## Configuration

- `values.yml` — comprehensive app config (venue, cameras, replay buffer, storage mode, AI hooks)
- `mediamtx.yml` — HLS segment duration (2s), part duration (200ms), 30-segment buffer, 4 camera paths
- `docker-compose.yml` — `MEDIA_HOST=localhost` (change for phone/remote access)

## Frontend

Both interfaces use vanilla JS + HLS.js (CDN). No build step — static files served directly by Nginx.

`screen/app.js` manages:
- Live edge detection (within 2s of `hls.media.duration`)
- Timeline slider mapped to -60s..0s offset from live edge
- Camera switching with event logging
- Clip creation via API call
