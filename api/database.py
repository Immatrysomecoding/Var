import os
import time
import sqlite3
import threading

from config import DB_PATH, RECORDINGS_ROOT, RECORDING_TTL_HOURS, CLIPS_ROOT

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
CLIPS_ROOT.mkdir(parents=True, exist_ok=True)

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_write_lock = threading.Lock()

# ── Schema init ──────────────────────────────────────────────────────────────

_conn.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    stream_path TEXT NOT NULL,
    created_at REAL NOT NULL
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    ts REAL NOT NULL,
    meta TEXT
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS clips (
    clip_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    field_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    started_at REAL NOT NULL,
    duration_sec INTEGER NOT NULL,
    trigger_event TEXT,
    file_path TEXT,
    label TEXT,
    confidence REAL,
    created_at REAL NOT NULL
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS cameras (
    camera_id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    venue_id TEXT NOT NULL,
    name TEXT,
    rtsp_url TEXT,
    enabled INTEGER DEFAULT 1
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS venues (
    venue_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    created_at REAL NOT NULL
)
""")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_field_id ON clips(field_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_label ON clips(label)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at)")
_conn.commit()


# ── Public helpers ────────────────────────────────────────────────────────────

def execute(sql: str, params: tuple = ()):
    """Execute a read query. No lock needed for SELECT."""
    return _conn.execute(sql, params)


def write(sql: str, params: tuple = ()):
    """Execute a single write and commit, protected by the write lock."""
    with _write_lock:
        _conn.execute(sql, params)
        _conn.commit()


def write_batch(statements: list[tuple]):
    """Execute multiple (sql, params) pairs in a single locked transaction."""
    with _write_lock:
        for sql, params in statements:
            _conn.execute(sql, params)
        _conn.commit()


# ── Recording cleanup thread ──────────────────────────────────────────────────

def _cleanup_old_recordings():
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
            _cleanup_old_recordings()
        except Exception:
            pass
        time.sleep(1800)  # every 30 minutes


threading.Thread(target=_cleanup_loop, daemon=True).start()
