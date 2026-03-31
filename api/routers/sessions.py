import time
import uuid
import logging

from fastapi import APIRouter, HTTPException

from config import MEDIA_HOST, VENUE_ID
from database import execute, write
from models import SessionCreateRequest

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory viewer counter: session_id -> count
_viewer_counts: dict[str, int] = {}


@router.post("/api/session")
def create_session(req: SessionCreateRequest):
    session_id = uuid.uuid4().hex[:12]
    created_at = time.time()
    write(
        "INSERT INTO sessions (session_id, field_id, venue_id, stream_path, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (session_id, req.field_id, VENUE_ID, req.stream_path, created_at),
    )
    logger.info("Created session %s for field %s", session_id, req.field_id)
    return {
        "session_id": session_id,
        "field_id": req.field_id,
        "venue_id": VENUE_ID,
        "stream_path": req.stream_path,
        "viewer_url": f"http://{MEDIA_HOST}:8081/f/{session_id}",
    }


@router.get("/api/session/{session_id}")
def get_session(session_id: str):
    row = execute(
        "SELECT session_id, field_id, venue_id, stream_path, created_at "
        "FROM sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    sid, field_id, venue_id, stream_path, created_at = row

    # Enrich with venue and field names if available
    venue_row = execute(
        "SELECT name FROM venues WHERE venue_id = ?", (venue_id or VENUE_ID,)
    ).fetchone()
    field_row = execute(
        "SELECT name FROM fields WHERE field_id = ?", (field_id,)
    ).fetchone()

    return {
        "session_id": sid,
        "field_id": field_id,
        "venue_id": venue_id or VENUE_ID,
        "venue_name": venue_row[0] if venue_row else None,
        "field_name": field_row[0] if field_row else None,
        "stream_path": stream_path,
        "created_at": created_at,
        "stream_url_hls": f"http://{MEDIA_HOST}:8888/{stream_path}/index.m3u8",
        "stream_url_rtsp": f"rtsp://{MEDIA_HOST}:8554/{stream_path}",
        "viewer_count": _viewer_counts.get(sid, 0),
    }


@router.post("/api/session/{session_id}/join")
def session_join(session_id: str):
    """Increment viewer count for a session (called when viewer page loads)."""
    _viewer_counts[session_id] = _viewer_counts.get(session_id, 0) + 1
    return {"session_id": session_id, "viewer_count": _viewer_counts[session_id]}


@router.post("/api/session/{session_id}/leave")
def session_leave(session_id: str):
    """Decrement viewer count for a session (called when viewer page unloads)."""
    count = _viewer_counts.get(session_id, 0)
    _viewer_counts[session_id] = max(0, count - 1)
    return {"session_id": session_id, "viewer_count": _viewer_counts[session_id]}
