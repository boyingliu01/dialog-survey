"""Webhook handler for receiving DingTalk messages."""

import asyncio
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.core.graph import run_interview
from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus
from src.models.message import Message
from src.services.asr import ASRServiceError, get_asr_service
from src.services.dingtalk import DingTalkService, get_dingtalk_service

router = APIRouter()
logger = logging.getLogger(__name__)


class WebhookCallback(BaseModel):
    """Webhook callback data model."""

    msg_type: str
    user_id: str
    content: str
    session_id: str | None = None
    conversation_id: str | None = None


@router.get("/webhook")
async def verify_webhook(
    request: Request,
    signature: str | None = None,
    timestamp: str | None = None,
    nonce: str | None = None,
):
    """Verify webhook URL for DingTalk callback configuration.

    Returns challenge string for verification.
    """
    dingtalk = get_dingtalk_service()

    # For initial webhook verification, DingTalk sends a challenge
    # We need to return it back
    challenge = request.query_params.get("challenge")
    if challenge:
        return {"challenge": challenge}

    # If no challenge, this is a regular callback
    # Verify signature if provided
    if signature and timestamp and nonce and not dingtalk.verify_signature(timestamp, signature, nonce):
        raise HTTPException(status_code=403, detail="Invalid signature")

    return {"code": 0, "msg": "success"}


@router.post("/webhook")
async def handle_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Handle incoming DingTalk webhook messages.

    This endpoint receives messages from DingTalk and processes them:
    - Text messages: Process as user input
    - Voice messages: Transcribe and process
    - Other types: Handle accordingly

    Returns:
        Response to send back to DingTalk

    """
    # Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Verify signature (mandatory)
    timestamp = request.headers.get("timestamp")
    signature = request.headers.get("signature")
    nonce = request.headers.get("nonce")

    if not timestamp or not signature or not nonce:
        raise HTTPException(status_code=403, detail="Missing signature headers")

    dingtalk = get_dingtalk_service()
    if not dingtalk.verify_signature(timestamp, signature, nonce):
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse message
    message_data = dingtalk.parse_webhook_message(body)
    msg_type = message_data["msg_type"]
    user_id = message_data["user_id"]
    content = message_data["content"]

    logger.info("Received message from user=%s type=%s", user_id, msg_type)

    # Handle voice message
    if msg_type == "voice":
        return await _handle_voice_message(body, user_id, message_data, db, dingtalk)

    if not user_id:
        return {"code": 400, "msg": "Missing user_id"}

    # Find or create interview session
    session_id = body.get("session_id") if isinstance(body, dict) else None

    if not session_id:
        # Check if there's an active interview for this user
        interview = (
            db.query(Interview)
            .filter(
                Interview.user_id == str(user_id),
                Interview.status == InterviewStatus.IN_PROGRESS,
            )
            .first()
        )

        if interview:
            session_id = interview.session_id

    if not session_id:
        # Create new session if "开始" is received
        if content.strip() in ["开始", "start", "开始访谈"]:
            session_id = f"interview_{uuid.uuid4().hex[:12]}"
            logger.info("Creating new interview session=%s user=%s", session_id, user_id)
            interview = Interview(
                session_id=session_id,
                user_id=user_id,
                template_id="quality_survey",
                status=InterviewStatus.IN_PROGRESS,
                topic="质量满意度调查",
            )
            db.add(interview)
            db.commit()

            # Store first message
            msg = Message(
                interview_id=interview.id,
                role="user",
                content=content,
                message_type="text",
            )
            db.add(msg)
            db.commit()

            # Initialize interview with LangGraph (without user message)
            try:
                result_state = await asyncio.to_thread(
                    run_interview,
                    session_id=str(session_id),
                    user_id=str(user_id),
                    template_id=str(interview.template_id) if interview.template_id else "quality_survey",
                    topic=str(interview.topic) if interview.topic else "质量满意度调查",
                    user_message=None,  # First initialization without message
                )

                # Update interview with initial state
                interview.conversation_history = result_state.get("conversation_history") or []
                interview.updated_at = __import__("datetime").datetime.utcnow()
                db.commit()

                # Get welcome message or first question
                response_message = "访谈已开始"
                history = result_state.get("conversation_history", [])
                if history:
                    # Get last assistant message
                    for msg in reversed(history):
                        if msg.get("role") == "assistant":
                            response_message = msg.get("content", "")
                            break

                return {
                    "code": 0,
                    "msg": "success",
                    "session_id": session_id,
                    "message": response_message,
                }
            except Exception as e:
                db.rollback()
                logger.error("Failed to initialize interview for user=%s: %s", user_id, e, exc_info=True)
                return {
                    "code": 500,
                    "msg": "Error initializing interview",
                    "message": "抱歉，启动访谈时出错，请重试。",
                }
        else:
            return {"code": 0, "msg": "success", "message": "请回复'开始'启动访谈。"}

    # Process message in existing session
    interview = db.query(Interview).filter(Interview.session_id == session_id).first()

    if not interview:
        return {"code": 404, "msg": "Interview not found"}

    # Store user message
    user_message = Message(interview_id=interview.id, role="user", content=content, message_type=msg_type)
    db.add(user_message)

    # Update conversation history (without user message — run_interview will add it)
    # This avoids duplicate messages since run_interview appends user_message internally
    interview.updated_at = __import__("datetime").datetime.utcnow()

    db.commit()

    # Call conversation engine to process message
    try:
        # Run interview conversation through LangGraph (offload sync operation to thread pool)
        # 🔧 FIX: Pass conversation_history to run_interview for proper state sync
        result_state = await asyncio.to_thread(
            run_interview,
            session_id=session_id,
            user_id=user_id,
            template_id=interview.template_id,
            topic=interview.topic,
            user_message=content,
            conversation_history=list(interview.conversation_history or []),  # Pass from DB
        )

        # Update interview with latest state
        interview.conversation_history = result_state.get("conversation_history", [])
        interview.updated_at = __import__("datetime").datetime.utcnow()

        # Get the last assistant message as response
        response_message = "感谢您的回答。"
        history = result_state.get("conversation_history", [])
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                response_message = msg.get("content", "")
                break

        # Store assistant response in database
        assistant_message = Message(
            interview_id=interview.id,
            role="assistant",
            content=response_message,
            message_type="text",
        )
        db.add(assistant_message)
        db.commit()

        return {
            "code": 0,
            "msg": "success",
            "session_id": session_id,
            "message": response_message,
        }
    except Exception as e:
        db.rollback()
        logger.error("LangGraph error session=%s: %s", session_id, e, exc_info=True)
        return {
            "code": 500,
            "msg": "Error processing message",
            "session_id": session_id,
            "message": "抱歉，处理您的消息时出错，请重试。",
        }


async def _handle_voice_message(
    body: dict[str, Any],
    user_id: str,
    message_data: dict[str, Any],
    db: Session,
    dingtalk: DingTalkService,
) -> dict[str, Any]:
    """Handle voice message transcription and processing.

    Args:
        body: Raw webhook request body
        user_id: User ID from DingTalk
        message_data: Parsed message data
        db: Database session
        dingtalk: DingTalk service instance

    Returns:
        Response dict for DingTalk

    """
    logger.info("Processing voice message from user=%s", user_id)

    # Get audio URL from message
    media_id = message_data.get("media_id", "")
    if not media_id:
        logger.error("No media_id found in voice message")
        return {
            "code": 400,
            "msg": "Missing media_id",
            "message": "无法获取语音文件，请重试。",
        }

    # Get ASR service
    asr_service = get_asr_service()

    try:
        # Try to get audio URL from DingTalk and transcribe
        audio_url = body.get("voice", {}).get("recognition", "")

        if audio_url:
            logger.info("Transcribing from URL for user=%s", user_id)
            transcribed_text = await asr_service.transcribe_from_url_async(audio_url)
        else:
            logger.warning("No audio URL available for user=%s", user_id)
            return {
                "code": 200,
                "msg": "success",
                "message": "已收到您的语音消息，正在处理中，请稍候...",
            }

        if transcribed_text.startswith("[") and transcribed_text.endswith("]"):
            logger.error("ASR transcription failed for user=%s: %s", user_id, transcribed_text)
            return {
                "code": 200,
                "msg": "success",
                "message": "抱歉，语音识别失败，请用文字发送您的回答。",
            }

        logger.info("Voice transcription successful for user=%s: %s", user_id, transcribed_text[:50])

        text_body = body.copy()
        text_body["msgtype"] = "text"
        text_body["text"] = {"content": transcribed_text}

        session_id = body.get("session_id")
        if not session_id:
            interview = (
                db.query(Interview)
                .filter(
                    Interview.user_id == str(user_id),
                    Interview.status == InterviewStatus.IN_PROGRESS,
                )
                .first()
            )
            if interview:
                session_id = interview.session_id

        if not session_id:
            return {
                "code": 200,
                "msg": "success",
                "message": f"识别结果：{transcribed_text}\n\n请回复'开始'启动访谈。",
            }

        interview = db.query(Interview).filter(Interview.session_id == session_id).first()
        if not interview:
            return {"code": 404, "msg": "Interview not found"}

        user_message = Message(
            interview_id=interview.id,
            role="user",
            content=transcribed_text,
            message_type="voice",
        )
        db.add(user_message)

        # Update timestamp (run_interview handles conversation_history)
        interview.updated_at = __import__("datetime").datetime.utcnow()
        db.commit()

        try:
            from src.core.graph import run_interview

            # 🔧 FIX: Pass conversation_history for proper state sync
            result_state = await asyncio.to_thread(
                run_interview,
                session_id=session_id,
                user_id=user_id,
                template_id=interview.template_id,
                topic=interview.topic,
                user_message=transcribed_text,
                conversation_history=list(interview.conversation_history or []),
            )

            interview.conversation_history = result_state.get("conversation_history", [])
            interview.updated_at = __import__("datetime").datetime.utcnow()

            response_message = "感谢您的回答。"
            for msg in reversed(result_state.get("conversation_history", [])):
                if msg.get("role") == "assistant":
                    response_message = msg.get("content", "")
                    break

            assistant_message = Message(
                interview_id=interview.id,
                role="assistant",
                content=response_message,
                message_type="text",
            )
            db.add(assistant_message)
            db.commit()

            return {
                "code": 0,
                "msg": "success",
                "session_id": session_id,
                "message": response_message,
            }
        except Exception as e:
            db.rollback()
            logger.error("LangGraph error in voice handler session=%s: %s", session_id, e, exc_info=True)
            return {
                "code": 500,
                "msg": "Error processing message",
                "session_id": session_id,
                "message": "抱歉，处理您的消息时出错，请重试。",
            }
    except ASRServiceError as e:
        logger.exception("ASR service error for user=%s: %s", user_id, e)
        return {
            "code": 200,
            "msg": "success",
            "message": "语音识别服务暂时不可用，请用文字发送您的回答。",
        }
    except Exception as e:
        logger.error("Unexpected error processing voice message for user=%s: %s", user_id, e, exc_info=True)
        return {
            "code": 200,
            "msg": "success",
            "message": "处理语音消息时出错，请用文字发送您的回答。",
        }
