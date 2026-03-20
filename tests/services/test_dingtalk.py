"""
Tests for DingTalk service.
"""

import time
import pytest
from unittest.mock import Mock, patch, MagicMock
from src.services.dingtalk import DingTalkService


class TestDingTalkSignature:
    """Tests for signature verification."""

    def test_verify_signature_no_secret(self):
        """Test signature verification skipped when no secret configured."""
        service = DingTalkService(app_secret="")
        result = service.verify_signature("123", "signature", "nonce")
        assert result is True

    def test_verify_signature_returns_bool(self):
        """Test verify_signature returns bool with real secret."""
        service = DingTalkService(app_secret="test_secret")
        result = service.verify_signature("123456", "invalid_sig", "nonce")
        assert isinstance(result, bool)
        assert result is False


class TestDingTalkAccessToken:
    """Tests for access token retrieval."""

    def test_get_access_token_no_credentials(self):
        """Test get_access_token raises exception without credentials."""
        service = DingTalkService(app_key="", app_secret="")
        with pytest.raises(Exception) as exc_info:
            service.get_access_token()
        assert "not configured" in str(exc_info.value)

    def test_get_access_token_success(self):
        """Test successful access token retrieval from DingTalk API."""
        service = DingTalkService(app_key="test_key", app_secret="test_secret")

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errcode": 0,
            "errmsg": "ok",
            "access_token": "real_token_abc123",
            "expires_in": 7200,
        }

        with patch("httpx.get", return_value=mock_response) as mock_get:
            token = service.get_access_token()

        assert token == "real_token_abc123"
        mock_get.assert_called_once_with(
            "https://oapi.dingtalk.com/gettoken",
            params={"appkey": "test_key", "appsecret": "test_secret"},
            timeout=10,
        )

    def test_get_access_token_cached(self):
        """Test that a valid cached token is returned without HTTP call."""
        service = DingTalkService(app_key="test_key", app_secret="test_secret")
        service._access_token = "cached_token"
        service._token_expires_at = time.time() + 3600  # still valid

        with patch("httpx.get") as mock_get:
            token = service.get_access_token()

        assert token == "cached_token"
        mock_get.assert_not_called()

    def test_get_access_token_expired_cache_refreshes(self):
        """Test that an expired cached token triggers a new API call."""
        service = DingTalkService(app_key="test_key", app_secret="test_secret")
        service._access_token = "old_token"
        service._token_expires_at = time.time() - 1  # already expired

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errcode": 0,
            "errmsg": "ok",
            "access_token": "new_token",
            "expires_in": 7200,
        }

        with patch("httpx.get", return_value=mock_response):
            token = service.get_access_token()

        assert token == "new_token"

    def test_get_access_token_api_error(self):
        """Test get_access_token raises on API-level error response."""
        service = DingTalkService(app_key="test_key", app_secret="test_secret")

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"errcode": 40001, "errmsg": "invalid credential"}

        with patch("httpx.get", return_value=mock_response):
            with pytest.raises(Exception) as exc_info:
                service.get_access_token()

        assert "invalid credential" in str(exc_info.value)


class TestDingTalkSendMessage:
    """Tests for message sending."""

    def _make_service(self):
        return DingTalkService(
            app_key="test_key", app_secret="test_secret", agent_id="agent_001"
        )

    def _mock_send_response(self, errcode=0, errmsg="ok"):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"errcode": errcode, "errmsg": errmsg}
        return mock_resp

    def test_send_text_message_success(self):
        """Test successful text message send."""
        service = self._make_service()

        with patch.object(service, "get_access_token", return_value="tok"), \
             patch("httpx.post", return_value=self._mock_send_response()) as mock_post:
            result = service.send_message("user123", "text", "Hello")

        assert result["code"] == 0
        assert result["user_id"] == "user123"
        assert result["msg_type"] == "text"

        call_kwargs = mock_post.call_args
        assert call_kwargs.kwargs["params"]["access_token"] == "tok"
        assert call_kwargs.kwargs["json"]["userid_list"] == "user123"
        assert call_kwargs.kwargs["json"]["msg"]["msgtype"] == "text"
        assert call_kwargs.kwargs["json"]["msg"]["text"]["content"] == "Hello"

    def test_send_markdown_message(self):
        """Test markdown message uses correct payload structure."""
        service = self._make_service()

        with patch.object(service, "get_access_token", return_value="tok"), \
             patch("httpx.post", return_value=self._mock_send_response()) as mock_post:
            result = service.send_message("user123", "markdown", "# 标题\n内容")

        assert result["code"] == 0
        call_json = mock_post.call_args.kwargs["json"]
        assert call_json["msg"]["msgtype"] == "markdown"
        assert call_json["msg"]["markdown"]["title"] == "标题"
        assert "内容" in call_json["msg"]["markdown"]["text"]

    def test_send_message_uses_agent_id(self):
        """Test that agent_id is included in the request payload."""
        service = self._make_service()

        with patch.object(service, "get_access_token", return_value="tok"), \
             patch("httpx.post", return_value=self._mock_send_response()) as mock_post:
            service.send_message("user123", "text", "hi")

        assert mock_post.call_args.kwargs["json"]["agent_id"] == "agent_001"

    def test_send_message_api_error_raises(self):
        """Test send_message raises Exception on DingTalk API error."""
        service = self._make_service()

        with patch.object(service, "get_access_token", return_value="tok"), \
             patch("httpx.post", return_value=self._mock_send_response(40003, "userid is empty")):
            with pytest.raises(Exception) as exc_info:
                service.send_message("", "text", "Hello")

        assert "userid is empty" in str(exc_info.value)

    def test_send_message_calls_get_access_token(self):
        """Test that send_message always fetches a token first."""
        service = self._make_service()

        with patch.object(service, "get_access_token", return_value="tok") as mock_token, \
             patch("httpx.post", return_value=self._mock_send_response()):
            service.send_message("user1", "text", "hi")

        mock_token.assert_called_once()


class TestDingTalkParseMessage:
    """Tests for webhook message parsing."""

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
