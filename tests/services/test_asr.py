"""
Tests for ASR service.
"""

import pytest
from unittest.mock import Mock, patch
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
