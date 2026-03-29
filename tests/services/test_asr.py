"""
Tests for ASR service.
"""

from unittest.mock import Mock, patch

import pytest

from src.services.asr import ASRService


class TestASRService:
    """Tests for ASRService."""

    @patch("src.services.asr.load_dotenv")
    def test_init_with_defaults(self, mock_dotenv):
        """Test initialization with defaults."""
        service = ASRService()
        assert service.model_name == "paraformer-zh"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_returns_mock_when_not_available(self, mock_dotenv):
        """Test transcribe returns mock when funasr not available."""
        service = ASRService()
        service._funasr_available = False

        result = service.transcribe(b"fake audio data")

        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_from_url_returns_mock_when_not_available(self, mock_dotenv):
        """Test transcribe_from_url returns mock when not available."""
        service = ASRService()
        service._funasr_available = False

        result = service.transcribe_from_url("http://example.com/audio.wav")

        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_from_file_returns_mock_when_not_available(self, mock_dotenv):
        """Test transcribe_from_file returns mock when not available."""
        service = ASRService()
        service._funasr_available = False

        result = service.transcribe_from_file("/path/to/audio.wav")

        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_init_with_custom_model_name(self, mock_dotiznv):
        """Test initialization with custom model name."""
        service = ASRService(model_name="custom-model")
        assert service.model_name == "custom-model"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_handles_exception(self, mock_dotenv, tmp_path):
        """Test transcribe handles exceptions gracefully."""
        service = ASRService()
        # Even if funasr_available is True, an exception should return mock
        service._funasr_available = True

        # Mock _get_model to raise an exception
        def raise_exception():
            raise RuntimeError("Model error")

        service._get_model = raise_exception

        result = service.transcribe(b"fake audio data")
        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_from_url_handles_exception(self, mock_dotenv):
        """Test transcribe_from_url handles exceptions gracefully."""
        service = ASRService()
        service._funasr_available = True

        # Mock _get_model to raise an exception
        def raise_exception():
            raise RuntimeError("Network error")

        service._get_model = raise_exception

        result = service.transcribe_from_url("http://example.com/audio.wav")
        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_from_file_handles_exception(self, mock_dotenv):
        """Test transcribe_from_file handles exceptions gracefully."""
        service = ASRService()
        service._funasr_available = True

        # Mock _get_model to raise an exception
        def raise_exception():
            raise RuntimeError("File read error")

        service._get_model = raise_exception

        result = service.transcribe_from_file("/path/to/audio.wav")
        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_from_url_handles_urllib_error(self, mock_dotenv):
        """Test transcribe_from_url handles urllib error."""
        service = ASRService()
        service._funasr_available = True

        # Mock _get_model to raise an exception
        def raise_exception():
            raise RuntimeError("Download error")

        service._get_model = raise_exception

        result = service.transcribe_from_url("http://invalid-url/audio.wav")
        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_mock_transcribe_returns_placeholder(self, mock_dotenv):
        """Test _mock_transcribe returns placeholder text."""
        service = ASRService()

        result = service._mock_transcribe()

        assert result == "[语音转文字结果]"

    @patch("src.services.asr.load_dotenv")
    def test_get_model_raises_when_funasr_not_available(self, mock_dotenv):
        """Test _get_model raises when funasr not available."""
        service = ASRService()
        service._funasr_available = False

        with pytest.raises(RuntimeError, match="funasr package not installed"):
            service._get_model()

    @patch("src.services.asr.load_dotenv")
    def test_transcribe_returns_empty_on_no_result(self, mock_dotenv):
        """Test transcribe returns empty string when no result."""
        service = ASRService()
        service._funasr_available = True

        # Mock model that returns empty result
        mock_model = Mock()
        mock_model.generate.return_value = []

        service._model = mock_model

        result = service.transcribe(b"audio data")
        assert result == ""
