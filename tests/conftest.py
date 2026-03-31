import os
import sys
import tempfile
import pytest
import pytest_asyncio
import httpx

# Point the app at a temporary DB and data dirs before importing anything
_tmp = tempfile.mkdtemp()
os.environ["RECORDINGS_ROOT"] = os.path.join(_tmp, "recordings")
os.environ["CLIPS_ROOT"] = os.path.join(_tmp, "clips")
os.environ.setdefault("VENUE_ID", "test-venue")
os.environ.setdefault("FIELD_ID", "test-field")
# No values.yml in test env — config will use env-var defaults
os.environ.setdefault("VALUES_PATH", os.path.join(_tmp, "nonexistent.yml"))

# Make the api/ directory importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

# Override DB_PATH to a temp file before database module is imported
import config  # noqa: E402
config.DB_PATH = os.path.join(_tmp, "test.db")

# Now import database so it picks up the patched config
import database as _db_module  # noqa: E402
import sqlite3, threading  # noqa: E402

_db_module._conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
_db_module._write_lock = threading.Lock()

# Re-run full schema init on the new connection (must match database.py)
_SCHEMA_STMTS = [
    """CREATE TABLE IF NOT EXISTS venues (
        venue_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS fields (
        field_id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        field_id TEXT NOT NULL,
        venue_id TEXT,
        stream_path TEXT NOT NULL,
        created_at REAL NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        ts REAL NOT NULL,
        camera_id TEXT,
        meta TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS clips (
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
    )""",
    """CREATE TABLE IF NOT EXISTS cameras (
        camera_id TEXT PRIMARY KEY,
        field_id TEXT NOT NULL,
        venue_id TEXT NOT NULL,
        name TEXT,
        rtsp_url TEXT,
        position TEXT,
        enabled INTEGER DEFAULT 1
    )""",
    "CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)",
    "CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_clips_field_id ON clips(field_id)",
    "CREATE INDEX IF NOT EXISTS idx_clips_label ON clips(label)",
    "CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at)",
]

for _stmt in _SCHEMA_STMTS:
    _db_module._conn.execute(_stmt)
_db_module._conn.commit()

from main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
