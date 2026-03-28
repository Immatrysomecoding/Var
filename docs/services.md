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
```

Indexes: `events(session_id)`, `events(ts)`

Schema auto-created in `api/main.py` on startup. No migrations needed yet.

## Data Volumes

| Host path          | Container path        | Access | Purpose                        |
| ------------------ | --------------------- | ------ | ------------------------------ |
| `./data/meta`      | `/data/meta`          | rw     | SQLite DB                      |
| `./data/recordings`| `/data/recordings`    | ro     | Recorded segments (API reads)  |
| `./data/recordings`| `/data/recordings`    | rw     | Recorded segments (recorder writes) |
| `./data/replays`   | `/data/replays`       | rw     | Generated clip files           |

## Recording

`recorder/record.sh` spawns one `ffmpeg` process per camera in parallel. Each process writes 5-second `.mp4` segments to `/data/recordings/{cameraId}/YYYY-MM-DD_HH-MM-SS.mp4` with infinite reconnect on stream drop.

The API background thread deletes segments older than `RECORDING_TTL_HOURS` (default: 2h) every 30 minutes.
