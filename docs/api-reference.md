# API Reference

## Endpoints

| Method | Endpoint                          | Body                                         | Returns                              |
| ------ | --------------------------------- | -------------------------------------------- | ------------------------------------ |
| GET    | `/api/health`                     | —                                            | `{ok: true}`                         |
| GET    | `/api/health/detailed`            | —                                            | mediamtx, cameras, db, disk status  |
| GET    | `/api/config`                     | —                                            | venue + fields + cameras + pin_required |
| GET    | `/api/fields`                     | —                                            | list of fields with cameras          |
| GET    | `/api/fields/{field_id}`          | —                                            | single field + cameras               |
| GET    | `/api/cameras/{camera_id}/status` | —                                            | `{camera_id, streaming: bool}`       |
| POST   | `/api/config/verify-pin`          | `{pin}`                                      | `{ok: bool}`                         |
| POST   | `/api/session`                    | `{field_id, stream_path}`                    | session metadata + URLs              |
| GET    | `/api/session/{id}`               | —                                            | session + venue/field names + viewer_count |
| POST   | `/api/session/{id}/join`          | —                                            | `{session_id, viewer_count}`         |
| POST   | `/api/session/{id}/leave`         | —                                            | `{session_id, viewer_count}`         |
| POST   | `/api/event`                      | `{session_id, event, camera_id?, meta}`      | `{ok: true}`                         |
| POST   | `/api/clip`                       | `{field_id, camera_id, seconds, session_id}` | `{job_id, status}`                   |
| GET    | `/api/clip/{job_id}`              | —                                            | job status + sidecar fields          |
| GET    | `/api/clips`                      | `?session_id=&field_id=&limit=`              | `{clips: [...]}`                     |

## GET /api/health/detailed

```json
{
  "ok": true,
  "mediamtx": true,
  "cameras": [{"id": "court1_camA", "field_id": "court-1", "streaming": true}],
  "db": true,
  "disk_free_gb": 42.5
}
```

## GET /api/config

```json
{
  "venue_id": "playground-hcm-01",
  "venue_name": "Playground Pickleball",
  "fields": [
    {
      "field_id": "court-1",
      "name": "Court 1",
      "cameras": [
        {"camera_id": "court1_camA", "name": "Baseline A", "position": "baseline-a", "streaming": true}
      ]
    }
  ],
  "pin_required": false
}
```

## Clip Workflow (Async)

Clip generation runs in the background. Poll until `status` is `"done"` or `"error"`.

```
POST /api/clip  →  { job_id: "abc123", status: "pending" }
GET  /api/clip/abc123  →  { status: "running" }
GET  /api/clip/abc123  →  { status: "done", clip_url: "http://...", clip_id: "...", duration_sec: 10, ... }
```

- `seconds` is clamped to 5–60.
- Completed jobs are pruned from memory after 10 minutes.
- Clips are served at `GET /clips/{session_id}/{clip_id}.mp4`.

## POST /api/clip body

| Field        | Type   | Default          | Description                        |
| ------------ | ------ | ---------------- | ---------------------------------- |
| `field_id`   | string | required         | Court identifier                   |
| `camera_id`  | string | required         | Camera stream name                 |
| `seconds`    | int    | `10`             | Clip duration (5–60s)              |
| `session_id` | string | `"screen-local"` | Session to log clip event against  |

## GET /api/clips query params

| Param        | Type   | Description                          |
| ------------ | ------ | ------------------------------------ |
| `session_id` | string | Filter by session                    |
| `field_id`   | string | Filter by field                      |
| `limit`      | int    | Max results (default 50)             |

## Event types

`open` · `close` · `camera_switch` · `replay_back_5` · `forward_5` · `go_live` · `clip_created` · `smoke_test`
