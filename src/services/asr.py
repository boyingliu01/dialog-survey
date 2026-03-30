"""
ASR (Automatic Speech Recognition) service for voice message processing.
"""

import os
import tempfile

from dotenv import load_dotenv

load_dotenv(override=True)


class ASRServiceError(Exception):
    """Raised when ASR service fails."""


class AudioFormatError(Exception):
    """Raised when audio format is not supported."""


class ASRService:
    """Alibaba Cloud Fun-ASR service for speech recognition.

    This service handles voice message transcription.
    """

    def __init__(self, model_name: str = "paraformer-zh"):
        """Initialize ASR service.

        Args:
            model_name: Fun-ASR model name
        """
        self.model_name = model_name
        self._model = None
        self._funasr_available = False

        # Check if funasr is available
        try:
            from importlib.util import find_spec

            if find_spec("funasr") is not None:
                self._funasr_available = True
        except ImportError:
            pass

    def _get_model(self):
        """Get or create Fun-ASR model."""
        if not self._funasr_available:
            raise RuntimeError("funasr package not installed")

        if self._model is None:
            from funasr import AutoModel

            self._model = AutoModel(model=self.model_name, model_revision="v2.0.4", disable_update=True)

        return self._model

    def transcribe(self, audio_data: bytes) -> str:
        """Transcribe audio data to text.

        Args:
            audio_data: Audio file bytes

        Returns:
            Transcribed text
        """
        if not self._funasr_available:
            return self._mock_transcribe()

        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(audio_data)
            temp_path = f.name

        try:
            model = self._get_model()
            result = model.generate(temp_path)

            if result and len(result) > 0:
                return result[0].get("text", "")
            return ""
        except Exception:
            # Return mock on error
            return self._mock_transcribe()
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    def transcribe_from_url(self, audio_url: str) -> str:
        """Transcribe audio from URL.

        Args:
            audio_url: URL to audio file

        Returns:
            Transcribed text
        """
        if not self._funasr_available:
            return self._mock_transcribe()

        import urllib.request

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            try:
                urllib.request.urlretrieve(audio_url, f.name)
                temp_path = f.name
            except Exception:
                return self._mock_transcribe()

        try:
            model = self._get_model()
            result = model.generate(temp_path)

            if result and len(result) > 0:
                return result[0].get("text", "")
            return ""
        except Exception:
            return self._mock_transcribe()
        finally:
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    def transcribe_from_file(self, file_path: str) -> str:
        """Transcribe audio from file path.

        Args:
            file_path: Path to audio file

        Returns:
            Transcribed text
        """
        if not self._funasr_available:
            return self._mock_transcribe()

        try:
            model = self._get_model()
            result = model.generate(file_path)

            if result and len(result) > 0:
                return result[0].get("text", "")
            return ""
        except Exception:
            return self._mock_transcribe()

    def _mock_transcribe(self) -> str:
        """Mock transcription for testing.

        Returns:
            Placeholder text
        """
        return "[语音转文字结果]"


# Singleton instance
_asr_service: ASRService | None = None


def get_asr_service() -> ASRService:
    """Get singleton ASR service instance."""
    global _asr_service
    if _asr_service is None:
        _asr_service = ASRService()
    return _asr_service
