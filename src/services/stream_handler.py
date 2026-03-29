"""
DingTalk Stream mode handler for receiving robot messages.
This module provides WebSocket-based message handling as an alternative to HTTP webhook.
"""

import logging
import os

import dingtalk_stream
from dingtalk_stream import AckMessage

from src.services.message_service import handle_chat_message, start_new_interview

# Configure logging
logger = logging.getLogger(__name__)


class InterviewStreamHandler(dingtalk_stream.ChatbotHandler):
    """
    DingTalk Stream mode message handler for interview bot.

    This handler receives messages via WebSocket connection from DingTalk
    and processes them using the same logic as HTTP webhook.
    """

    def __init__(self):
        """Initialize the stream handler."""
        super().__init__()
        self.logger = logger
        self.logger.info("[Stream] InterviewStreamHandler initialized")

    async def process(self, callback: dingtalk_stream.CallbackMessage):
        """
        Process incoming message from DingTalk Stream.

        Args:
            callback: Message callback containing event data

        Returns:
            Tuple of (status, message) for acknowledgment
        """
        # 强制打印，确保能看到
        print("[STREAM] ========== RECEIVED CALLBACK ==========")
        print(f"[STREAM] Callback data: {callback}")
        print(f"[STREAM] Callback data dict: {callback.data}")

        self.logger.info("[Stream] Received callback: %s", callback)

        try:
            # Parse the message
            message = dingtalk_stream.ChatbotMessage.from_dict(callback.data)
            self.logger.info("[Stream] Parsed message: %s", message)

            # Extract user info
            user_id = message.sender_id
            if not user_id:
                self.logger.warning("[Stream] Received message without sender_id")
                return AckMessage.STATUS_OK, "OK"

            self.logger.info("[Stream] Message from user=%s", user_id)

            # Extract message content based on type
            content = ""
            msg_type = "text"
            voice_url = None

            if message.text and message.text.content:
                content = message.text.content
                msg_type = "text"
                self.logger.info(
                    "[Stream] Text message from user=%s: %s", user_id, content[:50]
                )

            elif message.voice and message.voice.url:
                voice_url = message.voice.url
                msg_type = "voice"
                content = ""
                self.logger.info("[Stream] Voice message from user=%s", user_id)

            elif message.markdown and message.markdown.text:
                content = message.markdown.text
                msg_type = "markdown"
                self.logger.info("[Stream] Markdown message from user=%s", user_id)

            else:
                self.logger.warning(
                    "[Stream] Unknown message type from user=%s", user_id
                )
                return AckMessage.STATUS_OK, "OK"

            # Handle "start" command
            if content.strip() in ["开始", "start", "开始访谈"]:
                self.logger.info("[Stream] Starting new interview for user=%s", user_id)
                response = await start_new_interview(
                    user_id=user_id,
                    content=content.strip(),
                )
                self.logger.info(
                    "[Stream] Interview started, response: %s", response[:50]
                )
                self.reply_text(response, message)
                return AckMessage.STATUS_OK, "OK"

            # Handle normal conversation
            self.logger.info("[Stream] Processing normal message for user=%s", user_id)
            response = await handle_chat_message(
                user_id=user_id,
                content=content,
                msg_type=msg_type,
                voice_url=voice_url,
            )
            self.logger.info(
                "[Stream] Response for user=%s: %s", user_id, response[:50]
            )

            # Send reply
            self.reply_text(response, message)

            return AckMessage.STATUS_OK, "OK"

        except Exception as e:
            self.logger.error("[Stream] Error processing message: %s", e, exc_info=True)
            return AckMessage.STATUS_LATER, str(e)


def create_stream_client(
    client_id: str | None = None,
    client_secret: str | None = None,
) -> dingtalk_stream.DingTalkStreamClient:
    """
    Create and configure DingTalk Stream client.

    Args:
        client_id: DingTalk app client ID (AppKey)
        client_secret: DingTalk app client secret (AppSecret)

    Returns:
        Configured Stream client
    """
    # Use environment variables if not provided
    if client_id is None:
        client_id = os.getenv("DINGTALK_CLIENT_ID") or os.getenv("DINGTALK_APP_KEY")
    if client_secret is None:
        client_secret = os.getenv("DINGTALK_CLIENT_SECRET") or os.getenv(
            "DINGTALK_APP_SECRET"
        )

    if not client_id or not client_secret:
        raise ValueError("DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET must be set")

    logger.info("[Stream] Creating Stream client with client_id=%s...", client_id[:8])

    # Create credential and client
    credential = dingtalk_stream.Credential(client_id, client_secret)
    client = dingtalk_stream.DingTalkStreamClient(credential)

    # Register handler for chatbot messages
    handler = InterviewStreamHandler()
    client.register_callback_handler(
        dingtalk_stream.chatbot.ChatbotMessage.TOPIC, handler
    )

    logger.info("[Stream] Stream client configured successfully")
    return client
