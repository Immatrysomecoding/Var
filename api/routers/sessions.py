import time
import uuid

from fastapi import APIRouter, HTTPException

from config import MEDIA_HOST
from database import execute, write
from models import SessionCreateRequest

router = APIRouter()


@router.post("/api/session")
def create_session(req: SessionCreateRequest):
    session_id = uuid.uuid4().hex[:12]
    created_at = time.time()
    write(
        "INSERT INTO sessions (session_id, field_id, stream_path, created_at) VALUES (?, ?, ?, ?)",
        (session_id, req.field_id, req.stream_path, created_at),
    )
    return {
        "session_id": session_id,
        "field_id": req.field_id,
        "stream_path": req.stream_path,
        "viewer_url": f"http://{MEDIA_HOST}:8081/f/{session_id}",
    }


@router.get("/api/session/{session_id}")
def get_session(session_id: str):
    row = execute(
        "SELECT session_id, field_id, stream_path, created_at FROM sessions WHERE session_id = ?",
        (session_id,),
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
        "stream_url_rtsp": f"rtsp://{MEDIA_HOST}:8554/{stream_path}",
    }
