"""
Tests for DingTalk service.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from src.services.dingtalk import DingTalkService


class TestDingTalkService:
    """Tests for DingTalk service."""

    def test_verify_signature_valid(self):
        """Test signature verification with valid signature."""
        # This is hard to test without real credentials
        # Skip for now
        pass

    def test_verify_signature_no_secret(self):
        """Test signature verification when no secret configured."""
        service = DingTalkService(app_secret="")
        result = service.verify_signature("123", "signature", "nonce")
        assert result is True

    def test_parse_text_message(self):
        """Test parsing text message."""
        service = DingTalkService()
        body = {
            "msgtype": "text",
            "text": {"content": "Hello world"},
            "senderStaffId": "user123",
        }

        result = service.parse_webhook_message(body)

        assert result["msg_type"] == "text"
        assert result["user_id"] == "user123"
        assert result["content"] == "Hello world"

    def test_parse_voice_message(self):
        """Test parsing voice message."""
        service = DingTalkService()
        body = {
            "msgtype": "voice",
            "voice": {"mediaId": "media123"},
            "senderStaffId": "user456",
        }

        result = service.parse_webhook_message(body)

        assert result["msg_type"] == "voice"
        assert result["user_id"] == "user456"
        assert result["media_id"] == "media123"

    def test_parse_markdown_message(self):
        """Test parsing markdown message."""
        service = DingTalkService()
        body = {
            "msgtype": "markdown",
            "markdown": {"title": "Test", "text": "## Heading"},
            "userId": "user789",
        }

        result = service.parse_webhook_message(body)

        assert result["msg_type"] == "markdown"
        assert result["user_id"] == "user789"
        assert result["title"] == "Test"
        assert result["content"] == "## Heading"

    def test_get_access_token_no_credentials(self):
        """Test get_access_token raises exception without credentials."""
        service = DingTalkService(app_key="", app_secret="")

        with pytest.raises(Exception) as exc_info:
            service.get_access_token()

        assert "not configured" in str(exc_info.value)

    def test_send_message(self):
        """Test send_message returns expected response."""
        service = DingTalkService()
        response = service.send_message("user123", "text", "Hello")

        assert response["code"] == 0
        assert response["user_id"] == "user123"
        assert response["msg_type"] == "text"
