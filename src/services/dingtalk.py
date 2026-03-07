"""
DingTalk service for message handling and API calls.
"""

import hashlib
import time
import hmac
import base64
from typing import Optional, Dict, Any
import os
from dotenv import load_dotenv

load_dotenv()


class DingTalkService:
    """DingTalk service for handling messages and API calls."""

    def __init__(
        self,
        app_key: Optional[str] = None,
        app_secret: Optional[str] = None,
        agent_id: Optional[str] = None,
    ):
        self.app_key = app_key or os.getenv("DINGTALK_APP_KEY")
        self.app_secret = app_secret or os.getenv("DINGTALK_APP_SECRET")
        self.agent_id = agent_id or os.getenv("DINGTALK_AGENT_ID")
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    def verify_signature(self, timestamp: str, signature: str, nonce: str) -> bool:
        """Verify DingTalk message signature.

        Args:
            timestamp: Message timestamp
            signature: Message signature to verify
            nonce: Random nonce

        Returns:
            True if signature is valid
        """
        if not self.app_secret:
            return True  # Skip verification if no secret configured

        string_to_sign = f"{self.app_secret}{timestamp}{nonce}"
        hmac_code = hmac.new(
            string_to_sign.encode("utf-8"), digestmod=hashlib.sha256
        ).digest()
        my_signature = base64.b64encode(hmac_code).decode("utf-8")
        return my_signature == signature

    def get_access_token(self) -> str:
        """Get DingTalk access token.

        Returns:
            Access token string

        Raises:
            Exception if token retrieval fails
        """
        # Check if we have a valid cached token
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        # In production, this would call DingTalk API
        # For now, return a placeholder
        # TODO: Implement actual DingTalk API call
        if not self.app_key or not self.app_secret:
            raise Exception("DingTalk credentials not configured")

        # Placeholder - in production, call:
        # https://oapi.dingtalk.com/gettoken?appkey=xxx&appsecret=xxx
        self._access_token = "placeholder_token"
        self._token_expires_at = time.time() + 7200 - 300  # 2 hours - 5 minutes

        return self._access_token

    def send_message(self, user_id: str, msg_type: str, content: str) -> Dict[str, Any]:
        """Send message to user.

        Args:
            user_id: Target user ID
            msg_type: Message type (text, markdown, etc.)
            content: Message content

        Returns:
            API response

        Raises:
            Exception if send fails
        """
        # In production, this would call DingTalk API
        # TODO: Implement actual DingTalk message sending
        return {"code": 0, "msg": "success", "user_id": user_id, "msg_type": msg_type}

    def parse_webhook_message(self, body: Dict[str, Any]) -> Dict[str, Any]:
        """Parse incoming webhook message.

        Args:
            body: Webhook request body

        Returns:
            Parsed message with type, content, user_id
        """
        msg_type = body.get("msgtype", "text")

        result = {
            "msg_type": msg_type,
            "user_id": body.get("senderStaffId", body.get("userId", "")),
            "content": "",
            "conversation_id": body.get("conversationId", ""),
        }

        if msg_type == "text":
            text_content = body.get("text", {})
            result["content"] = text_content.get("content", "")
        elif msg_type == "voice":
            voice_content = body.get("voice", {})
            result["media_id"] = voice_content.get("mediaId", "")
        elif msg_type == "markdown":
            markdown_content = body.get("markdown", {})
            result["title"] = markdown_content.get("title", "")
            result["content"] = markdown_content.get("text", "")

        return result


# Singleton instance for easy import
def get_dingtalk_service() -> DingTalkService:
    """Get singleton DingTalk service instance."""
    return DingTalkService()
