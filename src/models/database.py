"""Database configuration and session management for Interview Bot."""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv(override=True)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/interview_bot"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Get database session dependency for FastAPI."""
    print("[DB] Creating new database session...", flush=True)
    db = SessionLocal()
    try:
        print("[DB] Session created, yielding...", flush=True)
        yield db
    finally:
        print("[DB] Closing session...", flush=True)
        db.close()


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)
