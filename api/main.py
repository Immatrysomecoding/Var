# api/main.
#SQLAlchemy + migrations + auth use these when done
import os
import time
import uuid
import json
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = "/data/meta/meta.db"
MEDIA_HOST = os.environ.get("MEDIA_HOST", "localhost")

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

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
conn.commit()

app = FastAPI(title="VAR Basic API")

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
        "viewer_url": f"http://localhost:8081/f/{session_id}"
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