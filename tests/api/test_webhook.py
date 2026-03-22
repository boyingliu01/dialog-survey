"""
Integration tests for API webhook endpoints.

Uses FastAPI TestClient with an in-memory SQLite database so no external
services are required.  DingTalk and LangGraph calls are mocked.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.models.database import Base, get_db
from src.models.interview import Interview, InterviewStatus

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SQLITE_URL = "sqlite:///:memory:"


@pytest.fixture()
def db_engine():
    # StaticPool forces all connections to reuse the same in-memory DB
    engine = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    """TestClient with DB dependency overridden to use in-memory SQLite."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Include valid signature headers since signature verification is now mandatory
    with TestClient(app, headers={"timestamp": "1234567890", "signature": "valid_sig", "nonce": "test_nonce"}) as c:
        yield c
    app.dependency_overrides.clear()


def _mock_dingtalk(user_id="user123", content="测试内容", msg_type="text"):
    """Helper: build a Mock DingTalkService that parses a simple text message."""
    svc = Mock()
    svc.verify_signature.return_value = True
    svc.parse_webhook_message.return_value = {
        "msg_type": msg_type,
        "user_id": user_id,
        "content": content,
        "conversation_id": "conv_001",
    }
    return svc


def _mock_run_interview(response_message="下一个问题是什么？"):
    """Helper: build a mock run_interview return value."""
    return {
        "conversation_history": [{"role": "assistant", "content": response_message}],
        "status": "interviewing",
        "report": None,
        "report_path": None,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestHealthCheck:
    def test_health_returns_healthy(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "healthy"}

    def test_root_returns_api_info(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "name" in data
        assert "version" in data


# ---------------------------------------------------------------------------
# GET /api/webhook — URL verification
# ---------------------------------------------------------------------------


class TestWebhookVerification:
    def test_challenge_is_echoed_back(self, client):
        resp = client.get("/api/webhook?challenge=abc123")
        assert resp.status_code == 200
        assert resp.json()["challenge"] == "abc123"

    def test_no_challenge_returns_success(self, client):
        resp = client.get("/api/webhook")
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    def test_invalid_signature_returns_403(self, client):
        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            svc = Mock()
            svc.verify_signature.return_value = False
            mock_factory.return_value = svc

            # signature params are query params on the GET endpoint
            resp = client.get(
                "/api/webhook",
                params={"timestamp": "1000", "signature": "bad", "nonce": "n"},
            )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/webhook — message handling
# ---------------------------------------------------------------------------


class TestWebhookPost:
    def test_missing_user_id_returns_400_code(self, client):
        """Messages with no senderStaffId / userId get code 400."""
        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            svc = Mock()
            svc.verify_signature.return_value = True
            svc.parse_webhook_message.return_value = {
                "msg_type": "text",
                "user_id": "",
                "content": "hello",
                "conversation_id": "",
            }
            mock_factory.return_value = svc

            resp = client.post("/api/webhook", json={"msgtype": "text"})

        assert resp.status_code == 200
        assert resp.json()["code"] == 400

    def test_invalid_json_body_returns_400(self, client):
        resp = client.post(
            "/api/webhook",
            content="not json",
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 400

    def test_unknown_message_no_session_prompts_start(self, client):
        """User sends random text with no active session — prompt to start."""
        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = _mock_dingtalk(content="随便说的")

            resp = client.post("/api/webhook", json={})

        assert resp.status_code == 200
        assert "开始" in resp.json()["message"]

    def test_start_command_creates_new_interview(self, client, db_session):
        """Sending '开始' creates a new Interview row and returns first question."""
        with patch("src.api.webhook.get_dingtalk_service") as mock_factory, \
             patch("src.api.webhook.run_interview") as mock_run:
            mock_factory.return_value = _mock_dingtalk(content="开始")
            mock_run.return_value = _mock_run_interview("欢迎参加访谈！第一个问题：…")

            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "text": {"content": "开始"}, "senderStaffId": "user123"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == 0
        assert "session_id" in data
        assert "欢迎" in data["message"] or data["message"]  # has some content

        # Verify DB row was created
        interview = db_session.query(Interview).filter_by(user_id="user123").first()
        assert interview is not None
        assert interview.status == InterviewStatus.IN_PROGRESS

    def test_continue_existing_session_processes_answer(self, client, db_session):
        """User answer in an active session runs the LangGraph and returns next question."""
        # Seed an active interview
        interview = Interview(
            session_id="sess_existing",
            user_id="user456",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试访谈",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()
        db_session.refresh(interview)

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory, \
             patch("src.api.webhook.run_interview") as mock_run:
            mock_factory.return_value = _mock_dingtalk(user_id="user456", content="产品质量不错")
            mock_run.return_value = _mock_run_interview("感谢您的回答，下一个问题：…")

            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "text": {"content": "产品质量不错"}, "senderStaffId": "user456"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == 0
        assert data["session_id"] == "sess_existing"
        assert "下一个问题" in data["message"]

        # Verify message was stored
        from src.models.message import Message
        msgs = db_session.query(Message).filter_by(interview_id=interview.id).all()
        assert any(m.role == "user" and "产品质量" in m.content for m in msgs)
        assert any(m.role == "assistant" for m in msgs)

    def test_session_not_found_returns_404_code(self, client, db_session):
        """Explicit session_id that doesn't exist returns code 404."""
        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = _mock_dingtalk(content="回答")

            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "senderStaffId": "user123", "session_id": "nonexistent_sess"},
            )

        assert resp.status_code == 200
        assert resp.json()["code"] == 404

    def test_langgraph_error_returns_500_code(self, client, db_session):
        """LangGraph exception is caught and returns code 500 with error message."""
        interview = Interview(
            session_id="sess_err",
            user_id="user_err",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory, \
             patch("src.api.webhook.run_interview", side_effect=RuntimeError("LLM timeout")):
            mock_factory.return_value = _mock_dingtalk(user_id="user_err", content="回答")

            resp = client.post("/api/webhook", json={"senderStaffId": "user_err"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == 500
        assert "session_id" in data


# ---------------------------------------------------------------------------
# POST /api/webhook/voice
# ---------------------------------------------------------------------------


class TestWebhookVoice:
    def test_voice_callback_stored_for_active_session(self, client, db_session):
        """Voice callback content is appended to conversation history."""
        interview = Interview(
            session_id="sess_voice",
            user_id="voice_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        resp = client.post(
            "/api/webhook/voice",
            json={"senderStaffId": "voice_user", "text": {"content": "语音转文字结果"}},
        )

        assert resp.status_code == 200
        assert resp.json()["code"] == 0

        db_session.refresh(interview)
        assert any(
            "语音" in msg.get("content", "")
            for msg in (interview.conversation_history or [])
        )

    def test_voice_callback_no_active_session(self, client):
        """Voice callback with no active session returns success (no-op)."""
        resp = client.post(
            "/api/webhook/voice",
            json={"senderStaffId": "nobody", "text": {"content": "语音内容"}},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0

    def test_voice_callback_missing_fields_returns_400_code(self, client):
        """Incomplete voice callback body returns code 400."""
        resp = client.post("/api/webhook/voice", json={})
        assert resp.status_code == 200
        assert resp.json()["code"] == 400
