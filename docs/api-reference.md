# API Reference

## Endpoints

| Method | Endpoint              | Body                                            | Returns                    |
| ------ | --------------------- | ----------------------------------------------- | -------------------------- |
| GET    | `/api/health`         | —                                               | `{ok: true}`               |
| POST   | `/api/session`        | `{field_id, stream_path}`                       | session metadata + URLs    |
| GET    | `/api/session/{id}`   | —                                               | session metadata + HLS URL |
| POST   | `/api/event`          | `{session_id, event, meta}`                     | `{ok: true}`               |
| POST   | `/api/clip`           | `{field_id, camera_id, seconds, session_id}`    | `{job_id, status}`         |
| GET    | `/api/clip/{job_id}`  | —                                               | job status + clip URL      |

## Clip Workflow (Async)

Clip generation runs in the background. Poll until `status` is `"done"` or `"error"`.

```
POST /api/clip  →  { job_id: "abc123", status: "pending" }
GET  /api/clip/abc123  →  { status: "running" }
GET  /api/clip/abc123  →  { status: "done", clip_url: "http://...", clip_file: "replay_abc123.mp4" }
```

- `seconds` is clamped to 5–60.
- Completed jobs are pruned from memory after 10 minutes.
- Clips are served as static files at `GET /replays/{filename}`.

## POST /api/clip body

| Field        | Type   | Default        | Description                        |
| ------------ | ------ | -------------- | ---------------------------------- |
| `field_id`   | string | required       | Court identifier                   |
| `camera_id`  | string | required       | Camera stream name (e.g. `court1_camA`) |
| `seconds`    | int    | `10`           | Clip duration (5–60s)              |
| `session_id` | string | `"screen-local"` | Session to log clip event against |

## Event types

`open` · `close` · `camera_switch` · `replay_back_5` · `forward_5` · `go_live` · `clip_created`
