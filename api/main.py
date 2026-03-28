import os
import time
import uuid
import json
import sqlite3
import subprocess
import threading
import concurrent.futures
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DB_PATH = "/data/meta/meta.db"
MEDIA_HOST = os.environ.get("MEDIA_HOST", "localhost")
RECORDINGS_ROOT = Path("/data/recordings")
REPLAYS_ROOT = Path("/data/replays")
RECORDING_TTL_HOURS = int(os.environ.get("RECORDING_TTL_HOURS", "2"))

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
REPLAYS_ROOT.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(DB_PATH, check_same_thread=False)
conn.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    stream_path TEXT NOT NULL,
    created_at REAL NOT NULL
)
""")
conn.execute("""
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    ts REAL NOT NULL,
    meta TEXT
)
""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)")
conn.commit()

def cleanup_old_recordings():
    cutoff = time.time() - RECORDING_TTL_HOURS * 3600
    if RECORDINGS_ROOT.exists():
        for segment in RECORDINGS_ROOT.glob("**/*.mp4"):
            if segment.stat().st_mtime < cutoff:
                try:
                    segment.unlink()
                except Exception:
                    pass

def _cleanup_loop():
    while True:
        try:
            cleanup_old_recordings()
        except Exception:
            pass
        time.sleep(1800)  # run every 30 minutes

threading.Thread(target=_cleanup_loop, daemon=True).start()

_clip_jobs: dict = {}
_clip_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

app = FastAPI(title="VAR Basic API")
app.mount("/replays", StaticFiles(directory=str(REPLAYS_ROOT)), name="replays")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SessionCreateRequest(BaseModel):
    field_id: str
    stream_path: str

class EventRequest(BaseModel):
    session_id: str
    event: str
    meta: dict = {}

class ClipRequest(BaseModel):
    field_id: str
    camera_id: str
    seconds: int = 10
    session_id: str = "screen-local"

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/session")
def create_session(req: SessionCreateRequest):
    session_id = uuid.uuid4().hex[:12]
    created_at = time.time()

    conn.execute(
        "INSERT INTO sessions (session_id, field_id, stream_path, created_at) VALUES (?, ?, ?, ?)",
        (session_id, req.field_id, req.stream_path, created_at)
    )
    conn.commit()

    return {
        "session_id": session_id,
        "field_id": req.field_id,
        "stream_path": req.stream_path,
        "viewer_url": f"http://{MEDIA_HOST}:8081/f/{session_id}"
    }

@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    row = conn.execute(
        "SELECT session_id, field_id, stream_path, created_at FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="session not found")

    _, field_id, stream_path, created_at = row

    return {
        "session_id": session_id,
        "field_id": field_id,
        "stream_path": stream_path,
        "created_at": created_at,
        "stream_url_hls": f"http://{MEDIA_HOST}:8888/{stream_path}/index.m3u8",
        "stream_url_rtsp": f"rtsp://{MEDIA_HOST}:8554/{stream_path}"
    }

@app.post("/api/event")
def log_event(req: EventRequest):
    conn.execute(
        "INSERT INTO events (session_id, event_type, ts, meta) VALUES (?, ?, ?, ?)",
        (req.session_id, req.event, time.time(), json.dumps(req.meta))
    )
    conn.commit()

    return {"ok": True}

def get_latest_segments(camera_id: str, required_seconds: int):
    camera_dir = RECORDINGS_ROOT / camera_id
    if not camera_dir.exists():
      return []

    files = sorted(camera_dir.glob("*.mp4"))
    if not files:
      return []

    # assume 5-second segments for now
    needed_count = max(1, (required_seconds + 4) // 5 + 1)
    return files[-needed_count:]

def build_concat_file(segment_paths, concat_file_path: Path):
    with concat_file_path.open("w", encoding="utf-8") as f:
        for p in segment_paths:
            f.write(f"file '{p.as_posix()}'\n")

def ffprobe_duration(file_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(file_path)
        ],
        capture_output=True,
        text=True,
        check=True
    )
    return float(result.stdout.strip())

def _run_clip_job(job_id: str, req: "ClipRequest", seconds: int, segments: list):
    _clip_jobs[job_id] = {"status": "running"}
    camera_id = req.camera_id
    clip_id = uuid.uuid4().hex[:10]
    concat_path = REPLAYS_ROOT / f"concat_{clip_id}.txt"
    temp_joined = REPLAYS_ROOT / f"joined_{clip_id}.mp4"
    output_clip = REPLAYS_ROOT / f"replay_{clip_id}.mp4"

    build_concat_file(segments, concat_path)

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(concat_path), "-c", "copy", str(temp_joined)],
            check=True, capture_output=True, text=True
        )

        total_duration = ffprobe_duration(temp_joined)
        start_time = max(0, total_duration - seconds)

        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(start_time), "-i", str(temp_joined),
             "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast",
             "-c:a", "aac", str(output_clip)],
            check=True, capture_output=True, text=True
        )

        conn.execute(
            "INSERT INTO events (session_id, event_type, ts, meta) VALUES (?, ?, ?, ?)",
            (req.session_id, "clip_created", time.time(), json.dumps({
                "field_id": req.field_id, "camera_id": camera_id,
                "seconds": seconds, "clip_file": output_clip.name
            }))
        )
        conn.commit()

        _clip_jobs[job_id] = {
            "status": "done",
            "clip_url": f"http://{MEDIA_HOST}:8000/replays/{output_clip.name}",
            "clip_file": output_clip.name,
        }

    except subprocess.CalledProcessError as e:
        _clip_jobs[job_id] = {
            "status": "error",
            "error": e.stderr[-2000:] if e.stderr else "ffmpeg failed",
        }
    finally:
        for p in [concat_path, temp_joined]:
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


@app.post("/api/clip")
def create_clip(req: ClipRequest):
    camera_id = req.camera_id
    seconds = max(5, min(req.seconds, 60))

    segments = get_latest_segments(camera_id, seconds)
    if not segments:
        raise HTTPException(status_code=404, detail="no recording segments found yet")

    job_id = uuid.uuid4().hex[:10]
    _clip_jobs[job_id] = {"status": "pending"}
    _clip_executor.submit(_run_clip_job, job_id, req, seconds, list(segments))

    return {"job_id": job_id, "status": "pending"}


@app.get("/api/clip/{job_id}")
def get_clip_status(job_id: str):
    job = _clip_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, **job}