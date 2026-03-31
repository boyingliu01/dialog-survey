"""Interview model for storing interview session data."""

import enum
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String
from sqlalchemy import Enum as SQLEnum

from src.models.database import Base


class InterviewStatus(enum.Enum):
    """Interview session status."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Interview(Base):
    """Interview session model."""

    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(String(100), index=True, nullable=False)
    template_id = Column(String(50))
    status = Column(SQLEnum(InterviewStatus), default=InterviewStatus.PENDING)
    current_topic_index = Column(Integer, default=0)
    conversation_history = Column(JSON, default=list)
    extracted_info = Column(JSON, default=dict)
    topic = Column(String(200), default="")  # Interview topic
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    report_path = Column(String(500), nullable=True)

    def __repr__(self) -> str:
        return f"<Interview(session_id={self.session_id}, status={self.status.value})>"
