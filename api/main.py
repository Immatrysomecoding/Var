import database  # noqa: F401 — runs schema init and cleanup thread on import

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CLIPS_ROOT
from routers import sessions, events, clips

app = FastAPI(title="VAR Basic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(events.router)
app.include_router(clips.router)

app.mount("/clips", StaticFiles(directory=str(CLIPS_ROOT)), name="clips")


@app.get("/api/health")
def health():
    return {"ok": True}
