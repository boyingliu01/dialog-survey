"""FastAPI main application for Interview Bot."""

from dotenv import load_dotenv

# Load environment variables first (before importing modules that may depend on them)
load_dotenv()

import asyncio  # noqa: E402
import os  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from src.api import analysis, interviews, plans, template, webhook  # noqa: E402
from src.models.database import init_db  # noqa: E402

USE_STREAM = os.getenv("USE_STREAM_MODE", "false").lower() == "true"
stream_client = None
stream_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    global stream_client, stream_task

    # Startup
    try:
        init_db()
    except Exception as e:
        print(f"Database initialization skipped: {e}")

    # Start Stream client if enabled
    if USE_STREAM:
        try:
            from src.services.stream_handler import create_stream_client

            stream_client = create_stream_client()
            stream_task = asyncio.create_task(stream_client.start())
            print("[Stream] Stream client started")
        except Exception as e:
            print(f"[Stream] Failed to start Stream client: {e}")
            print("[Stream] Falling back to HTTP Webhook mode")
    else:
        print("[Stream] Stream mode disabled, using HTTP Webhook")

    yield

    # Shutdown
    if stream_task:
        stream_task.cancel()
        try:
            await stream_task
        except asyncio.CancelledError:
            pass
        print("[Stream] Stream client stopped")


app = FastAPI(
    title="Interview Bot API",
    description="AI-powered interview robot with intelligent follow-up",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware - restrict origins for security
_allowed_origins = os.environ.get("CORS_ORIGINS", "").split(",") if os.environ.get("CORS_ORIGINS") else []
if not _allowed_origins:
    # Default to empty list (no cross-origin requests allowed) if not configured
    _allowed_origins = []
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Include routers
app.include_router(webhook.router, prefix="/api", tags=["webhook"])
app.include_router(template.router, prefix="/api", tags=["template"])
app.include_router(interviews.router, prefix="/api", tags=["interviews"])
app.include_router(plans.router, prefix="/api", tags=["plans"])
app.include_router(analysis.router, tags=["analysis"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Interview Bot API",
        "version": "0.1.0",
        "description": "AI-powered interview robot",
        "stream_mode": USE_STREAM,
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "stream_mode": USE_STREAM}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
