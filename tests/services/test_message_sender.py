"""
Tests for message sender service.
"""

from unittest.mock import Mock, patch

from src.services.dingtalk import DingTalkService
from src.services.message_sender import MessageSender


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

    @patch("src.services.message_sender.DingTalkService")
    def test_send_markdown(self, mock_dingtalk_class):
        """Test sending markdown message."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_markdown("user123", "报告标题", "报告内容")

        call_args = mock_dingtalk.send_message.call_args
        assert call_args[0][0] == "user123"
        assert call_args[0][1] == "markdown"
        assert "## 报告标题" in call_args[0][2]
        assert "报告内容" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_complete(self, mock_dingtalk_class):
        """Test sending interview completion message."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_complete("user123")

        call_args = mock_dingtalk.send_message.call_args
        assert "访谈已完成" in call_args[0][2] or "✅" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_complete_with_report_path(self, mock_dingtalk_class):
        """Test sending interview completion message with report path."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_complete("user123", "/path/to/report.md")

        call_args = mock_dingtalk.send_message.call_args
        assert "/path/to/report.md" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_error_message(self, mock_dingtalk_class):
        """Test sending error message."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_error_message("user123", "网络连接失败")

        call_args = mock_dingtalk.send_message.call_args
        assert "网络连接失败" in call_args[0][2]
        assert "❌" in call_args[0][2] or "抱歉" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_followup_question_without_context(self, mock_dingtalk_class):
        """Test sending follow-up question without context."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_followup_question("user123", "能详细说说吗？")

        call_args = mock_dingtalk.send_message.call_args
        assert "追问" in call_args[0][2]
        assert "能详细说说吗？" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_invite_with_custom_duration(self, mock_dingtalk_class):
        """Test sending interview invitation with custom duration."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_invite("user123", "产品反馈访谈", duration="30分钟")

        call_args = mock_dingtalk.send_message.call_args
        assert "30分钟" in call_args[0][2]

    @patch("src.services.message_sender.DingTalkService")
    def test_send_interview_question_formats_correctly(self, mock_dingtalk_class):
        """Test interview question message formatting."""
        mock_dingtalk = Mock(spec=DingTalkService)
        mock_dingtalk.send_message.return_value = {"code": 0, "msg": "success"}
        mock_dingtalk_class.return_value = mock_dingtalk

        sender = MessageSender(mock_dingtalk)
        sender.send_interview_question("user123", "请问您对服务满意吗？")

        call_args = mock_dingtalk.send_message.call_args
        message = call_args[0][2]
        assert "【访谈问题】" in message
        assert "请问您对服务满意吗？" in message
        assert "请根据您的实际体验回答" in message

    def test_message_sender_singleton(self):
        """Test MessageSender singleton pattern."""
        from src.services.message_sender import get_message_sender

        sender1 = get_message_sender()
        sender2 = get_message_sender()

        assert sender1 is sender2
