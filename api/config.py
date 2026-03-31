import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

VALUES_PATH = os.environ.get("VALUES_PATH", "/values.yml")


def _load_values() -> dict:
    try:
        import yaml
        p = Path(VALUES_PATH)
        if p.exists():
            with p.open("r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
    except Exception as e:
        logger.warning("Could not load values.yml: %s", e)
    return {}


_values: dict = _load_values()


def _v(*keys, default=None):
    """Navigate nested dict by key path."""
    d = _values
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k)
        if d is None:
            return default
    return d


# ── Core paths ────────────────────────────────────────────────────────────────

DB_PATH = "/data/meta/meta.db"
RECORDINGS_ROOT = Path(os.environ.get("RECORDINGS_ROOT", "/data/recordings"))
CLIPS_ROOT = Path(os.environ.get("CLIPS_ROOT", "/data/clips"))

# ── Network ───────────────────────────────────────────────────────────────────

# Env var wins; values.yml domain is a fallback for display but MEDIA_HOST is
# the actual host browsers use — must be overridden via .env in production.
MEDIA_HOST = os.environ.get("MEDIA_HOST", "localhost")

# ── Venue / deployment ────────────────────────────────────────────────────────

VENUE_ID = (
    os.environ.get("VENUE_ID")
    or _v("deployment", "locationId")
    or "playground-hcm-01"
)
VENUE_NAME = _v("deployment", "venueName") or "VAR Venue"
FIELD_ID = (
    os.environ.get("FIELD_ID")
    or _v("deployment", "defaultFieldId")
    or "court-1"
)

# ── Recording ─────────────────────────────────────────────────────────────────

_ttl_days = _v("fields", default=[{}])
# Use storagePolicy from first field if present, else fall back to 2h
_policy = _v("fields", default=[{}])
RECORDING_TTL_HOURS = int(os.environ.get("RECORDING_TTL_HOURS", "2"))

# ── Clip limits ───────────────────────────────────────────────────────────────

CLIP_MAX_SECONDS = _v("ui", "screen", "clip", "maxClipSeconds") or 60
CLIP_DEFAULT_SECONDS = _v("ui", "screen", "clip", "defaultClipSeconds") or 10

# ── Fields and cameras (from values.yml) ─────────────────────────────────────


def _parse_fields() -> list[dict]:
    raw = _v("fields") or []
    result = []
    for f in raw:
        cameras = []
        for c in f.get("cameras", []):
            cameras.append({
                "camera_id": c["cameraId"],
                "name": c.get("name", c["cameraId"]),
                "rtsp_url": c.get("stream", {}).get("url", ""),
                "position": c.get("position", ""),
            })
        result.append({
            "field_id": f["fieldId"],
            "name": f.get("name", f["fieldId"]),
            "cameras": cameras,
        })
    return result


FIELDS: list[dict] = _parse_fields()

# Flat camera ID list — env var fallback for backwards compat
DEFAULT_CAMERAS: list[str] = (
    [c["camera_id"] for field in FIELDS for c in field["cameras"]]
    or os.environ.get(
        "DEFAULT_CAMERAS",
        "court1_camA,court1_camB,court1_camC,court1_camD",
    ).split(",")
)

# ── Access / PIN ──────────────────────────────────────────────────────────────

SCREEN_PIN: str | None = _v("access", "screen_pin")  # None = disabled

# ── Mediamtx internal address (for status checks) ────────────────────────────

MEDIAMTX_API_URL = os.environ.get("MEDIAMTX_API_URL", "http://mediamtx:9997")
