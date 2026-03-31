import time
import uuid
import json
import logging
import subprocess
import concurrent.futures
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from config import MEDIA_HOST, RECORDINGS_ROOT, CLIPS_ROOT, VENUE_ID, FIELD_ID
from database import write_batch, execute
from models import ClipRequest

router = APIRouter()
logger = logging.getLogger(__name__)

_clip_jobs: dict = {}  # job_id -> {status, ts, ...}
_clip_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def _prune_clip_jobs():
    cutoff = time.time() - 600  # keep jobs for 10 minutes
    stale = [jid for jid, job in list(_clip_jobs.items()) if job.get("ts", 0) < cutoff]
    for jid in stale:
        _clip_jobs.pop(jid, None)


def get_latest_segments(camera_id: str, required_seconds: int, field_id: str = FIELD_ID):
    camera_dir = RECORDINGS_ROOT / VENUE_ID / field_id / camera_id
    if not camera_dir.exists():
        return []
    # segments live under date subdirs: camera_dir/YYYY-MM-DD/HH-MM-SS.mp4
    files = sorted(camera_dir.glob("*/*.mp4"))
    if not files:
        return []
    needed_count = max(1, (required_seconds + 4) // 5 + 1)
    return files[-needed_count:]


def _build_concat_file(segment_paths, concat_file_path: Path):
    with concat_file_path.open("w", encoding="utf-8") as f:
        for p in segment_paths:
            f.write(f"file '{p.as_posix()}'\n")


def _ffprobe_duration(file_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def _run_clip_job(job_id: str, req: ClipRequest, seconds: int, segments: list):
    _clip_jobs[job_id] = {"status": "running", "ts": time.time()}
    camera_id = req.camera_id
    clip_id = uuid.uuid4().hex[:10]
    started_at = time.time()

    clip_dir = CLIPS_ROOT / req.session_id
    clip_dir.mkdir(parents=True, exist_ok=True)

    concat_path = clip_dir / f"concat_{clip_id}.txt"
    temp_joined = clip_dir / f"joined_{clip_id}.mp4"
    output_clip = clip_dir / f"{clip_id}.mp4"
    sidecar_path = clip_dir / f"{clip_id}.json"

    _build_concat_file(segments, concat_path)

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(concat_path), "-c", "copy", str(temp_joined)],
            check=True, capture_output=True, text=True,
        )

        total_duration = _ffprobe_duration(temp_joined)
        start_time = max(0, total_duration - seconds)

        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(start_time), "-i", str(temp_joined),
             "-t", str(seconds), "-c:v", "libx264", "-preset", "veryfast",
             "-c:a", "aac", str(output_clip)],
            check=True, capture_output=True, text=True,
        )

        created_at = time.time()
        sidecar = {
            "clip_id": clip_id,
            "session_id": req.session_id,
            "field_id": req.field_id,
            "camera_id": camera_id,
            "duration_sec": seconds,
            "created_at": created_at,
            "trigger_event": None,
            "label": None,
            "confidence": None,
        }
        sidecar_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")

        clip_url = f"http://{MEDIA_HOST}:8000/clips/{req.session_id}/{clip_id}.mp4"

        write_batch([
            (
                "INSERT INTO clips (clip_id, session_id, field_id, camera_id, started_at, "
                "duration_sec, trigger_event, file_path, label, confidence, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (clip_id, req.session_id, req.field_id, camera_id, started_at,
                 seconds, None, str(output_clip), None, None, created_at),
            ),
            (
                "INSERT INTO events (session_id, event_type, ts, camera_id, meta) VALUES (?, ?, ?, ?, ?)",
                (req.session_id, "clip_created", created_at, camera_id, json.dumps({
                    "field_id": req.field_id, "camera_id": camera_id,
                    "seconds": seconds, "clip_id": clip_id,
                })),
            ),
        ])

        _clip_jobs[job_id] = {
            "status": "done",
            "ts": created_at,
            "clip_id": clip_id,
            "clip_url": clip_url,
            "clip_file": f"{clip_id}.mp4",
            "session_id": req.session_id,
            "field_id": req.field_id,
            "camera_id": camera_id,
            "duration_sec": seconds,
            "created_at": created_at,
            "trigger_event": None,
            "label": None,
            "confidence": None,
        }
        logger.info("Clip %s done: %s", clip_id, clip_url)

    except subprocess.CalledProcessError as e:
        err_msg = e.stderr[-2000:] if e.stderr else "ffmpeg failed"
        logger.error("Clip job %s failed: %s", job_id, err_msg)
        _clip_jobs[job_id] = {
            "status": "error",
            "ts": time.time(),
            "error": err_msg,
        }
    finally:
        for p in [concat_path, temp_joined]:
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


@router.post("/api/clip")
def create_clip(req: ClipRequest):
    seconds = max(5, min(req.seconds, 60))
    segments = get_latest_segments(req.camera_id, seconds, req.field_id)
    if not segments:
        raise HTTPException(status_code=404, detail="no recording segments found yet")

    _prune_clip_jobs()
    job_id = uuid.uuid4().hex[:10]
    _clip_jobs[job_id] = {"status": "pending", "ts": time.time()}
    _clip_executor.submit(_run_clip_job, job_id, req, seconds, list(segments))
    return {"job_id": job_id, "status": "pending"}


@router.get("/api/clip/{job_id}")
def get_clip_status(job_id: str):
    job = _clip_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, **job}


@router.get("/api/clips")
def list_clips(session_id: Optional[str] = None, field_id: Optional[str] = None, limit: int = 50):
    """List clips, optionally filtered by session_id and/or field_id."""
    if session_id:
        rows = execute(
            "SELECT clip_id, session_id, field_id, camera_id, started_at, duration_sec, "
            "trigger_event, file_path, label, confidence, created_at "
            "FROM clips WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    elif field_id:
        rows = execute(
            "SELECT clip_id, session_id, field_id, camera_id, started_at, duration_sec, "
            "trigger_event, file_path, label, confidence, created_at "
            "FROM clips WHERE field_id = ? ORDER BY created_at DESC LIMIT ?",
            (field_id, limit),
        ).fetchall()
    else:
        rows = execute(
            "SELECT clip_id, session_id, field_id, camera_id, started_at, duration_sec, "
            "trigger_event, file_path, label, confidence, created_at "
            "FROM clips ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    clips = []
    for row in rows:
        clip_id = row[0]
        sess_id = row[1]
        clips.append({
            "clip_id": clip_id,
            "session_id": sess_id,
            "field_id": row[2],
            "camera_id": row[3],
            "started_at": row[4],
            "duration_sec": row[5],
            "trigger_event": row[6],
            "clip_url": f"http://{MEDIA_HOST}:8000/clips/{sess_id}/{clip_id}.mp4",
            "label": row[8],
            "confidence": row[9],
            "created_at": row[10],
        })
    return {"clips": clips}
