"""
End-to-End Test for DingTalk Webhook Integration

Tests the DingTalk webhook integration including:
- Signature verification
- Message parsing (text and voice)
- Session management
- Error handling

These tests use FastAPI TestClient with mocked services.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.api.main import app
from src.models.database import Base, get_db
from src.models.interview import Interview, InterviewStatus
from src.services.dingtalk import DingTalkService

# Test database
SQLITE_URL = "sqlite:///:memory:"
TEST_API_KEY = "test-e2e-api-key-2024"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_engine():
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


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

class TestDingTalkWebhookVerification:
    """Test DingTalk webhook URL verification."""

    def test_get_webhook_returns_challenge(self, db_session):
        """GET /api/webhook with challenge parameter returns it back."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.get("/api/webhook?challenge=abc123xyz")
            assert resp.status_code == 200
            assert resp.json()["challenge"] == "abc123xyz"
        app.dependency_overrides.clear()

    def test_get_webhook_without_challenge(self, db_session):
        """GET /api/webhook without challenge returns success."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.get("/api/webhook")
            assert resp.status_code == 200
            assert resp.json()["code"] == 0
        app.dependency_overrides.clear()


class TestDingTalkMessageHandling:
    """Test DingTalk message handling via webhook."""

    def _create_mock_dingtalk(self, user_id="webhook_user", content="测试", msg_type="text"):
        """Create mock DingTalk service."""
        mock = Mock()
        mock.verify_signature.return_value = True
        mock.parse_webhook_message.return_value = {
            "msg_type": msg_type,
            "user_id": user_id,
            "content": content,
            "conversation_id": "test_conv",
        }
        return mock

    def _mock_run_interview(self, message="测试回复", session_id=None):
        """Create mock run_interview response."""
        return {
            "conversation_history": [
                {"role": "assistant", "content": message}
            ],
            "status": "interviewing",
            "report": None,
            "report_path": None,
        }

    def test_missing_signature_headers_returns_403(self, db_session):
        """Missing signature headers should return 403."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "text": {"content": "测试"}}
            )
            assert resp.status_code == 403
        app.dependency_overrides.clear()

    def test_invalid_signature_returns_403(self, db_session):
        """Invalid signature should return 403."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "text": {"content": "测试"}},
                headers={
                    "timestamp": "123456",
                    "signature": "invalid_sig",
                    "nonce": "test_nonce"
                }
            )
            assert resp.status_code == 403
        app.dependency_overrides.clear()


class TestDingTalkServiceIntegration:
    """Test DingTalk service integration with database."""

    def test_dingtalk_verify_signature_with_mock(self):
        """Test that mock DingTalk service can verify signatures."""
        with patch("src.services.dingtalk.DingTalkService") as mock_class:
            mock_instance = Mock()
            mock_instance.verify_signature.return_value = True
            mock_class.return_value = mock_instance

            # Reset singleton
            import src.services.dingtalk
            from src.services.dingtalk import get_dingtalk_service
            src.services.dingtalk._dingtalk_service = None

            svc = get_dingtalk_service()
            result = svc.verify_signature("123", "sig", "nonce")
            assert result is True

    def test_dingtalk_parse_webhook_message(self):
        """Test DingTalk webhook message parsing."""
        svc = DingTalkService()

        # Test text message
        data = {
            "msgtype": "text",
            "text": {"content": "测试消息"},
            "senderStaffId": "user123"
        }

        result = svc.parse_webhook_message(data)
        assert result["msg_type"] == "text"
        assert result["user_id"] == "user123"
        assert result["content"] == "测试消息"


class TestVoiceCallback:
    """Test voice callback handling."""

    def test_voice_callback_endpoint_requires_auth(self, db_session):
        """Voice callback endpoint should require proper data."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            # Missing required fields
            resp = client.post(
                "/api/webhook/voice",
                json={}
            )
            # Should handle gracefully
            assert resp.status_code == 200
            assert resp.json()["code"] == 400
        app.dependency_overrides.clear()

    def test_voice_callback_stores_message(self, db_session):
        """Voice callback should store message for active interview."""
        # Create active interview
        interview = Interview(
            session_id="voice_session",
            user_id="voice_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="语音测试",
            conversation_history=[
                {"role": "assistant", "content": "请语音回答"}
            ],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.post(
                "/api/webhook/voice",
                json={
                    "senderStaffId": "voice_user",
                    "text": {"content": "语音转文字结果"}
                }
            )
            assert resp.status_code == 200
            assert resp.json()["code"] == 0
        app.dependency_overrides.clear()

    def test_voice_callback_no_active_session(self, db_session):
        """Voice callback with no active session returns success."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.post(
                "/api/webhook/voice",
                json={
                    "senderStaffId": "nobody",
                    "text": {"content": "语音内容"}
                }
            )
            assert resp.status_code == 200
            assert resp.json()["code"] == 0
        app.dependency_overrides.clear()


class TestInterviewSessionManagement:
    """Test interview session management through webhook."""

    def test_start_command_creates_interview(self, db_session):
        """'开始' command should create new interview."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = Mock(
                verify_signature=Mock(return_value=True),
                parse_webhook_message=Mock(return_value={
                    "msg_type": "text",
                    "user_id": "new_user",
                    "content": "开始",
                    "conversation_id": "conv_001",
                })
            )

            with patch("src.api.webhook.run_interview") as mock_run:
                mock_run.return_value = {
                    "conversation_history": [
                        {"role": "assistant", "content": "欢迎！"},
                        {"role": "assistant", "content": "第一个问题？"}
                    ],
                    "status": "interviewing",
                    "report": None,
                    "report_path": None,
                }

                with TestClient(app) as client:
                    resp = client.post(
                        "/api/webhook",
                        json={
                            "msgtype": "text",
                            "text": {"content": "开始"},
                            "senderStaffId": "new_user",
                        },
                        headers={
                            "timestamp": "123456",
                            "signature": "valid_sig",
                            "nonce": "nonce"
                        }
                    )

                assert resp.status_code == 200
                data = resp.json()
                assert data["code"] == 0
                assert "session_id" in data

        app.dependency_overrides.clear()

    def test_continue_existing_session(self, db_session):
        """Continuing in existing session should process answer."""
        # Create existing interview
        interview = Interview(
            session_id="existing_sess",
            user_id="existing_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试",
            conversation_history=[
                {"role": "assistant", "content": "第一个问题"}
            ],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = Mock(
                verify_signature=Mock(return_value=True),
                parse_webhook_message=Mock(return_value={
                    "msg_type": "text",
                    "user_id": "existing_user",
                    "content": "我的回答",
                    "conversation_id": "conv_001",
                })
            )

            with patch("src.api.webhook.run_interview") as mock_run:
                mock_run.return_value = {
                    "conversation_history": [
                        {"role": "assistant", "content": "第一个问题"},
                        {"role": "user", "content": "我的回答"},
                        {"role": "assistant", "content": "下一个问题"}
                    ],
                    "status": "interviewing",
                    "report": None,
                    "report_path": None,
                }

                with TestClient(app) as client:
                    resp = client.post(
                        "/api/webhook",
                        json={
                            "msgtype": "text",
                            "text": {"content": "我的回答"},
                            "senderStaffId": "existing_user",
                        },
                        headers={
                            "timestamp": "123456",
                            "signature": "valid_sig",
                            "nonce": "nonce"
                        }
                    )

                assert resp.status_code == 200
                data = resp.json()
                assert data["code"] == 0
                assert data["session_id"] == "existing_sess"

        app.dependency_overrides.clear()

    def test_session_not_found_returns_404(self, db_session):
        """Nonexistent session returns 404 code."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = Mock(
                verify_signature=Mock(return_value=True),
                parse_webhook_message=Mock(return_value={
                    "msg_type": "text",
                    "user_id": "some_user",
                    "content": "回答",
                    "conversation_id": "conv_001",
                })
            )

            with TestClient(app) as client:
                resp = client.post(
                    "/api/webhook",
                    json={
                        "msgtype": "text",
                        "text": {"content": "回答"},
                        "senderStaffId": "some_user",
                        "session_id": "nonexistent_session"
                    },
                    headers={
                        "timestamp": "123456",
                        "signature": "valid_sig",
                        "nonce": "nonce"
                    }
                )

            assert resp.status_code == 200
            assert resp.json()["code"] == 404

        app.dependency_overrides.clear()

    def test_missing_user_id_returns_400(self, db_session):
        """Missing user ID returns 400 code."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = Mock(
                verify_signature=Mock(return_value=True),
                parse_webhook_message=Mock(return_value={
                    "msg_type": "text",
                    "user_id": "",
                    "content": "测试",
                    "conversation_id": "conv_001",
                })
            )

            with TestClient(app) as client:
                resp = client.post(
                    "/api/webhook",
                    json={
                        "msgtype": "text",
                        "text": {"content": "测试"}
                    },
                    headers={
                        "timestamp": "123456",
                        "signature": "valid_sig",
                        "nonce": "nonce"
                    }
                )

            assert resp.status_code == 200
            assert resp.json()["code"] == 400

        app.dependency_overrides.clear()


class TestErrorHandling:
    """Test error handling in webhook processing."""

    def test_invalid_json_returns_400(self, db_session):
        """Invalid JSON body should return 400."""
        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.post(
                "/api/webhook",
                content="not valid json",
                headers={
                    "content-type": "application/json",
                    "timestamp": "123456",
                    "signature": "sig",
                    "nonce": "n"
                }
            )
            assert resp.status_code == 400
        app.dependency_overrides.clear()

    def test_langgraph_error_returns_500(self, db_session):
        """LangGraph error should return 500 with error code."""
        # Create existing interview
        interview = Interview(
            session_id="error_session",
            user_id="error_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="错误测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch("src.api.webhook.get_dingtalk_service") as mock_factory:
            mock_factory.return_value = Mock(
                verify_signature=Mock(return_value=True),
                parse_webhook_message=Mock(return_value={
                    "msg_type": "text",
                    "user_id": "error_user",
                    "content": "触发错误",
                    "conversation_id": "error_conv",
                })
            )

            with patch("src.api.webhook.run_interview", side_effect=RuntimeError("LLM timeout")):
                with TestClient(app) as client:
                    resp = client.post(
                        "/api/webhook",
                        json={
                            "msgtype": "text",
                            "text": {"content": "触发错误"},
                            "senderStaffId": "error_user",
                        },
                        headers={
                            "timestamp": "123456",
                            "signature": "valid_sig",
                            "nonce": "nonce"
                        }
                    )

                assert resp.status_code == 200
                data = resp.json()
                assert data["code"] == 500
                assert "session_id" in data

        app.dependency_overrides.clear()
