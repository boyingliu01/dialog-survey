"""LLM service for interview bot using Anthropic Claude API.
Supports Alibaba Cloud BaiLian (百炼) Claude-compatible endpoint.
"""

import concurrent.futures
import os
import time

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

_llm_executor = None
DEFAULT_LLM_TIMEOUT_SEC = 60


def _get_llm_executor():
    global _llm_executor
    if _llm_executor is None:
        _llm_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
    return _llm_executor


class LLMService:
    def __init__(self, model=None, api_key=None, base_url=None) -> None:
        self.model = model or os.getenv("ANTHROPIC_MODEL", "glm-5")
        self.api_key = api_key or os.getenv("ANTHROPIC_AUTH_TOKEN") or os.getenv("DASHSCOPE_API_KEY")
        self.base_url = base_url or os.getenv("ANTHROPIC_BASE_URL", "https://coding.dashscope.aliyuncs.com/apps/anthropic")
        self._client = Anthropic(api_key=self.api_key, base_url=self.base_url)

    def chat(self, messages, system_prompt=None, temperature=0.7, max_tokens=2000):
        system = system_prompt or ""
        conversation = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                system = content
            elif role in ["user", "assistant"]:
                conversation.append({"role": role, "content": content})

        max_retries = int(os.getenv("MAX_LLM_RETRIES", "2"))
        timeout_sec = int(os.getenv("LLM_TIMEOUT", str(DEFAULT_LLM_TIMEOUT_SEC))) or DEFAULT_LLM_TIMEOUT_SEC

        last_exc = None
        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep(2 ** (attempt - 1))
            try:
                executor = _get_llm_executor()
                future = executor.submit(
                    self._client.messages.create,
                    model=self.model, max_tokens=max_tokens, temperature=temperature,
                    system=system or None, messages=conversation
                )
                try:
                    response = future.result(timeout=timeout_sec)
                except concurrent.futures.TimeoutError:
                    last_exc = TimeoutError(f"LLM call timed out after {timeout_sec}s")
                    continue
                if response.content and len(response.content) > 0:
                    return response.content[0].text
                raise Exception("LLM returned empty response")
            except Exception as e:
                last_exc = e
                print(f"LLM call attempt {attempt + 1} failed: {e}")
        raise last_exc or Exception("LLM call failed after retries")

    def generate_opening_question(self, topic_name, topic_description, first_topic, persona_config):
        from src.services.prompts import OPENING_QUESTION_PROMPT, build_system_prompt
        system = build_system_prompt(**persona_config)
        prompt = OPENING_QUESTION_PROMPT.format(
            system_prompt=system, topic_name=topic_name,
            topic_description=topic_description, first_topic=first_topic
        )
        return self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.8, max_tokens=500).strip()

    def generate_followup(self, user_answer, followup_type, domain_context=""):
        from src.services.prompts import FOLLOWUP_GENERATE_PROMPT
        prompt = FOLLOWUP_GENERATE_PROMPT.format(
            user_answer=user_answer, followup_type=followup_type, domain_context=domain_context
        )
        return self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7).strip()

    def generate_next_question(self, current_topic, topic_description, user_answer, extracted_info):
        from src.services.prompts import NEXT_QUESTION_PROMPT
        prompt = NEXT_QUESTION_PROMPT.format(
            current_topic=current_topic, topic_description=topic_description,
            user_answer=user_answer, extracted_info=str(extracted_info)
        )
        return self.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7).strip()


_llm_service = None


def get_qwen_service():
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service


def get_llm_service():
    return get_qwen_service()
