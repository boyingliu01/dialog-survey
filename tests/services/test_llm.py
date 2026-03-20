"""
Tests for Qwen LLM service.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from src.services.llm import QwenService


class TestQwenService:
    """Tests for QwenService."""

    @patch("src.services.llm.load_dotenv")
    def test_init_with_defaults(self, mock_dotenv):
        """Test initialization with defaults."""
        service = QwenService()
        assert service.model == "qwen-max"
        assert service.api_key is not None  # From env

    @patch("src.services.llm.load_dotenv")
    def test_init_with_custom_model(self, mock_dotenv):
        """Test initialization with custom model."""
        service = QwenService(model="qwen-turbo")
        assert service.model == "qwen-turbo"

    @patch("src.services.llm.load_dotenv")
    def test_chat_returns_mock_when_not_available(self, mock_dotenv):
        """Test chat returns mock when dashscope not available."""
        service = QwenService()
        service._dashscope_available = False

        result = service.chat([{"role": "user", "content": "Hello"}])

        assert result == "这是模拟回复。"

    @patch("src.services.llm.load_dotenv")
    def test_is_followup_needed_parses_json(self, mock_dotenv):
        """Test is_followup_needed parses JSON correctly."""
        service = QwenService()
        service._dashscope_available = False

        history = [
            {"role": "assistant", "content": "问题"},
            {"role": "user", "content": "回答"},
        ]

        needs, ftype, reason = service.is_followup_needed(history, {})

        assert isinstance(needs, bool)
        assert isinstance(ftype, str)
        assert isinstance(reason, str)

    @patch("src.services.llm.load_dotenv")
    def test_generate_followup(self, mock_dotenv):
        """Test generate follow-up."""
        service = QwenService()
        service._dashscope_available = False

        result = service.generate_followup(
            user_answer="产品还可以", followup_type="deep", domain_context="质量评估"
        )

        assert isinstance(result, str)
        assert len(result) > 0

    @patch("src.services.llm.load_dotenv")
    def test_generate_report(self, mock_dotenv):
        """Test generate report."""
        service = QwenService()
        service._dashscope_available = False

        history = [
            {"role": "assistant", "content": "问题1"},
            {"role": "user", "content": "回答1"},
        ]
        topics = [{"name": "产品质量", "description": "评价"}]

        result = service.generate_report(history, topics, "质量满意度调查")

        assert isinstance(result, str)
        assert len(result) > 0


class TestPrompts:
    """Tests for prompt templates."""

    def test_system_prompt_not_empty(self):
        """Test system prompt is defined."""
        from src.services.prompts import SYSTEM_PROMPT

        assert len(SYSTEM_PROMPT) > 0

    def test_followup_judge_prompt_has_placeholder(self):
        """Test follow-up judge prompt has placeholders."""
        from src.services.prompts import FOLLOWUP_JUDGE_PROMPT

        assert "{conversation_history}" in FOLLOWUP_JUDGE_PROMPT
        assert "{extracted_info}" in FOLLOWUP_JUDGE_PROMPT

    def test_followup_generate_prompt_has_placeholders(self):
        """Test follow-up generate prompt has placeholders."""
        from src.services.prompts import FOLLOWUP_GENERATE_PROMPT

        assert "{user_answer}" in FOLLOWUP_GENERATE_PROMPT
        assert "{followup_type}" in FOLLOWUP_GENERATE_PROMPT
        assert "{domain_context}" in FOLLOWUP_GENERATE_PROMPT

    def test_report_generate_prompt_has_placeholders(self):
        """Test report generate prompt has placeholders."""
        from src.services.prompts import REPORT_GENERATE_PROMPT

        assert "{topic}" in REPORT_GENERATE_PROMPT
        assert "{topics}" in REPORT_GENERATE_PROMPT
        assert "{conversation_history}" in REPORT_GENERATE_PROMPT


class TestQwenServiceRetry:
    """Tests for retry and timeout behavior in QwenService.chat()."""

    def _make_service(self):
        """Create a QwenService with dashscope marked available."""
        service = QwenService()
        service._dashscope_available = True
        return service

    def _make_success_response(self):
        """Build a mock successful dashscope response."""
        response = MagicMock()
        response.status_code = 200
        response.output.choices[0].message.content = "success"
        return response

    @patch("src.services.llm.load_dotenv")
    def test_chat_retries_on_failure_then_succeeds(self, mock_dotenv):
        """First two calls raise RuntimeError; third call succeeds."""
        service = self._make_service()
        success_response = self._make_success_response()

        call_side_effects = [
            RuntimeError("network error"),
            RuntimeError("network error"),
            success_response,
        ]

        with patch.object(service, "_get_client") as mock_get_client:
            mock_client = Mock()
            mock_client.call.side_effect = call_side_effects
            mock_get_client.return_value = mock_client

            with patch("src.services.llm.time.sleep"):
                result = service.chat([{"role": "user", "content": "hello"}])

        assert result == "success"
        assert mock_client.call.call_count == 3

    @patch("src.services.llm.load_dotenv")
    def test_chat_raises_after_max_retries(self, mock_dotenv):
        """All calls fail; should raise after MAX_RETRIES+1 attempts."""
        service = self._make_service()

        with patch.object(service, "_get_client") as mock_get_client:
            mock_client = Mock()
            mock_client.call.side_effect = RuntimeError("always fails")
            mock_get_client.return_value = mock_client

            with patch("src.services.llm.time.sleep"):
                with pytest.raises(Exception):
                    service.chat([{"role": "user", "content": "hello"}])

        # default MAX_LLM_RETRIES=2 means 3 total attempts
        assert mock_client.call.call_count == 3

    @patch("src.services.llm.load_dotenv")
    def test_retry_uses_exponential_backoff(self, mock_dotenv):
        """sleep() should be called with 1, then 2 seconds between retries."""
        service = self._make_service()
        success_response = self._make_success_response()

        call_side_effects = [RuntimeError("e1"), RuntimeError("e2"), success_response]

        with patch.object(service, "_get_client") as mock_get_client:
            mock_client = Mock()
            mock_client.call.side_effect = call_side_effects
            mock_get_client.return_value = mock_client

            with patch("src.services.llm.time.sleep") as mock_sleep:
                service.chat([{"role": "user", "content": "hello"}])

        sleep_calls = [c.args[0] for c in mock_sleep.call_args_list]
        assert sleep_calls == [1, 2]

    @patch("src.services.llm.load_dotenv")
    def test_max_retries_configurable_via_env(self, mock_dotenv, monkeypatch):
        """MAX_LLM_RETRIES=1 means only 2 total attempts."""
        monkeypatch.setenv("MAX_LLM_RETRIES", "1")
        service = self._make_service()

        with patch.object(service, "_get_client") as mock_get_client:
            mock_client = Mock()
            mock_client.call.side_effect = RuntimeError("always fails")
            mock_get_client.return_value = mock_client

            with patch("src.services.llm.time.sleep"):
                with pytest.raises(Exception):
                    service.chat([{"role": "user", "content": "hello"}])

        assert mock_client.call.call_count == 2

    @patch("src.services.llm.load_dotenv")
    def test_chat_timeout_raises_on_slow_call(self, mock_dotenv, monkeypatch):
        """A call that blocks longer than LLM_TIMEOUT should raise TimeoutError and be retried."""
        monkeypatch.setenv("LLM_TIMEOUT", "1")
        # Make all attempts time out so we see an exception bubbled up
        monkeypatch.setenv("MAX_LLM_RETRIES", "0")
        service = self._make_service()

        import threading

        def slow_call(**kwargs):
            # Block for longer than LLM_TIMEOUT without using time.sleep
            threading.Event().wait(timeout=10)
            return self._make_success_response()

        with patch.object(service, "_get_client") as mock_get_client:
            mock_client = Mock()
            mock_client.call.side_effect = slow_call
            mock_get_client.return_value = mock_client

            with patch("src.services.llm.time.sleep"):
                with pytest.raises((TimeoutError, Exception)):
                    service.chat([{"role": "user", "content": "hello"}])

    @patch("src.services.llm.load_dotenv")
    def test_mock_fallback_not_retried(self, mock_dotenv):
        """When dashscope is unavailable, _mock_response is returned without retrying."""
        service = QwenService()
        service._dashscope_available = False

        with patch.object(service, "_get_client") as mock_get_client:
            result = service.chat([{"role": "user", "content": "hello"}])

        mock_get_client.assert_not_called()
        assert result == "这是模拟回复。"
