"""Message service for handling chat messages.
This module provides a unified interface for processing messages from both
HTTP Webhook and Stream modes.
"""

import asyncio
import logging
import uuid

from sqlalchemy.orm import Session

from src.core.graph import run_interview
from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus
from src.models.message import Message
from src.services.asr import ASRServiceError, get_asr_service

logger = logging.getLogger(__name__)


async def handle_chat_message(
    user_id: str,
    content: str,
    msg_type: str = "text",
    voice_url: str | None = None,
    db: Session | None = None,
) -> str:
    """Handle a chat message from user and return response.

    This is the unified entry point for processing messages from both
    HTTP Webhook and Stream modes.

    Args:
        user_id: User identifier (sender ID)
        content: Message content text
        msg_type: Message type ("text" or "voice")
        voice_url: URL to voice file (if msg_type is "voice")
        db: Database session (optional, will create if not provided)

    Returns:
        Response message text to send back to user

    """
    print(f"[MSG_SERVICE] handle_chat_message called: user_id={user_id[:20]}...", flush=True)
    should_close_db = False
    if db is None:
        print("[MSG_SERVICE] Getting new DB session...", flush=True)
        db = next(get_db())
        should_close_db = True

    try:
        print("[MSG_SERVICE] Calling _process_message...", flush=True)
        result = await _process_message(
            user_id=user_id,
            content=content,
            msg_type=msg_type,
            voice_url=voice_url,
            db=db,
        )
        print(f"[MSG_SERVICE] _process_message returned: {result[:50] if result else 'None'}...", flush=True)
        return result
    except Exception as e:
        print(f"[MSG_SERVICE] EXCEPTION in handle_chat_message: {e}", flush=True)
        raise
    finally:
        if should_close_db:
            db.close()


async def _process_message(
    user_id: str,
    content: str,
    msg_type: str,
    voice_url: str | None,
    db: Session,
) -> str:
    """Internal message processing logic."""
    print(f"[MSG_SERVICE] _process_message start: user_id={user_id[:20]}...", flush=True)

    # Check for active interview session
    print("[MSG_SERVICE] Querying database for active interview...", flush=True)
    interview = (
        db.query(Interview)
        .filter(
            Interview.user_id == str(user_id),
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .first()
    )

    if not interview:
        # No active session - prompt to start
        print("[MSG_SERVICE] No active interview found for user", flush=True)
        return "请回复'开始'启动访谈。"

    print(f"[MSG_SERVICE] Found active interview: session_id={interview.session_id}", flush=True)

    session_id = interview.session_id
    logger.info("Processing message for session=%s user=%s", session_id, user_id)

    # Handle voice message transcription
    if msg_type == "voice" and voice_url:
        try:
            asr = get_asr_service()
            # Run ASR in thread pool since it's blocking
            transcribed_text = await asyncio.to_thread(
                asr.transcribe_from_url, voice_url
            )
            if transcribed_text:
                content = transcribed_text
                logger.info(
                    "Voice transcribed for session=%s: %s", session_id, content[:50]
                )
            else:
                return "语音识别失败，请重试或用文字回答。"
        except ASRServiceError as e:
            logger.exception("ASR failed for session=%s: %s", session_id, e)
            return "语音识别出错，请用文字回答。"
        except Exception as e:
            logger.exception("ASR unexpected error for session=%s: %s", session_id, e)
            return "语音识别失败，请用文字回答。"

    # Store user message
    print("[MSG_SERVICE] Storing user message...", flush=True)
    user_message = Message(
        interview_id=interview.id,
        role="user",
        content=content,
        message_type=msg_type,
    )
    db.add(user_message)

    # Update timestamp (conversation history updated by run_interview result)
    interview.updated_at = __import__("datetime").datetime.utcnow()

    try:
        db.commit()
        print("[MSG_SERVICE] User message stored successfully", flush=True)
    except Exception as e:
        db.rollback()
        logger.exception("Failed to store user message for session=%s: %s", session_id, e)
        print(f"[MSG_SERVICE] DB commit failed: {e}", flush=True)
        return "消息存储失败，请重试。"

    # Process with LangGraph
    print("[MSG_SERVICE] Calling LangGraph run_interview...", flush=True)
    try:
        # 🔧 FIX: Pass conversation_history to run_interview for proper state sync
        result_state = await asyncio.to_thread(
            run_interview,
            session_id=session_id,
            user_id=user_id,
            template_id=interview.template_id or "quality_survey",
            topic=interview.topic or "质量满意度调查",
            user_message=content,
            conversation_history=list(
                interview.conversation_history or []
            ),  # Pass from DB
        )
        print(f"[MSG_SERVICE] LangGraph returned result_state keys: {list(result_state.keys())}", flush=True)

        # Update interview state
        interview.conversation_history = result_state.get("conversation_history", [])
        interview.updated_at = __import__("datetime").datetime.utcnow()

        # Get response from assistant
        response_message = "感谢您的回答。"
        history = result_state.get("conversation_history", [])
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                response_message = msg.get("content", "")
                break

        # Store assistant response
        assistant_message = Message(
            interview_id=interview.id,
            role="assistant",
            content=response_message,
            message_type="text",
        )
        db.add(assistant_message)
        db.commit()

        return response_message

    except Exception as e:
        db.rollback()
        logger.error("LangGraph error for session=%s: %s", session_id, e, exc_info=True)
        print(f"[MSG_SERVICE] EXCEPTION in LangGraph: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return "处理消息时出错，请重试。"


async def start_new_interview(
    user_id: str,
    content: str,
    db: Session | None = None,
) -> str:
    """Start a new interview session for user.

    Args:
        user_id: User identifier
        content: The "开始" message content
        db: Database session (optional)

    Returns:
        Welcome message with first question

    """
    should_close_db = False
    if db is None:
        db = next(get_db())
        should_close_db = True

    try:
        return await _create_interview(user_id, content, db)
    finally:
        if should_close_db:
            db.close()


async def _create_interview(
    user_id: str,
    content: str,
    db: Session,
) -> str:
    """Create new interview and return welcome message."""
    # Check if there's already an active interview - if so, end it first
    existing = (
        db.query(Interview)
        .filter(
            Interview.user_id == str(user_id),
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .first()
    )

    if existing:
        # End the existing interview first
        logger.info(
            "Ending existing interview session=%s for user=%s",
            existing.session_id,
            user_id,
        )
        existing.status = InterviewStatus.COMPLETED
        db.commit()

    # Create new session (always create new when user says "开始")
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
    db.refresh(interview)

    # Store the "开始" message
    msg = Message(
        interview_id=interview.id,
        role="user",
        content=content,
        message_type="text",
    )
    db.add(msg)
    db.commit()

    # Initialize with LangGraph
    try:
        result_state = await asyncio.to_thread(
            run_interview,
            session_id=session_id,
            user_id=user_id,
            template_id="quality_survey",
            topic="质量满意度调查",
            user_message=None,  # First initialization without message
        )

        # Update interview with state
        interview.conversation_history = result_state.get("conversation_history") or []
        interview.updated_at = __import__("datetime").datetime.utcnow()
        db.commit()

        # Extract welcome message and first question
        response_message = "访谈已开始"
        history = result_state.get("conversation_history", [])
        if history:
            # Get last assistant message
            for msg in reversed(history):
                if msg.get("role") == "assistant":
                    response_message = msg.get("content", "")
                    break

        return response_message

    except Exception as e:
        db.rollback()
        logger.error(
            "Failed to initialize interview for user=%s: %s", user_id, e, exc_info=True
        )
        return "抱歉，启动访谈时出错，请重试。"
