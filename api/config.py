import os
from pathlib import Path

DB_PATH = "/data/meta/meta.db"
MEDIA_HOST = os.environ.get("MEDIA_HOST", "localhost")
RECORDINGS_ROOT = Path(os.environ.get("RECORDINGS_ROOT", "/data/recordings"))
CLIPS_ROOT = Path(os.environ.get("CLIPS_ROOT", "/data/clips"))
RECORDING_TTL_HOURS = int(os.environ.get("RECORDING_TTL_HOURS", "2"))
VENUE_ID = os.environ.get("VENUE_ID", "playground-hcm-01")
FIELD_ID = os.environ.get("FIELD_ID", "court-1")
DEFAULT_CAMERAS = os.environ.get(
    "DEFAULT_CAMERAS",
    "court1_camA,court1_camB,court1_camC,court1_camD"
).split(",")
