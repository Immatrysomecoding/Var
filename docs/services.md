# Services & Database

## Services

| Service    | Image                        | Port(s)          | Purpose                  |
| ---------- | ---------------------------- | ---------------- | ------------------------ |
| `mediamtx` | `bluenviron/mediamtx:latest` | 8554, 8888       | RTSP → HLS hub           |
| `api`      | Python 3.12 (custom)         | 8000             | Sessions, events, clips  |
| `screen`   | `nginx:alpine`               | 8082             | Courtside display        |
| `viewer`   | `nginx:alpine`               | 8081             | Public spectator         |
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
sessions(session_id TEXT PRIMARY KEY, field_id TEXT, stream_path TEXT, created_at REAL)
events(id INTEGER PRIMARY KEY, session_id TEXT, event_type TEXT, ts REAL, meta TEXT)
clips(clip_id TEXT PRIMARY KEY, session_id TEXT, field_id TEXT, camera_id TEXT,
      started_at REAL, duration_sec INTEGER, trigger_event TEXT, file_path TEXT,
      label TEXT, confidence REAL, created_at REAL)
cameras(camera_id TEXT PRIMARY KEY, field_id TEXT, venue_id TEXT, name TEXT, rtsp_url TEXT, enabled INTEGER)
venues(venue_id TEXT PRIMARY KEY, name TEXT, location TEXT, created_at REAL)
```

Indexes: `events(session_id)`, `events(ts)`, `clips(session_id)`, `clips(field_id)`, `clips(label)`, `clips(created_at)`

Schema auto-created in `api/database.py` on startup. Writes protected by `threading.Lock()`.

## Data Volumes

| Host path           | Container path      | Access | Purpose                              |
| ------------------- | ------------------- | ------ | ------------------------------------ |
| `./data/meta`       | `/data/meta`        | rw     | SQLite DB                            |
| `./data/recordings` | `/data/recordings`  | ro     | Recorded segments (API reads)        |
| `./data/recordings` | `/data/recordings`  | rw     | Recorded segments (recorder writes)  |
| `./data/clips`      | `/data/clips`       | rw     | Generated clips + sidecar JSON       |

## Recording

`recorder/record.sh` spawns one `ffmpeg` process per camera in parallel. Each process writes 5-second `.mp4` segments to:

```
/data/recordings/{VENUE_ID}/{FIELD_ID}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
```

`VENUE_ID` and `FIELD_ID` are read from environment variables (default: `playground-hcm-01` / `court-1`).

The API background thread (in `database.py`) deletes segments older than `RECORDING_TTL_HOURS` (default: 2h) every 30 minutes.

## Clips

After a clip job completes, two files are written:

```
/data/clips/{session_id}/{clip_id}.mp4    ← encoded clip
/data/clips/{session_id}/{clip_id}.json   ← sidecar metadata
```

A row is also inserted into the `clips` table. Clips are served as static files at `http://host:8000/clips/{session_id}/{clip_id}.mp4`.
