"""
Tests for message_service module.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.models.interview import Interview, InterviewStatus
from src.services.message_service import (
    handle_chat_message,
    start_new_interview,
)


class TestHandleChatMessage:
    """Tests for handle_chat_message function."""

    @pytest.mark.asyncio
    async def test_handle_chat_message_passes_conversation_history(self):
        """Test that handle_chat_message passes conversation history to run_interview.

        This is critical for multi-turn conversations - the history must be
        passed to LangGraph so it can continue the conversation.
        """
        # Create mock database
        mock_db = MagicMock()

        # Create mock interview with existing history
        mock_interview = MagicMock(spec=Interview)
        mock_interview.id = 1
        mock_interview.session_id = "test_session_001"
        mock_interview.user_id = "test_user"
        mock_interview.template_id = "quality_survey"
        mock_interview.topic = "质量满意度调查"
        mock_interview.status = InterviewStatus.IN_PROGRESS
        mock_interview.current_topic_index = 0
        mock_interview.conversation_history = [
            {"role": "assistant", "content": "你好！欢迎参加访谈..."},
            {"role": "assistant", "content": "请您对产品的整体质量做一个评价？"},
        ]

        mock_db.query.return_value.filter.return_value.first.return_value = mock_interview

        # Mock run_interview to capture the call
        with patch("src.services.message_service.run_interview") as mock_run_interview:
            mock_run_interview.return_value = {
                "conversation_history": [
                    {"role": "assistant", "content": "你好！欢迎参加访谈..."},
                    {
                        "role": "assistant",
                        "content": "请您对产品的整体质量做一个评价？",
                    },
                    {"role": "user", "content": "我觉得质量还行"},
                    {"role": "assistant", "content": "能具体说说哪些方面吗？"},
                ],
                "status": "interviewing",
            }

            await handle_chat_message(
                user_id="test_user",
                content="我觉得质量还行",
                msg_type="text",
                db=mock_db,
            )

            # Verify run_interview was called
            mock_run_interview.assert_called_once()

            # Verify conversation_history was passed
            call_kwargs = mock_run_interview.call_args[1]
            assert "conversation_history" in call_kwargs

            # The history should include the new user message
            passed_history = call_kwargs["conversation_history"]
            assert len(passed_history) >= 2  # Original history
            assert any(m.get("content") == "我觉得质量还行" for m in passed_history)

    @pytest.mark.asyncio
    async def test_handle_chat_message_no_active_session(self):
        """Test handle_chat_message when no active session exists."""
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        response = await handle_chat_message(
            user_id="test_user",
            content="test message",
            msg_type="text",
            db=mock_db,
        )

        assert response == "请回复'开始'启动访谈。"

    @pytest.mark.asyncio
    async def test_handle_chat_message_returns_assistant_response(self):
        """Test that handle_chat_message returns the assistant's response."""
        mock_db = MagicMock()

        mock_interview = MagicMock(spec=Interview)
        mock_interview.id = 1
        mock_interview.session_id = "test_session_002"
        mock_interview.user_id = "test_user"
        mock_interview.template_id = "quality_survey"
        mock_interview.topic = "质量满意度调查"
        mock_interview.status = InterviewStatus.IN_PROGRESS
        mock_interview.conversation_history = [
            {"role": "assistant", "content": "开场问题"},
        ]

        mock_db.query.return_value.filter.return_value.first.return_value = mock_interview

        with patch("src.services.message_service.run_interview") as mock_run_interview:
            mock_run_interview.return_value = {
                "conversation_history": [
                    {"role": "assistant", "content": "开场问题"},
                    {"role": "user", "content": "用户回答"},
                    {"role": "assistant", "content": "这是助手的追问"},
                ],
                "status": "interviewing",
            }

            response = await handle_chat_message(
                user_id="test_user",
                content="用户回答",
                msg_type="text",
                db=mock_db,
            )

            # Should return the last assistant message
            assert response == "这是助手的追问"


class TestStartNewInterview:
    """Tests for start_new_interview function."""

    @pytest.mark.asyncio
    async def test_start_new_interview_creates_session(self):
        """Test that start_new_interview creates a new interview session."""
        mock_db = MagicMock()

        # Mock no existing interview
        mock_db.query.return_value.filter.return_value.first.return_value = None

        # Mock the interview creation
        mock_interview = MagicMock(spec=Interview)
        mock_interview.id = 1
        mock_interview.session_id = "new_session_001"
        mock_interview.user_id = "test_user"
        mock_interview.conversation_history = []
        mock_db.add.return_value = None
        mock_db.commit.return_value = None
        mock_db.refresh.return_value = None

        # Track the interview that gets created
        created_interviews = []

        def mock_add(obj):
            if isinstance(obj, Interview):
                obj.id = len(created_interviews) + 1
                created_interviews.append(obj)

        mock_db.add.side_effect = mock_add

        with patch("src.services.message_service.run_interview") as mock_run_interview:
            mock_run_interview.return_value = {
                "conversation_history": [
                    {"role": "assistant", "content": "欢迎参加访谈！第一个问题..."},
                ],
                "status": "interviewing",
            }

            response = await start_new_interview(
                user_id="test_user",
                content="开始",
                db=mock_db,
            )

            # Should return the opening message
            assert "欢迎" in response or "访谈" in response

    @pytest.mark.asyncio
    async def test_start_new_interview_ends_existing_session(self):
        """Test that start_new_interview ends existing session before creating new."""
        mock_db = MagicMock()

        # Mock existing interview
        mock_existing = MagicMock(spec=Interview)
        mock_existing.session_id = "old_session"
        mock_existing.status = InterviewStatus.IN_PROGRESS

        mock_db.query.return_value.filter.return_value.first.return_value = mock_existing

        with patch("src.services.message_service.run_interview") as mock_run_interview:
            mock_run_interview.return_value = {
                "conversation_history": [
                    {"role": "assistant", "content": "新访谈开始"},
                ],
                "status": "interviewing",
            }

            await start_new_interview(
                user_id="test_user",
                content="开始",
                db=mock_db,
            )

            # Existing interview should be marked as completed
            assert mock_existing.status == InterviewStatus.COMPLETED
