"""
DingTalk service for message handling and API calls.
"""

import base64
import hashlib
import hmac
import os
import time
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(override=True)

DINGTALK_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"
DINGTALK_SEND_URL = (
    "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2"
)


class DingTalkService:
    """DingTalk service for handling messages and API calls."""

    def __init__(
        self,
        app_key: str | None = None,
        app_secret: str | None = None,
        agent_id: str | None = None,
    ):
        # Use explicit values when provided (even empty string), fall back to env only when None
        self.app_key = app_key if app_key is not None else os.getenv("DINGTALK_APP_KEY")
        self.app_secret = app_secret if app_secret is not None else os.getenv("DINGTALK_APP_SECRET")
        self.agent_id = agent_id if agent_id is not None else os.getenv("DINGTALK_AGENT_ID")
        self._access_token: str | None = None
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
        """Get DingTalk access token, using cache when valid.

        Returns:
            Access token string

        Raises:
            Exception: If credentials not configured or API returns error
        """
        if not self.app_key or not self.app_secret:
            raise Exception("DingTalk credentials not configured")

        # Return cached token if still valid
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        response = httpx.get(
            DINGTALK_TOKEN_URL,
            params={"appkey": self.app_key, "appsecret": self.app_secret},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("errcode") != 0:
            raise Exception(f"DingTalk token error: {data.get('errmsg', 'unknown')}")

        self._access_token = data["access_token"]
        expires_in = data.get("expires_in", 7200)
        self._token_expires_at = time.time() + expires_in - 300  # 5-minute buffer

        return self._access_token

    def send_message(self, user_id: str, msg_type: str, content: str) -> dict[str, Any]:
        """Send message to a DingTalk user via work notification.

        Args:
            user_id: Target user's staff ID
            msg_type: Message type — "text" or "markdown"
            content: Message content

        Returns:
            Dict with code=0 on success

        Raises:
            Exception: If API returns an error code
        """
        token = self.get_access_token()

        if msg_type == "markdown":
            lines = content.split("\n")
            title = lines[0].lstrip("#").strip() if lines else "消息"
            msg = {"msgtype": "markdown", "markdown": {"title": title, "text": content}}
        else:
            msg = {"msgtype": "text", "text": {"content": content}}

        payload = {
            "agent_id": self.agent_id,
            "userid_list": user_id,
            "msg": msg,
        }

        response = httpx.post(
            DINGTALK_SEND_URL,
            params={"access_token": token},
            json=payload,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        if data.get("errcode") != 0:
            raise Exception(f"DingTalk send error: {data.get('errmsg', 'unknown')}")

        return {"code": 0, "msg": "success", "user_id": user_id, "msg_type": msg_type}

    def parse_webhook_message(self, body: dict[str, Any]) -> dict[str, Any]:
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


def get_dingtalk_service() -> DingTalkService:
    """Get singleton DingTalk service instance."""
    return DingTalkService()
