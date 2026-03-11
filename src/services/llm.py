"""
Qwen (通义千问) LLM service for interview bot.
"""

import os
import json
import time
import concurrent.futures
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()


class QwenService:
    """Qwen LLM service for interview bot.

    This service wraps the DashScope API for Qwen models.
    """

    def __init__(self, model: str = "qwen-max", api_key: Optional[str] = None):
        """Initialize Qwen service.

        Args:
            model: Model name (qwen-max, qwen-turbo, etc.)
            api_key: DashScope API key (optional, uses env var if not provided)
        """
        self.model = model
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")
        self._client = None

        # Lazy import to avoid import errors when not configured
        self._dashscope_available = False
        try:
            import dashscope

            dashscope.api_key = self.api_key
            self._dashscope_available = True
        except ImportError:
            pass

    def _get_client(self):
        """Get or create DashScope client."""
        if not self._dashscope_available:
            raise RuntimeError("dashscope package not installed")

        from dashscope import Generation

        return Generation

    def chat(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """Send chat request to Qwen.

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
        if not self._dashscope_available:
            return self._mock_response(messages)

        client = self._get_client()

        # Format messages
        formatted_messages = []

        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})

        formatted_messages.extend(messages)

        max_retries = int(os.getenv("MAX_LLM_RETRIES", "2"))
        timeout_sec = int(os.getenv("LLM_TIMEOUT", "0")) or None

        last_exc: Optional[Exception] = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep(2 ** (attempt - 1))

            try:
                if timeout_sec:
                    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
                    future = executor.submit(
                        client.call,
                        model=self.model,
                        messages=formatted_messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        result_format="message",
                    )
                    executor.shutdown(wait=False)
                    try:
                        response = future.result(timeout=timeout_sec)
                    except concurrent.futures.TimeoutError:
                        last_exc = TimeoutError(f"LLM call timed out after {timeout_sec}s")
                        continue
                else:
                    response = client.call(
                        model=self.model,
                        messages=formatted_messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        result_format="message",
                    )

                if response.status_code == 200:
                    return response.output.choices[0].message.content
                else:
                    raise Exception(f"LLM call failed: {response.code} - {response.message}")

            except Exception as e:
                last_exc = e

        raise last_exc or Exception("LLM call failed after retries")

    def _mock_response(self, messages: List[Dict[str, str]]) -> str:
        """Generate mock response for testing."""
        last_message = messages[-1] if messages else {}
        content = last_message.get("content", "")

        if "判断" in content or "是否需要追问" in content:
            return json.dumps(
                {
                    "needs_followup": False,
                    "followup_type": "",
                    "reason": "Mock response",
                }
            )

        return "这是模拟回复。"

    def is_followup_needed(
        self, conversation_history: List[Dict[str, str]], extracted_info: Dict[str, Any]
    ) -> Tuple[bool, str, str]:
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
        history_text = "\n".join(
            [
                f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
                for msg in recent_history
            ]
        )

        prompt = FOLLOWUP_JUDGE_PROMPT.format(
            conversation_history=history_text, extracted_info=str(extracted_info)
        )

        result = self.chat(
            messages=[{"role": "user", "content": prompt}], temperature=0.3
        )

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

    def generate_followup(
        self, user_answer: str, followup_type: str, domain_context: str = ""
    ) -> str:
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

        result = self.chat(
            messages=[{"role": "user", "content": prompt}], temperature=0.7
        )

        return result.strip()

    def generate_next_question(
        self,
        current_topic: str,
        topic_description: str,
        user_answer: str,
        extracted_info: Dict[str, Any],
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

        result = self.chat(
            messages=[{"role": "user", "content": prompt}], temperature=0.7
        )

        return result.strip()

    def generate_report(
        self,
        conversation_history: List[Dict[str, str]],
        topics: List[Dict[str, Any]],
        topic: str,
    ) -> str:
        """Generate interview report.

        Args:
            conversation_history: Full conversation history
            topics: List of topics covered
            topic: Interview topic

        Returns:
            Generated report in Markdown format
        """
        from src.services.prompts import REPORT_GENERATE_PROMPT

        # Format conversation
        history_text = "\n\n".join(
            [
                f"**{'受访者' if msg.get('role') == 'user' else '访谈师'}**: {msg.get('content', '')}"
                for msg in conversation_history
            ]
        )

        # Format topics
        topics_text = "\n".join(
            [f"- {t.get('name', '未命名')}: {t.get('description', '')}" for t in topics]
        )

        prompt = REPORT_GENERATE_PROMPT.format(
            topic=topic, topics=topics_text, conversation_history=history_text
        )

        result = self.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=4000,
        )

        return result


# Singleton instance
_qwen_service: Optional[QwenService] = None


def get_qwen_service() -> QwenService:
    """Get singleton Qwen service instance."""
    global _qwen_service
    if _qwen_service is None:
        _qwen_service = QwenService()
    return _qwen_service
