"""
Real PostgreSQL E2E Tests

These tests use a real PostgreSQL database instead of SQLite.
Run with: pytest tests/e2e/test_postgres_e2e.py -v

Prerequisites:
1. PostgreSQL running (via Docker or local installation)
2. E2E_DATABASE_URL environment variable set
3. Test database created
"""

import os
import uuid
from datetime import datetime

import pytest

# Skip all tests if E2E_DATABASE_URL is not set
pytestmark = pytest.mark.skipif(
    not os.environ.get("E2E_DATABASE_URL"), reason="E2E_DATABASE_URL not set - skipping real PostgreSQL tests"
)

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    IMPORTS_OK = True
except ImportError:
    IMPORTS_OK = False
    pytestmark = pytest.mark.skip(reason="Required imports not available")


@pytest.fixture(scope="module")
def postgres_engine():
    """Create PostgreSQL engine for E2E testing."""
    db_url = os.environ.get("E2E_DATABASE_URL")

    engine = create_engine(db_url)

    # Test connection
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        pytest.skip(f"Cannot connect to PostgreSQL: {e}")

    # Create tables
    from src.models.database import Base

    Base.metadata.create_all(bind=engine)

    yield engine

    # Cleanup - drop all tables
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def postgres_session(postgres_engine):
    """Create database session for each test."""
    Session = sessionmaker(autocommit=False, autoflush=False, bind=postgres_engine)
    session = Session()

    # Clean up tables before each test
    from src.models.interview import Interview
    from src.models.message import Message

    session.query(Message).delete()
    session.query(Interview).delete()
    session.commit()

    yield session

    # Rollback any uncommitted changes
    session.rollback()
    session.close()


@pytest.fixture
def client(postgres_session):
    """Create test client with PostgreSQL."""
    from src.api.main import app
    from src.models.database import get_db

    def override_get_db():
        yield postgres_session

    app.dependency_overrides[get_db] = override_get_db

    from fastapi.testclient import TestClient

    # Add API key for authenticated endpoints
    with TestClient(app, headers={"X-API-Key": "test-e2e-api-key-2024"}) as c:
        yield c

    app.dependency_overrides.clear()


class TestPostgreSQLConnection:
    """Test PostgreSQL database connection and basic operations."""

    def test_database_connection(self, postgres_engine):
        """Test that we can connect to PostgreSQL."""
        with postgres_engine.connect() as conn:
            result = conn.execute(text("SELECT 1 as value"))
            row = result.fetchone()
            assert row[0] == 1

    def test_create_interview_table(self, postgres_session):
        """Test that Interview table exists and can be queried."""
        from src.models.interview import Interview, InterviewStatus

        # Create a test interview using enum
        interview = Interview(
            session_id=f"pg_test_{uuid.uuid4().hex[:8]}",
            user_id="pg_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="PostgreSQL Test",
            conversation_history=[],
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Query it back
        result = postgres_session.query(Interview).filter_by(user_id="pg_user").first()
        assert result is not None
        assert result.topic == "PostgreSQL Test"

    def test_interview_timestamps(self, postgres_session):
        """Test that timestamps are correctly set."""
        from src.models.interview import Interview, InterviewStatus

        before = datetime.utcnow()
        interview = Interview(
            session_id=f"ts_test_{uuid.uuid4().hex[:8]}",
            user_id="ts_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="Timestamp Test",
            conversation_history=[],
        )
        postgres_session.add(interview)
        postgres_session.commit()

        after = datetime.utcnow()

        # Verify timestamps
        assert interview.created_at is not None
        assert interview.updated_at is not None
        assert before <= interview.created_at <= after

    def test_jsonb_conversation_history(self, postgres_session):
        """Test that JSONB conversation history works correctly."""
        from src.models.interview import Interview, InterviewStatus

        history = [
            {"role": "assistant", "content": "Welcome!"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "How are you?"},
        ]

        interview = Interview(
            session_id=f"json_test_{uuid.uuid4().hex[:8]}",
            user_id="json_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="JSON Test",
            conversation_history=history,
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Query back
        result = postgres_session.query(Interview).filter_by(user_id="json_user").first()
        assert len(result.conversation_history) == 3
        assert result.conversation_history[0]["role"] == "assistant"
        assert result.conversation_history[1]["content"] == "Hello"


class TestPostgreSQLInterviewFlow:
    """Test complete interview flow with PostgreSQL."""

    def test_create_and_retrieve_interview(self, client, postgres_session):
        """Test creating interview via API and retrieving it."""
        from src.models.interview import Interview, InterviewStatus

        # Create interview directly in DB using enum
        interview = Interview(
            session_id="api_test_001",
            user_id="api_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="API Test",
            conversation_history=[{"role": "assistant", "content": "Question 1"}],
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Retrieve via API
        resp = client.get("/api/interviews/api_test_001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "api_test_001"
        assert data["topic"] == "API Test"

    def test_list_interviews_pagination(self, client, postgres_session):
        """Test pagination with PostgreSQL."""
        from src.models.interview import Interview, InterviewStatus

        # Create 25 interviews using enum
        for i in range(25):
            interview = Interview(
                session_id=f"page_test_{i:03d}",
                user_id=f"user_{i}",
                template_id="quality_survey",
                status=InterviewStatus.IN_PROGRESS,
                topic=f"Page Test {i}",
                conversation_history=[],
            )
            postgres_session.add(interview)
        postgres_session.commit()

        # Test default pagination (20 per page)
        resp = client.get("/api/interviews")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 25
        assert len(data["interviews"]) == 20

        # Test second page
        resp = client.get("/api/interviews?offset=20")
        data = resp.json()
        assert len(data["interviews"]) == 5

    def test_concurrent_sessions(self, postgres_session):
        """Test handling multiple concurrent interview sessions."""
        from src.models.interview import Interview, InterviewStatus

        session_ids = []

        # Create multiple sessions using enum
        for i in range(10):
            interview = Interview(
                session_id=f"concurrent_{i:03d}",
                user_id=f"concurrent_user_{i}",
                template_id="quality_survey",
                status=InterviewStatus.IN_PROGRESS,
                topic=f"Concurrent Test {i}",
                conversation_history=[],
            )
            postgres_session.add(interview)
            session_ids.append(f"concurrent_{i:03d}")

        postgres_session.commit()

        # Verify all exist
        count = postgres_session.query(Interview).filter(Interview.session_id.in_(session_ids)).count()
        assert count == 10


class TestPostgreSQLMessageStorage:
    """Test message storage with PostgreSQL."""

    def test_store_and_retrieve_messages(self, postgres_session):
        """Test storing and retrieving messages."""
        from src.models.interview import Interview, InterviewStatus
        from src.models.message import Message

        # Create interview using enum
        interview = Interview(
            session_id="msg_test_001",
            user_id="msg_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="Message Test",
            conversation_history=[],
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Add messages
        messages = [
            Message(interview_id=interview.id, role="assistant", content="Hello!", message_type="text"),
            Message(interview_id=interview.id, role="user", content="Hi there", message_type="text"),
            Message(interview_id=interview.id, role="assistant", content="How are you?", message_type="text"),
        ]
        for msg in messages:
            postgres_session.add(msg)
        postgres_session.commit()

        # Query messages
        result = postgres_session.query(Message).filter_by(interview_id=interview.id).order_by(Message.created_at).all()
        assert len(result) == 3
        assert result[0].content == "Hello!"
        assert result[1].role == "user"

    def test_voice_message_storage(self, postgres_session):
        """Test storing voice messages."""
        from src.models.interview import Interview, InterviewStatus
        from src.models.message import Message

        interview = Interview(
            session_id="voice_test_001",
            user_id="voice_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="Voice Test",
            conversation_history=[],
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Add voice message
        voice_msg = Message(
            interview_id=interview.id,
            role="user",
            content="Voice transcription text",
            message_type="voice",
        )
        postgres_session.add(voice_msg)
        postgres_session.commit()

        # Retrieve
        result = postgres_session.query(Message).filter_by(interview_id=interview.id).first()
        assert result.message_type == "voice"
        assert result.content == "Voice transcription text"


class TestPostgreSQLReportGeneration:
    """Test report generation with PostgreSQL."""

    def test_report_path_storage(self, postgres_session, tmp_path):
        """Test storing report path in PostgreSQL."""
        from src.models.interview import Interview, InterviewStatus

        # Create report file
        report_dir = tmp_path / "reports" / "report_test_001"
        report_dir.mkdir(parents=True)
        report_file = report_dir / "report_20240101.md"
        report_file.write_text("# Test Report\n\nContent", encoding="utf-8")

        # Create interview with report using enum
        interview = Interview(
            session_id="report_test_001",
            user_id="report_user",
            template_id="quality_survey",
            status=InterviewStatus.COMPLETED,
            topic="Report Test",
            conversation_history=[],
            report_path=str(report_file),
        )
        postgres_session.add(interview)
        postgres_session.commit()

        # Query back
        result = postgres_session.query(Interview).filter_by(session_id="report_test_001").first()
        assert result.report_path == str(report_file)
        assert result.status == InterviewStatus.COMPLETED
