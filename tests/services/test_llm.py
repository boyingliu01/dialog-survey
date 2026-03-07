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
