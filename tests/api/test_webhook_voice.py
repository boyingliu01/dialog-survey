"""
Tests for webhook voice message handling.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest


class TestWebhookVoiceHandling:
    """Tests for voice message handling in webhook."""

    def test_voice_handler_imports(self):
        """Test that voice handler imports work correctly."""
        from src.api.webhook import _handle_voice_message
        from src.services.asr import ASRServiceError, get_asr_service

        assert callable(_handle_voice_message)
        assert callable(get_asr_service)
        assert issubclass(ASRServiceError, Exception)

    @patch("src.api.webhook.get_asr_service")
    @patch("src.api.webhook.get_dingtalk_service")
    async def test_voice_message_no_media_id(self, mock_dingtalk, mock_asr):
        """Test voice message handling when no media_id is provided."""
        from src.api.webhook import _handle_voice_message

        # Mock services
        mock_db = MagicMock()
        mock_dingtalk_instance = Mock()
        mock_dingtalk.return_value = mock_dingtalk_instance

        # Test data with no media_id
        body = {
            "msgtype": "voice",
            "senderStaffId": "user123",
            "voice": {"duration": 5},
        }
        message_data = {
            "msg_type": "voice",
            "user_id": "user123",
            "content": "",
            # No media_id
        }

        result = await _handle_voice_message(
            body=body,
            user_id="user123",
            message_data=message_data,
            db=mock_db,
            dingtalk=mock_dingtalk_instance,
        )

        assert result["code"] == 400
        assert "无法获取语音文件" in result["message"]


class TestASRServiceWebhookIntegration:
    """Tests for ASR service integration with webhook."""

    def test_asr_service_singleton(self):
        """Test ASR service singleton pattern."""
        # Reset singleton for test
        import src.services.asr as asr_module
        from src.services.asr import get_asr_service
        original = asr_module._asr_service
        asr_module._asr_service = None

        try:
            service1 = get_asr_service()
            service2 = get_asr_service()

            assert service1 is service2
        finally:
            asr_module._asr_service = original

    def test_asr_error_classes(self):
        """Test ASR error exception classes."""
        from src.services.asr import ASRServiceError, AudioFormatError

        # Test ASRServiceError
        with pytest.raises(ASRServiceError) as exc_info:
            raise ASRServiceError("Test error message")
        assert "Test error message" in str(exc_info.value)

        # Test AudioFormatError
        with pytest.raises(AudioFormatError) as exc_info:
            raise AudioFormatError("Invalid format")
        assert "Invalid format" in str(exc_info.value)


class TestVoiceMessageEdgeCases:
    """Tests for voice message edge cases."""

    @patch("src.api.webhook.get_asr_service")
    @patch("src.api.webhook.get_dingtalk_service")
    async def test_voice_message_asr_service_error(self, mock_dingtalk, mock_asr):
        """Test handling of ASR service errors."""
        from src.api.webhook import _handle_voice_message
        from src.services.asr import ASRServiceError

        # Mock ASR service to raise error
        mock_asr_instance = Mock()
        mock_asr_instance.transcribe_async.side_effect = ASRServiceError("ASR failed")
        mock_asr.return_value = mock_asr_instance

        mock_db = MagicMock()
        mock_dingtalk_instance = Mock()
        mock_dingtalk.return_value = mock_dingtalk_instance

        body = {
            "msgtype": "voice",
            "senderStaffId": "user123",
            "voice": {"mediaId": "media123", "recognition": "http://example.com/audio.wav"},
        }
        message_data = {
            "msg_type": "voice",
            "user_id": "user123",
            "content": "",
            "media_id": "media123",
        }

        result = await _handle_voice_message(
            body=body,
            user_id="user123",
            message_data=message_data,
            db=mock_db,
            dingtalk=mock_dingtalk_instance,
        )

        assert result["code"] == 200
        assert "语音识别服务暂时不可用" in result["message"] or "请用文字发送" in result["message"]

    @patch("src.api.webhook.get_asr_service")
    @patch("src.api.webhook.get_dingtalk_service")
    async def test_voice_message_empty_transcription(self, mock_dingtalk, mock_asr):
        """Test handling of empty transcription result."""
        from src.api.webhook import _handle_voice_message

        # Mock ASR service to return empty result
        mock_asr_instance = Mock()
        mock_asr_instance.transcribe_async.return_value = "[识别结果为空]"
        mock_asr.return_value = mock_asr_instance

        mock_db = MagicMock()
        mock_dingtalk_instance = Mock()
        mock_dingtalk.return_value = mock_dingtalk_instance

        body = {
            "msgtype": "voice",
            "senderStaffId": "user123",
            "voice": {"mediaId": "media123", "recognition": "http://example.com/audio.wav"},
        }
        message_data = {
            "msg_type": "voice",
            "user_id": "user123",
            "content": "",
            "media_id": "media123",
        }

        result = await _handle_voice_message(
            body=body,
            user_id="user123",
            message_data=message_data,
            db=mock_db,
            dingtalk=mock_dingtalk_instance,
        )

        # Should return graceful message about empty transcription
        assert result["code"] == 200


class TestVoiceHandlerImports:
    """Tests for voice handler module imports."""

    def test_voice_handler_import(self):
        """Test that voice handler can be imported."""
        from src.api.webhook import _handle_voice_message
        assert callable(_handle_voice_message)

    def test_asr_imports(self):
        """Test ASR service imports."""
        from src.services.asr import (
            ASRService,
            ASRServiceError,
            AudioFormatError,
            get_asr_service,
        )
        assert ASRService is not None
        assert callable(get_asr_service)
        assert issubclass(ASRServiceError, Exception)
        assert issubclass(AudioFormatError, Exception)
