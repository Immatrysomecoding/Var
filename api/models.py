from pydantic import BaseModel


class SessionCreateRequest(BaseModel):
    field_id: str
    stream_path: str


class EventRequest(BaseModel):
    session_id: str
    event: str
    meta: dict = {}


class ClipRequest(BaseModel):
    field_id: str
    camera_id: str
    seconds: int = 10
    session_id: str = "screen-local"
