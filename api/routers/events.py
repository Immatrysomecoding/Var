import time
import json

from fastapi import APIRouter

from database import write
from models import EventRequest

router = APIRouter()


@router.post("/api/event")
def log_event(req: EventRequest):
    write(
        "INSERT INTO events (session_id, event_type, ts, meta) VALUES (?, ?, ?, ?)",
        (req.session_id, req.event, time.time(), json.dumps(req.meta)),
    )
    return {"ok": True}
