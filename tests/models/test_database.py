"""
Tests for database models.
"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.models.database import Base
from src.models.interview import Interview, InterviewStatus
from src.models.message import Message

# Use in-memory SQLite for testing
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create a test database session."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


class TestInterviewModel:
    """Tests for Interview model."""

    def test_create_interview(self, db_session):
        """Test creating an interview."""
        interview = Interview(
            session_id="test_session_001",
            user_id="user_123",
            template_id="quality_survey",
            topic="质量满意度调查",
        )
        db_session.add(interview)
        db_session.commit()

        assert interview.id is not None
        assert interview.session_id == "test_session_001"
        assert interview.status == InterviewStatus.PENDING
        assert interview.current_topic_index == 0

    def test_interview_status_transitions(self, db_session):
        """Test interview status transitions."""
        interview = Interview(session_id="test_session_002", user_id="user_456")
        db_session.add(interview)
        db_session.commit()

        # Transition to in_progress
        interview.status = InterviewStatus.IN_PROGRESS
        db_session.commit()
        assert interview.status == InterviewStatus.IN_PROGRESS

        # Transition to completed
        interview.status = InterviewStatus.COMPLETED
        interview.completed_at = datetime.utcnow()
        db_session.commit()
        assert interview.status == InterviewStatus.COMPLETED

    def test_conversation_history_default(self, db_session):
        """Test conversation history default value."""
        interview = Interview(session_id="test_session_003", user_id="user_789")
        db_session.add(interview)
        db_session.commit()

        assert interview.conversation_history == []
        assert interview.extracted_info == {}

    def test_interview_query_by_session_id(self, db_session):
        """Test querying interview by session_id."""
        interview = Interview(session_id="unique_session_123", user_id="user_abc")
        db_session.add(interview)
        db_session.commit()

        result = (
            db_session.query(Interview)
            .filter(Interview.session_id == "unique_session_123")
            .first()
        )

        assert result is not None
        assert result.user_id == "user_abc"


class TestMessageModel:
    """Tests for Message model."""

    def test_create_message(self, db_session):
        """Test creating a message."""
        interview = Interview(session_id="msg_test_001", user_id="user_msg")
        db_session.add(interview)
        db_session.commit()

        message = Message(
            interview_id=interview.id,
            role="user",
            content="这是一个测试消息",
            message_type="text",
        )
        db_session.add(message)
        db_session.commit()

        assert message.id is not None
        assert message.role == "user"
        assert message.message_type == "text"

    def test_voice_message(self, db_session):
        """Test creating a voice message."""
        interview = Interview(session_id="msg_test_002", user_id="user_voice")
        db_session.add(interview)
        db_session.commit()

        message = Message(
            interview_id=interview.id,
            role="user",
            content="这是语音转文字的结果",
            message_type="voice",
        )
        db_session.add(message)
        db_session.commit()

        assert message.message_type == "voice"

    def test_message_belongs_to_interview(self, db_session):
        """Test message foreign key relationship."""
        interview = Interview(session_id="msg_test_003", user_id="user FK test")
        db_session.add(interview)
        db_session.commit()

        message = Message(
            interview_id=interview.id, role="assistant", content="您好，请开始访谈"
        )
        db_session.add(message)
        db_session.commit()

        # Query back
        result = (
            db_session.query(Message)
            .filter(Message.interview_id == interview.id)
            .first()
        )

        assert result is not None
        assert result.interview_id == interview.id
