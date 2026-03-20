"""
Message sender service for DingTalk messages.
"""

from typing import Optional, Dict, Any
from src.services.dingtalk import DingTalkService


class MessageSender:
    """Service for sending messages to DingTalk users."""

    def __init__(self, dingtalk_service: Optional[DingTalkService] = None):
        self.dingtalk = dingtalk_service or DingTalkService()

    def send_text(self, user_id: str, text: str) -> Dict[str, Any]:
        """Send text message to user.

        Args:
            user_id: Target user ID
            text: Message text

        Returns:
            API response
        """
        return self.dingtalk.send_message(user_id, "text", text)

    def send_markdown(self, user_id: str, title: str, content: str) -> Dict[str, Any]:
        """Send markdown message to user.

        Args:
            user_id: Target user ID
            title: Message title
            content: Markdown content

        Returns:
            API response
        """
        markdown = f"## {title}\n\n{content}"
        return self.dingtalk.send_message(user_id, "markdown", markdown)

    def send_interview_question(self, user_id: str, question: str) -> Dict[str, Any]:
        """Send interview question to user.

        Args:
            user_id: Target user ID
            question: Interview question

        Returns:
            API response
        """
        message = f"【访谈问题】\n\n{question}\n\n请根据您的实际体验回答。"
        return self.send_text(user_id, message)

    def send_interview_invite(
        self, user_id: str, topic: str, duration: str = "15分钟"
    ) -> Dict[str, Any]:
        """Send interview invitation to user.

        Args:
            user_id: Target user ID
            topic: Interview topic
            duration: Expected interview duration

        Returns:
            API response
        """
        message = f"""您好！诚邀您参加「{topic}」访谈。

📋 **访谈信息**
- 主题：{topic}
- 预计时长：{duration}
- 方式：碎片时间回答，无需一次性完成

📝 **参与方式**
回复"开始"即可开始访谈。

💡 **提示**
- 您可以在方便的时间回答问题
- 每次回答都会被保存
- 访谈结束后会自动生成报告

期待您的参与！"""
        return self.send_text(user_id, message)

    def send_followup_question(
        self, user_id: str, question: str, context: str = ""
    ) -> Dict[str, Any]:
        """Send follow-up question to user.

        Args:
            user_id: Target user ID
            question: Follow-up question
            context: Optional context about the original answer

        Returns:
            API response
        """
        message = f"""【追问】"""
        if context:
            message += f"\n\n您之前提到：{context}"
        message += f"\n\n{question}"

        return self.send_text(user_id, message)

    def send_interview_complete(
        self, user_id: str, report_path: str = ""
    ) -> Dict[str, Any]:
        """Send interview completion message.

        Args:
            user_id: Target user ID
            report_path: Optional path to generated report

        Returns:
            API response
        """
        message = """✅ 访谈已完成！

感谢您的参与，您的反馈对我们非常重要。

📊 报告生成中...
我们将尽快为您生成访谈报告。"""

        if report_path:
            message += f"\n\n报告路径：{report_path}"

        return self.send_text(user_id, message)

    def send_reminder(self, user_id: str, topic: str) -> Dict[str, Any]:
        """Send interview reminder to user.

        Args:
            user_id: Target user ID
            topic: Interview topic

        Returns:
            API response
        """
        message = f"""⏰ 访谈提醒

您有一个未完成的「{topic}」访谈。

之前您回答了一部分问题，现在可以继续完成。
回复"继续"即可继续访谈。

💡 您之前的回答已被保存，继续时会接着往下进行。
"""
        return self.send_text(user_id, message)

    def send_error_message(self, user_id: str, error: str) -> Dict[str, Any]:
        """Send error message to user.

        Args:
            user_id: Target user ID
            error: Error message

        Returns:
            API response
        """
        message = f"""❌ 抱歉，发生了一些问题

{error}

请您稍后重试，或联系管理员。"""
        return self.send_text(user_id, message)


# Singleton instance
_message_sender: Optional[MessageSender] = None


def get_message_sender() -> MessageSender:
    """Get singleton message sender instance."""
    global _message_sender
    if _message_sender is None:
        _message_sender = MessageSender()
    return _message_sender
