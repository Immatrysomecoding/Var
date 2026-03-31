import time
import json
import logging

from fastapi import APIRouter

from database import write
from models import EventRequest

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/api/event")
def log_event(req: EventRequest):
    write(
        "INSERT INTO events (session_id, event_type, ts, camera_id, meta) VALUES (?, ?, ?, ?, ?)",
        (req.session_id, req.event, time.time(), req.camera_id, json.dumps(req.meta)),
    )
    return {"ok": True}
