import logging
import json
import sys
from contextlib import asynccontextmanager

import database  # noqa: F401 — runs schema init and cleanup thread on import

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CLIPS_ROOT
from routers import sessions, events, clips
from routers import config_api, health as health_router


# ── Structured JSON logging ───────────────────────────────────────────────────

class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "name": record.name,
            "msg": record.getMessage(),
        })


def _setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


_setup_logging()
logger = logging.getLogger(__name__)


# ── App lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    database.seed_from_config()
    logger.info("VAR API started")
    yield
    logger.info("VAR API shutting down")


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="VAR Basic API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router.router)
app.include_router(sessions.router)
app.include_router(events.router)
app.include_router(clips.router)
app.include_router(config_api.router)

app.mount("/clips", StaticFiles(directory=str(CLIPS_ROOT)), name="clips")
