"""
FastAPI main application for Interview Bot.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from src.models.database import init_db
from src.api import webhook, template


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    try:
        init_db()
    except Exception as e:
        print(f"Database initialization skipped: {e}")
    yield
    # Shutdown
    pass


app = FastAPI(
    title="Interview Bot API",
    description="AI-powered interview robot with intelligent follow-up",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(webhook.router, prefix="/api", tags=["webhook"])
app.include_router(template.router, prefix="/api", tags=["template"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Interview Bot API",
        "version": "0.1.0",
        "description": "AI-powered interview robot",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
