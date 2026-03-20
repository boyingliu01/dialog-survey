"""
Tests for message sender service.
"""

import pytest
from unittest.mock import Mock, patch
from src.services.message_sender import MessageSender
from src.services.dingtalk import DingTalkService


class TestMessageSender:
    """Tests for MessageSender."""

    @patch("src.services.message_sender.DingTalkService")
    def test_send_text(self, mock_dingtalk_class):
        """Test sending text message."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        response = sender.send_text("user123", "Hello")

        mock_dingtalk.send_message.assert_called_once_with("user123", "text", "Hello")
        assert response["code"] == 0

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_question(self, mock_dingtalk_class):
        """Test sending interview question."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_question("user123", "您对产品质量满意吗？")

        call_args = mock_dingtalk.send_message.call_args
        assert "访谈问题" in call_args[0][2]
        assert "您对产品质量满意吗？" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_invite(self, mock_dingtalk_class):
        """Test sending interview invitation."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_invite("user123", "质量满意度调查")

        call_args = mock_dingtalk.send_message.call_args
        assert "质量满意度调查" in call_args[0][2]
        assert "开始" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_followup_question(self, mock_dingtalk_class):
        """Test sending follow-up question."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_followup_question(
            "user123", "能具体说说吗？", context="产品有些小问题"
        )

        call_args = mock_dingtalk.send_message.call_args
        assert "追问" in call_args[0][2]
        assert "产品有些小问题" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_reminder(self, mock_dingtalk_class):
        """Test sending reminder."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_reminder("user123", "质量满意度调查")

        call_args = mock_dingtalk.send_message.call_args
        assert "提醒" in call_args[0][2]
        assert "继续" in call_args[0][2]
