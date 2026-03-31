"""
E2E Test Configuration and Fixtures

This module provides fixtures for end-to-end testing using:
- Real PostgreSQL database (via Docker or test database)
- Mocked LLM service (for deterministic testing)
- Mocked DingTalk service (for webhook simulation)
"""

import os
import tempfile
from typing import Any
from unittest.mock import Mock

import pytest

# ---------------------------------------------------------------------------
# Test Configuration
# ---------------------------------------------------------------------------

# Use test database URL - set via environment or use SQLite for E2E
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "sqlite:///./test_e2e.db"  # SQLite fallback for local testing
)

# Test API key for endpoints
TEST_API_KEY = "test-e2e-api-key-2024"

# Test session/user IDs
TEST_USER_ID = "e2e_test_user_001"
TEST_SESSION_ID = "e2e_test_session_001"
TEST_TEMPLATE_ID = "quality_survey"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def temp_reports_dir():
    """Create a temporary directory for report files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture(scope="session")
def mock_llm_service():
    """
    Mock LLM service for E2E testing.

    Returns deterministic responses for consistent testing.
    """
    mock = Mock()

    # Mock follow-up detection - alternate between needs followup and doesn't
    call_count = [0]

    def mock_is_followup_needed(history, extracted_info):
        call_count[0] += 1
        # Every 3rd call needs followup
        if call_count[0] % 3 == 0:
            return True, "deep", "需要深入了解"
        return False, None, None

    mock.is_followup_needed = mock_is_followup_needed

    # Mock follow-up generation
    def mock_generate_followup(user_answer, followup_type, domain_context):
        followups = {
            "clarification": "您能具体说明一下吗？",
            "deep": "您能举个例子说明吗？",
            "validation": "您是说...对吗？",
            "expansion": "除此之外，还有其他想法吗？",
        }
        return followups.get(followup_type, "请继续分享您的想法。")

    mock.generate_followup = mock_generate_followup

    # Mock report generation
    def mock_generate_report(conversation_history, topics, topic):
        history_text = "\n".join([
            f"- {msg.get('role', 'unknown')}: {msg.get('content', '')}"
            for msg in conversation_history
        ])
        return f"""# {topic}报告

## 访谈摘要

本次访谈共 {len(conversation_history)} 条消息。

## 对话记录

{history_text}

## 结论

E2E 测试报告 - 自动生成

---
*本报告由 AI 自动生成*
"""

    mock.generate_report = mock_generate_report

    # Mock chat completion
    def mock_chat_complete(messages, model, **kwargs):
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "这是测试回复。"
                }
            }]
        }

    mock.chat_complete = mock_chat_complete

    return mock


@pytest.fixture(scope="session")
def mock_dingtalk_service():
    """
    Mock DingTalk service for E2E webhook testing.
    """
    mock = Mock()

    # Verify signature always returns True in test mode
    mock.verify_signature.return_value = True

    def mock_parse_message(data: dict[str, Any]) -> dict[str, Any]:
        """Parse DingTalk webhook message format."""
        msg_type = data.get("msgtype", "text")

        if msg_type == "text":
            content = data.get("text", {}).get("content", "")
        elif msg_type == "voice":
            content = data.get("voiceCode", "")
        else:
            content = ""

        return {
            "msg_type": msg_type,
            "user_id": data.get("senderStaffId", TEST_USER_ID),
            "content": content,
            "conversation_id": data.get("conversationId", "test_conv"),
        }

    mock.parse_webhook_message = mock_parse_message

    # Mock send message
    mock.send_message.return_value = {"code": 0, "message": "success"}

    return mock


@pytest.fixture
def sample_webhook_text_payload():
    """Sample DingTalk webhook payload for text message."""
    return {
        "msgtype": "text",
        "text": {
            "content": "开始"
        },
        "senderStaffId": TEST_USER_ID,
        "conversationId": "test_conv_001",
    }


@pytest.fixture
def sample_webhook_voice_payload():
    """Sample DingTalk webhook payload for voice message."""
    return {
        "msgtype": "voice",
        "voiceCode": "voice_12345",
        "senderStaffId": TEST_USER_ID,
        "conversationId": "test_conv_001",
    }


@pytest.fixture
def sample_interview_answers():
    """
    Sample interview answers for E2E flow testing.

    Simulates a complete interview conversation.
    """
    return [
        {"question": "产品质量", "answer": "产品质量非常好，功能齐全"},
        {"question": "深入了解", "answer": "特别是在响应速度方面表现优异"},
        {"question": "服务质量", "answer": "客服态度很好，响应及时"},
        {"question": "改进建议", "answer": "希望能有更多自定义选项"},
    ]


@pytest.fixture
def api_client_with_auth():
    """
    Returns headers dict with valid API key for testing protected endpoints.
    """
    return {"X-API-Key": TEST_API_KEY}


# ---------------------------------------------------------------------------
# Database Setup (for PostgreSQL)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def postgresql_db():
    """
    PostgreSQL database fixture for E2E testing.

    Requires Docker or running PostgreSQL instance.
    Skips tests if database is not available.
    """
    from sqlalchemy import create_engine, text

    db_url = os.environ.get("E2E_DATABASE_URL")
    if not db_url:
        pytest.skip("E2E_DATABASE_URL not set, skipping PostgreSQL tests")

    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        yield engine
        engine.dispose()
    except Exception as e:
        pytest.skip(f"Database not available: {e}")
