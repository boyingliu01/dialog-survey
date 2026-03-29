"""
Tests for LLM service using OpenAI-compatible API.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.services.llm import LLMService


class TestLLMService:
    """Tests for LLMService."""

    @patch("src.services.llm.load_dotenv")
    def test_init_with_defaults(self, mock_dotenv, monkeypatch):
        """Test initialization with defaults."""
        # Set env vars before service init
        monkeypatch.setenv("ANTHROPIC_MODEL", "glm-5")
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key-default")
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        service = LLMService()
        assert service.model == "glm-5"
        assert service.api_key == "test-key-default"

    @patch("src.services.llm.load_dotenv")
    def test_init_with_custom_model(self, mock_dotenv, monkeypatch):
        """Test initialization with custom model."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService(model="glm-4")
        assert service.model == "glm-4"

    @patch("src.services.llm.load_dotenv")
    def test_init_with_custom_params(self, mock_dotenv):
        """Test initialization with custom parameters."""
        service = LLMService(model="custom-model", api_key="custom-key", base_url="https://custom.url")
        assert service.model == "custom-model"
        assert service.api_key == "custom-key"
        assert service.base_url == "https://custom.url"

    @patch("src.services.llm.load_dotenv")
    def test_chat_with_mocked_client(self, mock_dotenv, monkeypatch):
        """Test chat with mocked OpenAI client."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        # Mock the client's chat.completions.create
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "测试回复"

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.chat([{"role": "user", "content": "Hello"}])

        assert result == "测试回复"

    @patch("src.services.llm.load_dotenv")
    def test_chat_with_system_prompt(self, mock_dotenv, monkeypatch):
        """Test chat includes system prompt."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "回复"

        with patch.object(service._client.chat.completions, "create", return_value=mock_response) as mock_create:
            service.chat([{"role": "user", "content": "Hello"}], system_prompt="你是一个助手")

        # Verify system prompt was included
        call_args = mock_create.call_args
        messages = call_args[1]["messages"]
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "你是一个助手"


class TestPrompts:
    """Tests for prompt templates."""

    def test_base_system_prompt_not_empty(self):
        """Test base system prompt is defined."""
        from src.services.prompts import BASE_SYSTEM_PROMPT_TEMPLATE

        assert len(BASE_SYSTEM_PROMPT_TEMPLATE) > 0
        assert "{role_name}" in BASE_SYSTEM_PROMPT_TEMPLATE

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

    def test_report_generate_prompt_has_placeholders(self):
        """Test report generate prompt has placeholders."""
        from src.services.prompts import REPORT_GENERATE_PROMPT

        assert "{topic}" in REPORT_GENERATE_PROMPT
        assert "{topics}" in REPORT_GENERATE_PROMPT
        assert "{conversation_history}" in REPORT_GENERATE_PROMPT

    def test_opening_question_prompt_has_placeholders(self):
        """Test opening question prompt has placeholders."""
        from src.services.prompts import OPENING_QUESTION_PROMPT

        assert "{topic_name}" in OPENING_QUESTION_PROMPT
        assert "{first_topic}" in OPENING_QUESTION_PROMPT

    def test_next_question_prompt_has_placeholders(self):
        """Test next question prompt has placeholders."""
        from src.services.prompts import NEXT_QUESTION_PROMPT

        assert "{conversation_history}" in NEXT_QUESTION_PROMPT

    def test_default_personas_defined(self):
        """Test default personas are defined."""
        from src.services.prompts import DEFAULT_PERSONAS

        assert isinstance(DEFAULT_PERSONAS, dict)
        assert len(DEFAULT_PERSONAS) > 0

    def test_build_system_prompt_defaults(self):
        """Test build_system_prompt with default values."""
        from src.services.prompts import build_system_prompt

        result = build_system_prompt()

        assert "用户体验研究员" in result
        assert "用户访谈" in result
        assert "友善、善于倾听" in result

    def test_build_system_prompt_custom(self):
        """Test build_system_prompt with custom values."""
        from src.services.prompts import build_system_prompt

        result = build_system_prompt(
            role_name="产品经理",
            personality="专业、务实",
            conversation_style="直接高效",
            tone="专业简洁",
            topic_name="产品反馈调研",
            topic_scope="功能体验、改进建议",
        )

        assert "产品经理" in result
        assert "产品反馈调研" in result
        assert "专业、务实" in result
        assert "直接高效" in result

    def test_format_conversation_history(self):
        """Test format_conversation_history formats correctly."""
        from src.services.prompts import format_conversation_history

        history = [
            {"role": "assistant", "content": "你好，请问产品质量如何？"},
            {"role": "user", "content": "质量还不错"},
            {"role": "assistant", "content": "能具体说说吗？"},
        ]

        result = format_conversation_history(history)

        assert "访谈者: 你好" in result
        assert "用户: 质量还不错" in result
        assert "访谈者: 能具体说说" in result

    def test_format_conversation_history_limits_to_10(self):
        """Test format_conversation_history limits to last 10 messages."""
        from src.services.prompts import format_conversation_history

        # Create 15 messages
        history = [{"role": "user", "content": f"Message {i}"} for i in range(15)]

        result = format_conversation_history(history)
        lines = [line for line in result.split("\n") if line.strip()]

        # Should only have last 10 messages
        assert len(lines) == 10
        assert "Message 5" in result  # 15 - 10 = 5, so message 5 should be first
        assert "Message 14" in result  # Last message

    def test_get_persona_config_default(self):
        """Test get_persona_config returns default persona."""
        from src.services.prompts import DEFAULT_PERSONAS, get_persona_config

        result = get_persona_config()
        assert result == DEFAULT_PERSONAS["friendly_researcher"]

    def test_get_persona_config_specific(self):
        """Test get_persona_config returns specific persona."""
        from src.services.prompts import DEFAULT_PERSONAS, get_persona_config

        result = get_persona_config("professional_consultant")
        assert result == DEFAULT_PERSONAS["professional_consultant"]
        assert result["role_name"] == "专业咨询顾问"

    def test_get_persona_config_unknown_returns_default(self):
        """Test get_persona_config returns default for unknown ID."""
        from src.services.prompts import DEFAULT_PERSONAS, get_persona_config

        result = get_persona_config("nonexistent_persona")
        assert result == DEFAULT_PERSONAS["friendly_researcher"]

    def test_transition_prompt_has_placeholders(self):
        """Test transition prompt has required placeholders."""
        from src.services.prompts import TRANSITION_PROMPT

        assert "{completed_topic}" in TRANSITION_PROMPT
        assert "{next_topic}" in TRANSITION_PROMPT
        assert "{conversation_history}" in TRANSITION_PROMPT

    def test_all_personas_have_required_fields(self):
        """Test all personas have required configuration fields."""
        from src.services.prompts import DEFAULT_PERSONAS

        required_fields = ["role_name", "personality", "conversation_style", "tone"]

        for persona_id, config in DEFAULT_PERSONAS.items():
            for field in required_fields:
                assert field in config, f"Persona '{persona_id}' missing field '{field}'"
                assert len(config[field]) > 0, f"Persona '{persona_id}' has empty field '{field}'"


class TestLLMServiceRetry:
    """Tests for retry and timeout behavior in LLMService.chat()."""

    def _make_service(self, monkeypatch):
        """Create a LLMService with mocked client."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        return LLMService()

    def _make_success_response(self):
        """Build a mock successful OpenAI response."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "success"
        return mock_response

    @patch("src.services.llm.load_dotenv")
    def test_chat_retries_on_failure_then_succeeds(self, mock_dotenv, monkeypatch):
        """First two calls raise error; third call succeeds."""
        service = self._make_service(monkeypatch)
        success_response = self._make_success_response()

        call_side_effects = [
            RuntimeError("network error"),
            RuntimeError("network error"),
            success_response,
        ]

        with (
            patch.object(service._client.chat.completions, "create", side_effect=call_side_effects) as mock_create,
            patch("src.services.llm.time.sleep"),
        ):
            result = service.chat([{"role": "user", "content": "hello"}])

        assert result == "success"
        assert mock_create.call_count == 3

    @patch("src.services.llm.load_dotenv")
    def test_chat_raises_after_max_retries(self, mock_dotenv, monkeypatch):
        """All calls fail; should raise after MAX_RETRIES+1 attempts."""
        service = self._make_service(monkeypatch)

        with (
            patch.object(
                service._client.chat.completions,
                "create",
                side_effect=RuntimeError("always fails"),
            ) as mock_create,
            patch("src.services.llm.time.sleep"),
            pytest.raises(RuntimeError, match="always fails"),
        ):
            service.chat([{"role": "user", "content": "hello"}])

        # default MAX_LLM_RETRIES=2 means 3 total attempts
        assert mock_create.call_count == 3

    @patch("src.services.llm.load_dotenv")
    def test_max_retries_configurable_via_env(self, mock_dotenv, monkeypatch):
        """MAX_LLM_RETRIES=1 means only 2 total attempts."""
        monkeypatch.setenv("MAX_LLM_RETRIES", "1")
        service = self._make_service(monkeypatch)

        with (
            patch.object(
                service._client.chat.completions,
                "create",
                side_effect=RuntimeError("always fails"),
            ) as mock_create,
            patch("src.services.llm.time.sleep"),
            pytest.raises(RuntimeError),
        ):
            service.chat([{"role": "user", "content": "hello"}])

        assert mock_create.call_count == 2

    @patch("src.services.llm.load_dotenv")
    def test_retry_uses_exponential_backoff(self, mock_dotenv, monkeypatch):
        """sleep() should be called with 1, then 2 seconds between retries."""
        service = self._make_service(monkeypatch)
        success_response = self._make_success_response()

        call_side_effects = [RuntimeError("e1"), RuntimeError("e2"), success_response]

        with (
            patch.object(service._client.chat.completions, "create", side_effect=call_side_effects),
            patch("src.services.llm.time.sleep") as mock_sleep,
        ):
            service.chat([{"role": "user", "content": "hello"}])

        sleep_calls = [c.args[0] for c in mock_sleep.call_args_list]
        assert sleep_calls == [1, 2]


class TestLLMServiceMethods:
    """Tests for specific LLMService methods."""

    @patch("src.services.llm.load_dotenv")
    def test_is_followup_needed_with_mocked_client(self, mock_dotenv, monkeypatch):
        """Test is_followup_needed returns parsed result."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        # Mock response for followup judgment
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[
            0
        ].message.content = '{"needs_followup": true, "followup_type": "clarification", "followup_reason": "回答模糊"}'

        history = [
            {"role": "assistant", "content": "问题"},
            {"role": "user", "content": "回答"},
        ]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            needs, ftype, reason = service.is_followup_needed(history, {})

        assert isinstance(needs, bool)
        assert isinstance(ftype, str)
        assert isinstance(reason, str)

    @patch("src.services.llm.load_dotenv")
    def test_generate_report_with_mocked_client(self, mock_dotenv, monkeypatch):
        """Test generate_report returns markdown."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "# 测试报告\n\n内容..."

        history = [
            {"role": "assistant", "content": "问题1"},
            {"role": "user", "content": "回答1"},
        ]
        topics = [{"name": "产品质量", "description": "评价"}]

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_report(history, topics, "质量满意度调查")

        assert isinstance(result, str)
        assert len(result) > 0

    @patch("src.services.llm.load_dotenv")
    def test_generate_opening_question(self, mock_dotenv, monkeypatch):
        """Test generate_opening_question returns question."""
        monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
        service = LLMService()

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "您好，欢迎参加访谈！"

        persona_config = {"role_name": "访谈助手", "style": "友好"}

        with patch.object(service._client.chat.completions, "create", return_value=mock_response):
            result = service.generate_opening_question(
                topic_name="产品质量调研",
                topic_description="了解用户对产品质量的看法",
                first_topic="整体质量评价",
                persona_config=persona_config,
            )

        assert isinstance(result, str)
        assert len(result) > 0
