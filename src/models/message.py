"""
Message model for storing individual messages in interviews.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean
from datetime import datetime
from src.models.database import Base


class Message(Base):
    """Message model for storing individual conversation messages."""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), nullable=False)
    role = Column(String(20), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # "text" or "voice"
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Message(id={self.id}, role={self.role}, interview_id={self.interview_id})>"
