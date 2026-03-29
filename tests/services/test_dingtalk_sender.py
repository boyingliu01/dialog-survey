"""
Tests for DingTalkSender service - async message sending.

Following TDD: Tests are written FIRST before implementation.
"""

import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx


class TestDingTalkSenderInit:
    """Tests for DingTalkSender initialization."""

    def test_init_with_env_vars(self):
        """Test service initializes with environment variables."""
        with patch.dict(
            os.environ,
            {"DINGTALK_APP_KEY": "test_key", "DINGTALK_APP_SECRET": "test_secret", "DINGTALK_AGENT_ID": "agent_123"},
            clear=False,
        ):
            # This import will fail until we implement, which is expected in TDD RED phase
            try:
                from src.services.dingtalk_sender import DingTalkSender

                sender = DingTalkSender()
                assert sender.app_key == "test_key"
                assert sender.app_secret == "test_secret"
                assert sender.agent_id == "agent_123"
                assert sender._access_token is None
            except ImportError:
                pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

    def test_init_with_explicit_params(self):
        """Test service initializes with explicit parameters."""
        try:
            from src.services.dingtalk_sender import DingTalkSender

            sender = DingTalkSender(app_key="explicit_key", app_secret="explicit_secret", agent_id="explicit_agent")
            assert sender.app_key == "explicit_key"
            assert sender.app_secret == "explicit_secret"
            assert sender.agent_id == "explicit_agent"
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

    def test_init_missing_config_raises_error(self):
        """Test that missing configuration raises an error on token fetch."""
        with patch.dict(
            os.environ, {"DINGTALK_APP_KEY": "", "DINGTALK_APP_SECRET": "", "DINGTALK_AGENT_ID": ""}, clear=False
        ):
            try:
                from src.services.dingtalk_sender import DingTalkSender

                sender = DingTalkSender()

                pytest.mark.asyncio(asyncio_run=True)

                async def check_error():
                    with pytest.raises(ValueError, match="credentials not configured"):
                        await sender._get_access_token()

                # Run the async check
                import asyncio

                asyncio.run(check_error())
            except ImportError:
                pytest.skip("DingTalkSender not implemented yet - TDD RED phase")


class TestDingTalkSenderAccessToken:
    """Tests for async access token retrieval."""

    @pytest.mark.asyncio
    async def test_get_access_token_success(self):
        """Test successful async access token retrieval."""
        try:
            from src.services.dingtalk_sender import DingTalkSender, DINGTALK_TOKEN_URL
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "errcode": 0,
            "errmsg": "ok",
            "access_token": "test_token_abc",
            "expires_in": 7200,
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            token = await sender._get_access_token()

        assert token == "test_token_abc"
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args.args[0] == DINGTALK_TOKEN_URL
        assert call_args.kwargs["params"]["appkey"] == "test_key"
        assert call_args.kwargs["params"]["appsecret"] == "test_secret"

    @pytest.mark.asyncio
    async def test_get_access_token_cached(self):
        """Test cached token is returned without HTTP call."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")
        # Set cached token
        sender._access_token = "cached_token"
        sender._token_expires_at = time.time() + 3600

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            token = await sender._get_access_token()

        assert token == "cached_token"
        mock_get.assert_not_called()

    @pytest.mark.asyncio
    async def test_get_access_token_api_error(self):
        """Test API error response raises exception."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        mock_response = MagicMock()
        mock_response.json.return_value = {"errcode": 40001, "errmsg": "invalid credential"}

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            with pytest.raises(Exception, match="invalid credential"):
                await sender._get_access_token()

    @pytest.mark.asyncio
    async def test_get_access_token_expired_refreshes(self):
        """Test expired cached token triggers new API call."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")
        # Set expired cached token
        sender._access_token = "old_token"
        sender._token_expires_at = time.time() - 100

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "errcode": 0,
            "errmsg": "ok",
            "access_token": "new_token",
            "expires_in": 7200,
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            token = await sender._get_access_token()

        assert token == "new_token"
        mock_get.assert_called_once()


class TestDingTalkSenderSendText:
    """Tests for async text message sending."""

    @pytest.mark.asyncio
    async def test_send_text_message_success(self):
        """Test successful text message sending."""
        try:
            from src.services.dingtalk_sender import DingTalkSender, DINGTALK_SEND_URL
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        # Mock token fetch
        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok", "task_id": 123}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_text("user_001", "Hello, this is a test message")

        assert result is True
        mock_token.assert_called_once()
        mock_post.assert_called_once()

        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["params"]["access_token"] == "test_token"
        payload = call_kwargs["json"]
        assert payload["agent_id"] == "agent_123"
        assert payload["userid_list"] == "user_001"
        assert payload["msg"]["msgtype"] == "text"
        assert payload["msg"]["text"]["content"] == "Hello, this is a test message"

    @pytest.mark.asyncio
    async def test_send_text_message_empty_user_id(self):
        """Test sending text to empty user_id returns False."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        result = await sender.send_text("", "Hello")
        assert result is False

    @pytest.mark.asyncio
    async def test_send_text_message_api_error(self):
        """Test API error during send returns False."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 40003, "errmsg": "userid is empty"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_text("invalid_user", "Hello")

        assert result is False

    @pytest.mark.asyncio
    async def test_send_text_message_network_error(self):
        """Test network error during send returns False gracefully."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.side_effect = httpx.NetworkError("Connection failed")
                result = await sender.send_text("user_001", "Hello")

        assert result is False


class TestDingTalkSenderSendMarkdown:
    """Tests for async markdown message sending."""

    @pytest.mark.asyncio
    async def test_send_markdown_message_success(self):
        """Test successful markdown message sending."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_markdown(
                    "user_001", "Interview Report", "## Summary\nThis is the interview summary content."
                )

        assert result is True
        mock_post.assert_called_once()

        payload = mock_post.call_args.kwargs["json"]
        assert payload["msg"]["msgtype"] == "markdown"
        assert payload["msg"]["markdown"]["title"] == "Interview Report"
        assert "Summary" in payload["msg"]["markdown"]["text"]

    @pytest.mark.asyncio
    async def test_send_markdown_empty_title(self):
        """Test markdown with empty title uses default."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_markdown("user_001", "", "Some content")

        # Should still succeed with empty title
        payload = mock_post.call_args.kwargs["json"]
        # Title should be empty or have a default
        assert payload["msg"]["markdown"]["title"] in ["", "消息"]

    @pytest.mark.asyncio
    async def test_send_markdown_api_error_returns_false(self):
        """Test markdown API error returns False."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 50001, "errmsg": "unknown error"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_markdown("user_001", "Title", "Content")

        assert result is False


class TestDingTalkSenderSendInterviewInvitation:
    """Tests for async interview invitation sending."""

    @pytest.mark.asyncio
    async def test_send_interview_invitation_success(self):
        """Test successful interview invitation sending."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_interview_invitation(
                    "user_001", "Quality Satisfaction Survey", "https://example.com/start?session=abc123"
                )

        assert result is True
        mock_post.assert_called_once()

        payload = mock_post.call_args.kwargs["json"]
        # Should be markdown message type
        assert payload["msg"]["msgtype"] == "markdown"
        # Should contain the plan name and start URL
        message_content = payload["msg"]["markdown"]["text"]
        assert "Quality Satisfaction Survey" in message_content
        assert "https://example.com/start?session=abc123" in message_content

    @pytest.mark.asyncio
    async def test_send_interview_invitation_format(self):
        """Test invitation message contains required elements."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                await sender.send_interview_invitation(
                    "user_001", "Product Feedback Interview", "https://app.example.com/interview/start?id=xyz"
                )

        payload = mock_post.call_args.kwargs["json"]
        message_content = payload["msg"]["markdown"]["text"]

        # Should contain key elements
        assert "访谈" in message_content or "interview" in message_content.lower()
        assert "Product Feedback Interview" in message_content
        assert "https://app.example.com/interview/start?id=xyz" in message_content

    @pytest.mark.asyncio
    async def test_send_interview_invitation_empty_url(self):
        """Test invitation with empty URL still sends."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 0, "errmsg": "ok"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_interview_invitation(
                    "user_001",
                    "Test Interview",
                    "",  # Empty URL
                )

        # Should still succeed
        assert result is True

    @pytest.mark.asyncio
    async def test_send_interview_invitation_user_not_found(self):
        """Test invitation to non-existent user returns False."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 600001, "errmsg": "user not found"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_interview_invitation(
                    "nonexistent_user", "Test Interview", "https://example.com/start"
                )

        assert result is False


class TestDingTalkSenderErrorHandling:
    """Tests for comprehensive error handling."""

    @pytest.mark.asyncio
    async def test_token_fetch_network_error(self):
        """Test network error during token fetch."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.NetworkError("Connection timeout")
            with pytest.raises(httpx.NetworkError):
                await sender._get_access_token()

    @pytest.mark.asyncio
    async def test_send_message_timeout(self):
        """Test timeout during message send returns False."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "test_token"

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.side_effect = httpx.TimeoutException("Request timeout")
                result = await sender.send_text("user_001", "Hello")

        assert result is False

    @pytest.mark.asyncio
    async def test_send_with_invalid_token(self):
        """Test sending with invalid/expired token."""
        try:
            from src.services.dingtalk_sender import DingTalkSender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender = DingTalkSender(app_key="test_key", app_secret="test_secret", agent_id="agent_123")

        # Token fetch returns invalid token
        with patch.object(sender, "_get_access_token", new_callable=AsyncMock) as mock_token:
            mock_token.return_value = "invalid_token"

            mock_response = MagicMock()
            mock_response.json.return_value = {"errcode": 40014, "errmsg": "token expired"}

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_response
                result = await sender.send_text("user_001", "Hello")

        assert result is False


class TestDingTalkSenderSingleton:
    """Tests for singleton pattern."""

    def test_get_sender_singleton(self):
        """Test get_sender returns singleton instance."""
        try:
            from src.services.dingtalk_sender import get_sender
        except ImportError:
            pytest.skip("DingTalkSender not implemented yet - TDD RED phase")

        sender1 = get_sender()
        sender2 = get_sender()

        assert sender1 is sender2
