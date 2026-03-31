"""
DingTalk Integration Tests

These tests verify DingTalk webhook integration.
They can run with mocked or real DingTalk API.

For real DingTalk testing:
1. Set DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_AGENT_ID
2. Set DINGTALK_TEST_USER_ID to a real user for testing
3. Run: pytest tests/e2e/test_dingtalk_real.py -v -m "not skip_ci"
"""

import base64
import hashlib
import hmac
import os
from unittest.mock import patch

import pytest

# Skip in CI environment unless explicitly enabled
pytestmark = pytest.mark.skipif(
    os.environ.get("CI") == "true" and not os.environ.get("ENABLE_DINGTALK_TESTS"),
    reason="DingTalk tests disabled in CI"
)


class TestDingTalkSignature:
    """Test DingTalk signature verification."""

    def test_signature_generation(self):
        """Test that signature can be generated correctly."""
        timestamp = "1234567890"
        secret = "test_secret"

        # Generate signature
        string_to_sign = f"{timestamp}\n{secret}"
        hmac_code = hmac.new(
            secret.encode("utf-8"),
            string_to_sign.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        assert hmac_code is not None
        assert len(hmac_code) == 64  # SHA256 hex digest length

    def test_signature_verification_mock(self):
        """Test signature verification with mock."""
        from src.services.dingtalk import DingTalkService

        service = DingTalkService(app_secret="test_secret")

        # Generate signature using the actual algorithm
        timestamp = "1234567890"
        nonce = "test_nonce"
        string_to_sign = f"{service.app_secret}{timestamp}{nonce}"
        hmac_code = hmac.new(
            string_to_sign.encode("utf-8"), digestmod=hashlib.sha256
        ).digest()
        signature = base64.b64encode(hmac_code).decode("utf-8")

        result = service.verify_signature(timestamp, signature, nonce)
        assert result is True

    def test_signature_rejects_invalid(self):
        """Test that invalid signatures are rejected."""
        from src.services.dingtalk import DingTalkService

        service = DingTalkService(app_secret="test_secret")

        result = service.verify_signature("123456", "invalid_signature", "nonce")
        assert result is False


class TestDingTalkMessageParsing:
    """Test DingTalk message parsing."""

    def test_parse_text_message(self):
        """Test parsing text message."""
        from src.services.dingtalk import DingTalkService

        with patch.object(DingTalkService, '__init__', lambda x, **kw: None):
            service = DingTalkService()

            data = {
                "msgtype": "text",
                "text": {"content": "开始访谈"},
                "senderStaffId": "user123",
                "conversationId": "conv001",
            }

            result = service.parse_webhook_message(data)

            assert result["msg_type"] == "text"
            assert result["user_id"] == "user123"
            assert result["content"] == "开始访谈"
            assert result["conversation_id"] == "conv001"

    def test_parse_voice_message(self):
        """Test parsing voice message."""
        from src.services.dingtalk import DingTalkService

        with patch.object(DingTalkService, '__init__', lambda x, **kw: None):
            service = DingTalkService()

            data = {
                "msgtype": "voice",
                "voiceCode": "voice_12345",
                "senderStaffId": "user456",
                "conversationId": "conv002",
            }

            result = service.parse_webhook_message(data)

            assert result["msg_type"] == "voice"
            assert result["user_id"] == "user456"

    def test_parse_message_with_missing_fields(self):
        """Test parsing message with missing fields."""
        from src.services.dingtalk import DingTalkService

        with patch.object(DingTalkService, '__init__', lambda x, **kw: None):
            service = DingTalkService()

            data = {"msgtype": "text"}

            result = service.parse_webhook_message(data)

            assert result["msg_type"] == "text"
            assert result["user_id"] == ""
            assert result["content"] == ""


class TestDingTalkServiceIntegration:
    """Integration tests with real DingTalk API (optional)."""

    @pytest.fixture
    def real_dingtalk_service(self):
        """Create real DingTalk service if credentials available."""
        app_key = os.environ.get("DINGTALK_APP_KEY")
        app_secret = os.environ.get("DINGTALK_APP_SECRET")
        agent_id = os.environ.get("DINGTALK_AGENT_ID")

        if not all([app_key, app_secret, agent_id]):
            pytest.skip("DingTalk credentials not configured")

        from src.services.dingtalk import DingTalkService
        return DingTalkService()

    @pytest.mark.skip_ci
    def test_get_access_token(self, real_dingtalk_service):
        """Test getting access token from DingTalk."""
        token = real_dingtalk_service.get_access_token()
        assert token is not None
        assert len(token) > 0

    @pytest.mark.skip_ci
    def test_send_text_message(self, real_dingtalk_service):
        """Test sending text message via DingTalk."""
        test_user_id = os.environ.get("DINGTALK_TEST_USER_ID")
        if not test_user_id:
            pytest.skip("DINGTALK_TEST_USER_ID not set")

        result = real_dingtalk_service.send_message(
            user_id=test_user_id,
            msg_type="text",
            content="[测试消息] 这是一条 E2E 测试消息，请忽略。"
        )

        assert result.get("code") == 0 or result.get("errcode") == 0


class TestWebhookWithDingTalk:
    """Test webhook endpoint with DingTalk integration."""

    def test_webhook_challenge_response(self, db_session):
        """Test webhook challenge response."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.models.database import get_db

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with TestClient(app) as client:
            resp = client.get("/api/webhook?challenge=test_challenge_123")
            assert resp.status_code == 200
            assert resp.json()["challenge"] == "test_challenge_123"

        app.dependency_overrides.clear()

    def test_webhook_signature_required(self, db_session):
        """Test that webhook requires valid signature."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.models.database import get_db

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with TestClient(app) as client:
            # Without signature headers
            resp = client.post(
                "/api/webhook",
                json={"msgtype": "text", "text": {"content": "test"}}
            )
            assert resp.status_code == 403

        app.dependency_overrides.clear()


# Fixtures
@pytest.fixture
def db_session():
    """Create in-memory database session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from src.models.database import Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()

    yield session

    session.close()
    engine.dispose()
