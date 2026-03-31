"""InterviewPlan and Interviewee models for managing interview batches.

InterviewPlan represents a batch interview plan that can have multiple interviewees.
Interviewee represents an individual person to be interviewed within a plan.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from src.models.database import Base

# Valid status values for InterviewPlan
PLAN_STATUS_VALUES = ("draft", "active", "completed", "cancelled")

# Valid status values for Interviewee
INTERVIEWEE_STATUS_VALUES = ("pending", "invited", "in_progress", "completed")


class InterviewPlan(Base):
    """Interview plan model for batch interview management."""

    __tablename__ = "interview_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    template_id = Column(String(50), default="quality_survey")
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to interviewees
    interviewees = relationship("Interviewee", back_populates="plan", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<InterviewPlan(id={self.id}, name={self.name}, status={self.status})>"

    def is_valid_status(self) -> bool:
        """Check if current status is valid."""
        return self.status in PLAN_STATUS_VALUES


class Interviewee(Base):
    """Interviewee model for individuals within an interview plan."""

    __tablename__ = "interviewees"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("interview_plans.id"), nullable=False, index=True)
    user_id = Column(String(100), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    status = Column(String(20), default="pending")
    invited_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to plan
    plan = relationship("InterviewPlan", back_populates="interviewees")

    def __repr__(self) -> str:
        return f"<Interviewee(id={self.id}, name={self.name}, plan_id={self.plan_id}, status={self.status})>"

    def is_valid_status(self) -> bool:
        """Check if current status is valid."""
        return self.status in INTERVIEWEE_STATUS_VALUES
