import os
import time
import sqlite3
import threading
import logging
import shutil

from config import DB_PATH, RECORDINGS_ROOT, RECORDING_TTL_HOURS, CLIPS_ROOT

logger = logging.getLogger(__name__)

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
CLIPS_ROOT.mkdir(parents=True, exist_ok=True)

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_write_lock = threading.Lock()

# ── Schema init ───────────────────────────────────────────────────────────────

_conn.execute("""
CREATE TABLE IF NOT EXISTS venues (
    venue_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    created_at REAL NOT NULL
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS fields (
    field_id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at REAL NOT NULL
)
""")
_conn.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    venue_id TEXT,
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
    camera_id TEXT,
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
    position TEXT,
    enabled INTEGER DEFAULT 1
)
""")

# Indexes
_conn.execute("CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_field_id ON clips(field_id)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_label ON clips(label)")
_conn.execute("CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at)")
_conn.commit()

# ── Migrations for existing databases ────────────────────────────────────────


def _add_column_if_missing(table: str, column: str, col_type: str):
    try:
        _conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        _conn.commit()
        logger.info("Migration: added column %s.%s", table, column)
    except sqlite3.OperationalError:
        pass  # column already exists


_add_column_if_missing("sessions", "venue_id", "TEXT")
_add_column_if_missing("events", "camera_id", "TEXT")
_add_column_if_missing("cameras", "position", "TEXT")


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


# ── Seed from config ──────────────────────────────────────────────────────────

def seed_from_config():
    """Upsert venues, fields, cameras from values.yml config. Idempotent."""
    from config import VENUE_ID, VENUE_NAME, FIELDS

    statements = []
    now = time.time()

    statements.append((
        "INSERT OR REPLACE INTO venues (venue_id, name, location, created_at) VALUES (?, ?, ?, ?)",
        (VENUE_ID, VENUE_NAME, "", now),
    ))

    for field in FIELDS:
        statements.append((
            "INSERT OR REPLACE INTO fields (field_id, venue_id, name, created_at) VALUES (?, ?, ?, ?)",
            (field["field_id"], VENUE_ID, field["name"], now),
        ))
        for cam in field["cameras"]:
            statements.append((
                "INSERT OR REPLACE INTO cameras "
                "(camera_id, field_id, venue_id, name, rtsp_url, position, enabled) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    cam["camera_id"],
                    field["field_id"],
                    VENUE_ID,
                    cam["name"],
                    cam.get("rtsp_url", ""),
                    cam.get("position", ""),
                    1,
                ),
            ))

    if statements:
        write_batch(statements)
        logger.info("Seeded %d venue/field/camera rows from config", len(statements))


# ── Recording cleanup thread ──────────────────────────────────────────────────

def _cleanup_old_recordings():
    cutoff = time.time() - RECORDING_TTL_HOURS * 3600
    if RECORDINGS_ROOT.exists():
        deleted = 0
        for segment in RECORDINGS_ROOT.glob("**/*.mp4"):
            if segment.stat().st_mtime < cutoff:
                try:
                    segment.unlink()
                    deleted += 1
                except Exception:
                    pass
        if deleted:
            logger.info("Cleanup: removed %d old recording segments", deleted)


def _disk_space_check():
    try:
        usage = shutil.disk_usage("/data")
        free_gb = usage.free / (1024 ** 3)
        if free_gb < 5.0:
            logger.warning("Low disk space: %.1f GB free on /data", free_gb)
    except Exception:
        pass


def _cleanup_loop():
    while True:
        try:
            _cleanup_old_recordings()
            _disk_space_check()
        except Exception as e:
            logger.error("Cleanup loop error: %s", e)
        time.sleep(1800)  # every 30 minutes


threading.Thread(target=_cleanup_loop, daemon=True).start()
