"""
LLM service for interview bot using OpenAI-compatible API.
Supports Alibaba Cloud BaiLian (百炼) and other OpenAI-compatible endpoints.
"""

import concurrent.futures
import json
import os
import time
from typing import Any

from dotenv import load_dotenv

# Import OpenAI client
from openai import OpenAI

load_dotenv()

# Module-level shared executor for LLM calls
_llm_executor: concurrent.futures.ThreadPoolExecutor | None = None

# Default LLM timeout in seconds
DEFAULT_LLM_TIMEOUT_SEC = 60


def _get_llm_executor() -> concurrent.futures.ThreadPoolExecutor:
    """Get or create shared ThreadPoolExecutor for LLM calls."""
    global _llm_executor
    if _llm_executor is None:
        _llm_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    return _llm_executor


class LLMService:
    """LLM service using OpenAI-compatible API.

    Default configuration uses Alibaba Cloud BaiLian (百炼):
    - Base URL: https://coding.dashscope.aliyuncs.com/apps/anthropic
    - Model: glm-5, glm-4.7
    """

    def __init__(
        self,
        model: str = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        """Initialize LLM service.

        Args:
            model: Model name (default: glm-5)
            api_key: API key (default: from env ANTHROPIC_AUTH_TOKEN or DASHSCOPE_API_KEY)
            base_url: API base URL (default: from env ANTHROPIC_BASE_URL)
        """
        self.model = model or os.getenv("ANTHROPIC_MODEL", "glm-5")
        self.api_key = api_key or os.getenv("ANTHROPIC_AUTH_TOKEN") or os.getenv("DASHSCOPE_API_KEY")
        self.base_url = base_url or os.getenv(
            "ANTHROPIC_BASE_URL", "https://coding.dashscope.aliyuncs.com/apps/anthropic"
        )

        # Initialize OpenAI client
        self._client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """Send chat request to LLM.

        Args:
            messages: List of message dicts with role and content
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Generated response text

        Raises:
            Exception if API call fails
        """
        # Prepare messages
        formatted_messages = []

        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})

        formatted_messages.extend(messages)

        max_retries = int(os.getenv("MAX_LLM_RETRIES", "2"))
        timeout_sec = int(os.getenv("LLM_TIMEOUT", str(DEFAULT_LLM_TIMEOUT_SEC))) or DEFAULT_LLM_TIMEOUT_SEC

        last_exc: Exception | None = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep(2 ** (attempt - 1))

            try:
                executor = _get_llm_executor()
                future = executor.submit(
                    self._client.chat.completions.create,
                    model=self.model,
                    messages=formatted_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )

                try:
                    response = future.result(timeout=timeout_sec)
                except concurrent.futures.TimeoutError:
                    last_exc = TimeoutError(f"LLM call timed out after {timeout_sec}s")
                    continue

                if response.choices and len(response.choices) > 0:
                    return response.choices[0].message.content
                else:
                    raise Exception("LLM returned empty response")

            except Exception as e:
                last_exc = e
                print(f"LLM call attempt {attempt + 1} failed: {e}")

        raise last_exc or Exception("LLM call failed after retries")

    def is_followup_needed(
        self, conversation_history: list[dict[str, str]], extracted_info: dict[str, Any]
    ) -> tuple[bool, str, str]:
        """Determine if follow-up is needed.

        Args:
            conversation_history: Recent conversation history
            extracted_info: Already extracted information

        Returns:
            Tuple of (needs_followup, followup_type, reason)
        """
        from src.services.prompts import FOLLOWUP_JUDGE_PROMPT

        # Get recent messages
        recent_history = conversation_history[-6:]  # Last 3 turns
        history_text = "\n".join([f"{msg.get('role', 'unknown')}: {msg.get('content', '')}" for msg in recent_history])

        prompt = FOLLOWUP_JUDGE_PROMPT.format(conversation_history=history_text, extracted_info=str(extracted_info))

        result = self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)

        # Parse JSON result
        try:
            parsed = json.loads(result)
            return (
                parsed.get("needs_followup", False),
                parsed.get("followup_type", ""),
                parsed.get("reason", ""),
            )
        except (json.JSONDecodeError, AttributeError):
            return False, "", "解析失败"

    def generate_followup(self, user_answer: str, followup_type: str, domain_context: str = "") -> str:
        """Generate follow-up question.

        Args:
            user_answer: User's previous answer
            followup_type: Type of follow-up (clarification/deep/validation/expansion)
            domain_context: Domain knowledge context

        Returns:
            Generated follow-up question
        """
        from src.services.prompts import FOLLOWUP_GENERATE_PROMPT

        prompt = FOLLOWUP_GENERATE_PROMPT.format(
            user_answer=user_answer,
            followup_type=followup_type,
            domain_context=domain_context,
        )

        result = self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)

        return result.strip()

    def generate_next_question(
        self,
        current_topic: str,
        topic_description: str,
        user_answer: str,
        extracted_info: dict[str, Any],
    ) -> str:
        """Generate next interview question.

        Args:
            current_topic: Current topic name
            topic_description: Current topic description
            user_answer: User's previous answer
            extracted_info: Extracted information so far

        Returns:
            Generated question
        """
        from src.services.prompts import NEXT_QUESTION_PROMPT

        prompt = NEXT_QUESTION_PROMPT.format(
            current_topic=current_topic,
            topic_description=topic_description,
            user_answer=user_answer,
            extracted_info=str(extracted_info),
        )

        result = self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)

        return result.strip()

    def generate_report(
        self,
        conversation_history: list[dict[str, str]],
        topics: list[dict[str, Any]],
        topic: str,
        duration: int = 15,
        quality_score: int = 8,
        use_v2: bool = True,
    ) -> str:
        """Generate interview report.

        Args:
            conversation_history: Full conversation history
            topics: List of topics covered
            topic: Interview topic
            duration: Estimated interview duration in minutes (default: 15)
            quality_score: Answer quality score from 1-10 (default: 8)
            use_v2: Use structured V2 prompt (default: True)

        Returns:
            Generated report in Markdown format
        """
        from src.services.prompts import REPORT_GENERATE_PROMPT, REPORT_GENERATE_PROMPT_V2

        # Format conversation
        history_text = "\n\n".join(
            [
                f"**{'受访者' if msg.get('role') == 'user' else '访谈师'}**: {msg.get('content', '')}"
                for msg in conversation_history
            ]
        )

        # Format topics
        topics_text = "\n".join([f"- {t.get('name', '未命名')}: {t.get('description', '')}" for t in topics])

        # Use V2 prompt by default for structured report
        prompt_template = REPORT_GENERATE_PROMPT_V2 if use_v2 else REPORT_GENERATE_PROMPT

        prompt = prompt_template.format(
            topic=topic,
            topics=topics_text,
            conversation_history=history_text,
            duration=duration,
            quality_score=quality_score,
        )

        result = self.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=4000,
        )

        return result

    def generate_opening_question(
        self,
        topic_name: str,
        topic_description: str,
        first_topic: str,
        persona_config: dict[str, Any],
    ) -> str:
        """Generate opening question for interview.

        Args:
            topic_name: Interview topic name
            topic_description: Interview topic description
            first_topic: First topic to discuss
            persona_config: Persona configuration dict

        Returns:
            Generated opening question with welcome message
        """
        from src.services.prompts import (
            OPENING_QUESTION_PROMPT,
            build_system_prompt,
        )

        system_prompt = build_system_prompt(**persona_config)

        prompt = OPENING_QUESTION_PROMPT.format(
            system_prompt=system_prompt,
            topic_name=topic_name,
            topic_description=topic_description,
            first_topic=first_topic,
        )

        result = self.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=500,
        )

        return result.strip()

    def generate_next_question_enhanced(
        self,
        conversation_history: list[dict[str, str]],
        current_topic: str,
        topic_description: str,
        current_topic_index: int,
        total_topics: int,
        extracted_info: dict[str, Any],
        persona_config: dict[str, Any],
    ) -> str:
        """Generate next question with full context awareness.

        Args:
            conversation_history: Full conversation history
            current_topic: Current topic name
            topic_description: Current topic description
            current_topic_index: Current topic index
            total_topics: Total number of topics
            extracted_info: Extracted information so far
            persona_config: Persona configuration dict

        Returns:
            Generated next question
        """
        from src.services.prompts import (
            NEXT_QUESTION_PROMPT,
            build_system_prompt,
            format_conversation_history,
        )

        system_prompt = build_system_prompt(**persona_config)

        prompt = NEXT_QUESTION_PROMPT.format(
            system_prompt=system_prompt,
            conversation_history=format_conversation_history(conversation_history),
            current_topic=current_topic,
            topic_description=topic_description,
            current_topic_index=current_topic_index,
            total_topics=total_topics,
            extracted_info=str(extracted_info),
        )

        result = self.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=300,
        )

        return result.strip()


# Singleton instance
_llm_service: LLMService | None = None


def get_qwen_service() -> LLMService:
    """Get singleton LLM service instance."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service


# Alias for backward compatibility
def get_llm_service() -> LLMService:
    """Get singleton LLM service instance. Alias for get_qwen_service()."""
    return get_qwen_service()
