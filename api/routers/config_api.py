"""
GET  /api/config                — full venue + field + camera config for the UI
GET  /api/fields                — list all fields with cameras
GET  /api/fields/{field_id}     — single field + cameras
GET  /api/cameras/{camera_id}/status — is this camera currently streaming?
POST /api/config/verify-pin     — client-side PIN validation helper
"""

import json
import logging
import urllib.request
import urllib.error

from fastapi import APIRouter, HTTPException

from config import VENUE_ID, VENUE_NAME, FIELDS, SCREEN_PIN, MEDIAMTX_API_URL
from models import PinVerifyRequest

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_streaming_cameras() -> set[str]:
    """Call mediamtx API and return set of camera IDs that are currently ready."""
    try:
        url = f"{MEDIAMTX_API_URL}/v3/paths/list"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read())
        return {
            item["name"]
            for item in data.get("items", [])
            if item.get("ready", False)
        }
    except Exception as e:
        logger.debug("mediamtx status check failed: %s", e)
        return set()


@router.get("/api/config")
def get_config():
    """Return the full venue + field + camera config for the current venue."""
    streaming = _get_streaming_cameras()
    fields_out = []
    for field in FIELDS:
        cameras_out = []
        for cam in field["cameras"]:
            cameras_out.append({
                "camera_id": cam["camera_id"],
                "name": cam["name"],
                "position": cam.get("position", ""),
                "streaming": cam["camera_id"] in streaming,
            })
        fields_out.append({
            "field_id": field["field_id"],
            "name": field["name"],
            "cameras": cameras_out,
        })
    return {
        "venue_id": VENUE_ID,
        "venue_name": VENUE_NAME,
        "fields": fields_out,
        "pin_required": SCREEN_PIN is not None,
    }


@router.get("/api/fields")
def list_fields():
    """Return all fields with their camera lists."""
    streaming = _get_streaming_cameras()
    result = []
    for field in FIELDS:
        cameras_out = []
        for cam in field["cameras"]:
            cameras_out.append({
                "camera_id": cam["camera_id"],
                "name": cam["name"],
                "position": cam.get("position", ""),
                "streaming": cam["camera_id"] in streaming,
            })
        result.append({
            "field_id": field["field_id"],
            "name": field["name"],
            "cameras": cameras_out,
        })
    return {"fields": result}


@router.get("/api/fields/{field_id}")
def get_field(field_id: str):
    """Return a single field and its cameras."""
    field = next((f for f in FIELDS if f["field_id"] == field_id), None)
    if not field:
        raise HTTPException(status_code=404, detail="field not found")
    streaming = _get_streaming_cameras()
    cameras_out = []
    for cam in field["cameras"]:
        cameras_out.append({
            "camera_id": cam["camera_id"],
            "name": cam["name"],
            "position": cam.get("position", ""),
            "streaming": cam["camera_id"] in streaming,
        })
    return {
        "field_id": field["field_id"],
        "name": field["name"],
        "cameras": cameras_out,
    }


@router.get("/api/cameras/{camera_id}/status")
def camera_status(camera_id: str):
    """Check whether a specific camera is currently streaming via mediamtx."""
    streaming = _get_streaming_cameras()
    return {
        "camera_id": camera_id,
        "streaming": camera_id in streaming,
    }


@router.post("/api/config/verify-pin")
def verify_pin(req: PinVerifyRequest):
    """Verify the screen PIN. Returns ok=true if correct or if no PIN is set."""
    if SCREEN_PIN is None:
        return {"ok": True, "message": "no pin configured"}
    if req.pin == SCREEN_PIN:
        return {"ok": True}
    return {"ok": False}
