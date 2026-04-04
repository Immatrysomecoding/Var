# Services & Database

## Services

| Service    | Image                        | Port(s)          | Purpose                  |
| ---------- | ---------------------------- | ---------------- | ------------------------ |
| `mediamtx` | `bluenviron/mediamtx:latest` | 8554, 8888, 9997 | RTSP → HLS hub + API     |
| `api`      | Python 3.12 (custom)         | 8000             | Sessions, events, clips  |
| `screen`   | `nginx:alpine`               | 8082             | Courtside display — 4-cam grid, timeline overlay, pill controls, QR |
| `viewer`   | `nginx:alpine`               | 8081             | Public spectator — light theme, pulse viewer count, share button     |
| `recorder` | `linuxserver/ffmpeg:latest`  | —                | RTSP → 5s MP4 segments   |

All services have health checks and memory/CPU resource limits defined in `docker-compose.yml`.

## Resource Limits

| Service    | Memory | CPU  |
| ---------- | ------ | ---- |
| `mediamtx` | 256M   | 0.5  |
| `api`      | 512M   | 1.0  |
| `screen`   | 64M    | 0.1  |
| `viewer`   | 64M    | 0.1  |
| `recorder` | 512M   | 1.0  |

## Database

SQLite at `/data/meta/meta.db`

```sql
venues(venue_id TEXT PRIMARY KEY, name TEXT, location TEXT, created_at REAL)
fields(field_id TEXT PRIMARY KEY, venue_id TEXT, name TEXT, created_at REAL)
sessions(session_id TEXT PRIMARY KEY, field_id TEXT, venue_id TEXT, stream_path TEXT, created_at REAL)
events(id INTEGER PRIMARY KEY, session_id TEXT, event_type TEXT, ts REAL, camera_id TEXT, meta TEXT)
clips(clip_id TEXT PRIMARY KEY, session_id TEXT, field_id TEXT, camera_id TEXT,
      started_at REAL, duration_sec INTEGER, trigger_event TEXT, file_path TEXT,
      label TEXT, confidence REAL, created_at REAL)
cameras(camera_id TEXT PRIMARY KEY, field_id TEXT, venue_id TEXT, name TEXT,
        rtsp_url TEXT, position TEXT, enabled INTEGER)
```

Indexes: `events(session_id)`, `events(ts)`, `clips(session_id)`, `clips(field_id)`, `clips(label)`, `clips(created_at)`

Schema auto-created in `api/database.py` on startup. Migrations via `ALTER TABLE ADD COLUMN` (idempotent). Writes protected by `threading.Lock()`.

Seed: `venues`, `fields`, and `cameras` are upserted from `values.yml` on every startup.

## Data Volumes

| Host path           | Container path      | Access | Purpose                              |
| ------------------- | ------------------- | ------ | ------------------------------------ |
| `./data/meta`       | `/data/meta`        | rw     | SQLite DB                            |
| `./data/recordings` | `/data/recordings`  | ro     | Recorded segments (API reads)        |
| `./data/recordings` | `/data/recordings`  | rw     | Recorded segments (recorder writes)  |
| `./data/clips`      | `/data/clips`       | rw     | Generated clips + sidecar JSON       |
| `./values.yml`      | `/values.yml`       | ro     | Config (api + recorder)              |

## Recording

`recorder/record.sh` reads the camera list from `/values.yml` using grep/sed. Falls back to the `DEFAULT_CAMERAS` env var. Spawns one `ffmpeg` process per camera in parallel. Each process writes 5-second `.mp4` segments to:

```
/data/recordings/{VENUE_ID}/{FIELD_ID}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
```

The API background thread (in `database.py`) deletes segments older than `RECORDING_TTL_HOURS` (default: 2h) every 30 minutes, and logs a warning if disk space on `/data` drops below 5 GB.

## Clips

After a clip job completes, two files are written:

```
/data/clips/{session_id}/{clip_id}.mp4    ← encoded clip
/data/clips/{session_id}/{clip_id}.json   ← sidecar metadata
```

A row is also inserted into the `clips` table. Clips are served as static files at `http://host:8000/clips/{session_id}/{clip_id}.mp4`.

## Frontend UI

### Courtside screen (port 8082)

- URL param `?court=<fieldId>` locks screen to one court; field selector hidden
- All camera buttons loaded from `GET /api/config` at startup
- Main feed streams HLS; thumbnails are static dark tiles (no extra HLS instances)
- Timeline scrubber is overlaid on video (`position: absolute`)
- QR code is `position: absolute; bottom/right` inside `.app` — always visible
- PIN overlay shown if `access.screen_pin` is set in `values.yml`

### Spectator viewer (port 8081)

- Accessed via `/f/{sessionId}` (or `?id=` query param)
- Light theme: `#f8f7f4` background, white cards
- Calls `POST /api/session/{id}/join` on load, `POST /leave` on `beforeunload`
- Share button uses `navigator.share` on mobile; falls back to clipboard copy
- Clips rendered as horizontal scroll cards, each opening `clip_url` in new tab

---

## Config System

`values.yml` is the master config file. `api/config.py` loads it with PyYAML at startup:

- `deployment.locationId` → `VENUE_ID`
- `deployment.venueName` → `VENUE_NAME`
- `deployment.defaultFieldId` → `FIELD_ID`
- `fields[].fieldId` + `fields[].cameras[].cameraId` → `FIELDS` list
- `access.screen_pin` → `SCREEN_PIN` (None if unset)

Environment variables always override values.yml. Docker reads from `.env` file (copy `.env.example`).
