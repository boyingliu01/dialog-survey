"""
DingTalkSender service for async message sending to DingTalk users.

This service provides async methods for:
- Getting access tokens from DingTalk API
- Sending text messages
- Sending markdown messages
- Sending interview invitations
"""

import os
import time
import logging
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# DingTalk API endpoints
DINGTALK_TOKEN_URL = "https://oapi.dingtalk.com/gettoken"
DINGTALK_SEND_URL = "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2"


class DingTalkSender:
    """Async DingTalk message sending service.

    This service handles:
    - Access token acquisition with caching
    - Text and markdown message sending
    - Interview invitation sending
    - Graceful error handling
    """

    def __init__(
        self,
        app_key: Optional[str] = None,
        app_secret: Optional[str] = None,
        agent_id: Optional[str] = None,
    ):
        """Initialize DingTalkSender with credentials.

        Args:
            app_key: DingTalk app key (falls back to DINGTALK_APP_KEY env var)
            app_secret: DingTalk app secret (falls back to DINGTALK_APP_SECRET env var)
            agent_id: DingTalk agent ID (falls back to DINGTALK_AGENT_ID env var)
        """
        self.app_key = app_key if app_key is not None else os.getenv("DINGTALK_APP_KEY")
        self.app_secret = app_secret if app_secret is not None else os.getenv("DINGTALK_APP_SECRET")
        self.agent_id = agent_id if agent_id is not None else os.getenv("DINGTALK_AGENT_ID")
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    async def _get_access_token(self) -> str:
        """Get DingTalk access token asynchronously, using cache when valid.

        Returns:
            Access token string

        Raises:
            ValueError: If credentials not configured
            Exception: If API returns error response
            httpx.NetworkError: If network connection fails
        """
        if not self.app_key or not self.app_secret:
            raise ValueError("DingTalk credentials not configured")

        # Return cached token if still valid
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        # Fetch new token from DingTalk API
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                DINGTALK_TOKEN_URL, params={"appkey": self.app_key, "appsecret": self.app_secret}
            )
            data = response.json()

            if data.get("errcode") != 0:
                raise Exception(f"DingTalk token error: {data.get('errmsg', 'unknown')}")

            self._access_token = data["access_token"]
            expires_in = data.get("expires_in", 7200)
            self._token_expires_at = time.time() + expires_in - 300  # 5-minute buffer

            return self._access_token

    async def send_text(self, user_id: str, content: str) -> bool:
        """Send text message to a DingTalk user.

        Args:
            user_id: Target user's staff ID in DingTalk
            content: Text message content

        Returns:
            True if message sent successfully, False otherwise
        """
        if not user_id:
            logger.warning("Cannot send message to empty user_id")
            return False

        try:
            token = await self._get_access_token()

            payload = {
                "agent_id": self.agent_id,
                "userid_list": user_id,
                "msg": {"msgtype": "text", "text": {"content": content}},
            }

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(DINGTALK_SEND_URL, params={"access_token": token}, json=payload)
                data = response.json()

                if data.get("errcode") != 0:
                    logger.error(f"DingTalk send error: {data.get('errmsg', 'unknown')}")
                    return False

            logger.info(f"Text message sent to {user_id}")
            return True

        except httpx.NetworkError as e:
            logger.error(f"Network error sending to {user_id}: {e}")
            return False
        except httpx.TimeoutException as e:
            logger.error(f"Timeout sending to {user_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending text to {user_id}: {e}")
            return False

    async def send_markdown(self, user_id: str, title: str, content: str) -> bool:
        """Send markdown message to a DingTalk user.

        Args:
            user_id: Target user's staff ID in DingTalk
            title: Message title
            content: Markdown content

        Returns:
            True if message sent successfully, False otherwise
        """
        if not user_id:
            logger.warning("Cannot send markdown to empty user_id")
            return False

        try:
            token = await self._get_access_token()

            # Use provided title or default
            display_title = title if title else "消息"

            payload = {
                "agent_id": self.agent_id,
                "userid_list": user_id,
                "msg": {"msgtype": "markdown", "markdown": {"title": display_title, "text": content}},
            }

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(DINGTALK_SEND_URL, params={"access_token": token}, json=payload)
                data = response.json()

                if data.get("errcode") != 0:
                    logger.error(f"DingTalk send error: {data.get('errmsg', 'unknown')}")
                    return False

            logger.info(f"Markdown message sent to {user_id}")
            return True

        except httpx.NetworkError as e:
            logger.error(f"Network error sending markdown to {user_id}: {e}")
            return False
        except httpx.TimeoutException as e:
            logger.error(f"Timeout sending markdown to {user_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending markdown to {user_id}: {e}")
            return False

    async def send_interview_invitation(self, user_id: str, plan_name: str, start_url: str) -> bool:
        """Send interview invitation to a DingTalk user.

        Args:
            user_id: Target user's staff ID in DingTalk
            plan_name: Interview plan/template name
            start_url: URL to start the interview

        Returns:
            True if invitation sent successfully, False otherwise
        """
        if not user_id:
            logger.warning("Cannot send invitation to empty user_id")
            return False

        # Build invitation message content
        content = f"""## 访谈邀请：{plan_name}

您好！诚邀您参加「{plan_name}」访谈。

📋 **访谈信息**
- 主题：{plan_name}
- 方式：碎片时间回答，无需一次性完成

🔗 **参与方式**
点击链接开始访谈：{start_url if start_url else "请联系管理员获取"}

💡 **提示**
- 您可以在方便的时间回答问题
- 每次回答都会被保存
- 访谈结束后会自动生成报告

期待您的参与！"""

        return await self.send_markdown(user_id, f"访谈邀请：{plan_name}", content)


# Singleton instance
_sender_instance: Optional[DingTalkSender] = None


def get_sender() -> DingTalkSender:
    """Get singleton DingTalkSender instance.

    Returns:
        DingTalkSender singleton instance
    """
    global _sender_instance
    if _sender_instance is None:
        _sender_instance = DingTalkSender()
    return _sender_instance
