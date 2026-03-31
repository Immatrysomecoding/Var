"""
GET /api/health          — quick OK check (existing)
GET /api/health/detailed — full system status
"""

import json
import logging
import shutil
import urllib.request
import urllib.error

from fastapi import APIRouter

from config import FIELDS, MEDIAMTX_API_URL
import database

router = APIRouter()
logger = logging.getLogger(__name__)


def _check_mediamtx() -> tuple[bool, set[str]]:
    """Return (reachable, set_of_streaming_camera_ids)."""
    try:
        url = f"{MEDIAMTX_API_URL}/v3/paths/list"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        streaming = {
            item["name"]
            for item in data.get("items", [])
            if item.get("ready", False)
        }
        return True, streaming
    except Exception as e:
        logger.debug("mediamtx health check failed: %s", e)
        return False, set()


def _check_db() -> bool:
    try:
        database.execute("SELECT 1").fetchone()
        return True
    except Exception:
        return False


def _disk_free_gb() -> float:
    try:
        usage = shutil.disk_usage("/data")
        return round(usage.free / (1024 ** 3), 2)
    except Exception:
        return -1.0


@router.get("/api/health")
def health():
    return {"ok": True}


@router.get("/api/health/detailed")
def health_detailed():
    mediamtx_ok, streaming = _check_mediamtx()
    db_ok = _check_db()
    disk_free = _disk_free_gb()

    all_cameras = []
    for field in FIELDS:
        for cam in field["cameras"]:
            all_cameras.append({
                "id": cam["camera_id"],
                "field_id": field["field_id"],
                "streaming": cam["camera_id"] in streaming,
            })

    ok = mediamtx_ok and db_ok

    return {
        "ok": ok,
        "mediamtx": mediamtx_ok,
        "cameras": all_cameras,
        "db": db_ok,
        "disk_free_gb": disk_free,
    }
