"""
Webhook handler for receiving DingTalk messages.
"""

from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import uuid

from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus
from src.models.message import Message
from src.services.dingtalk import DingTalkService, get_dingtalk_service

router = APIRouter()


class WebhookCallback(BaseModel):
    """Webhook callback data model."""

    msg_type: str
    user_id: str
    content: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None


@router.get("/webhook")
async def verify_webhook(
    request: Request,
    signature: Optional[str] = None,
    timestamp: Optional[str] = None,
    nonce: Optional[str] = None,
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
    if signature and timestamp and nonce:
        if not dingtalk.verify_signature(timestamp, signature, nonce):
            raise HTTPException(status_code=403, detail="Invalid signature")

    return {"code": 0, "msg": "success"}


@router.post("/webhook")
async def handle_webhook(
    request: Request, db: Session = Depends(get_db)
) -> Dict[str, Any]:
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

    # Verify signature (if enabled)
    timestamp = request.headers.get("timestamp", "")
    signature = request.headers.get("signature", "")
    nonce = request.headers.get("nonce", "")

    dingtalk = get_dingtalk_service()
    if timestamp and signature and nonce:
        if not dingtalk.verify_signature(timestamp, signature, nonce):
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse message
    message_data = dingtalk.parse_webhook_message(body)
    msg_type = message_data["msg_type"]
    user_id = message_data["user_id"]
    content = message_data["content"]

    if not user_id:
        return {"code": 400, "msg": "Missing user_id"}

    # Find or create interview session
    session_id = body.get("session_id")

    if not session_id:
        # Check if there's an active interview for this user
        interview = (
            db.query(Interview)
            .filter(
                Interview.user_id == user_id,
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

            return {
                "code": 0,
                "msg": "success",
                "session_id": session_id,
                "message": "访谈已开始，请回答第一个问题。",
            }
        else:
            return {"code": 0, "msg": "success", "message": "请回复'开始'启动访谈。"}

    # Process message in existing session
    interview = db.query(Interview).filter(Interview.session_id == session_id).first()

    if not interview:
        return {"code": 404, "msg": "Interview not found"}

    # Store user message
    user_message = Message(
        interview_id=interview.id, role="user", content=content, message_type=msg_type
    )
    db.add(user_message)

    # Update conversation history
    history = interview.conversation_history or []
    history.append({"role": "user", "content": content})
    interview.conversation_history = history
    interview.updated_at = __import__("datetime").datetime.utcnow()

    db.commit()

    # TODO: Call conversation engine to process message
    # This will be implemented in Task 5-7

    return {
        "code": 0,
        "msg": "success",
        "session_id": session_id,
        "message": "感谢您的回答。",
    }


@router.post("/webhook/voice")
async def handle_voice_callback(
    request: Request, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Handle voice message callback from DingTalk.

    When a voice message is received, DingTalk may call this
    endpoint with the transcribed text.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    user_id = body.get("senderStaffId", "")
    content = body.get("text", {}).get("content", "")

    if not user_id or not content:
        return {"code": 400, "msg": "Missing required fields"}

    # Find active interview
    interview = (
        db.query(Interview)
        .filter(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.IN_PROGRESS,
        )
        .first()
    )

    if not interview:
        return {"code": 0, "msg": "No active interview"}

    # Store voice message
    voice_message = Message(
        interview_id=interview.id, role="user", content=content, message_type="voice"
    )
    db.add(voice_message)

    # Update conversation history
    history = interview.conversation_history or []
    history.append({"role": "user", "content": content, "type": "voice"})
    interview.conversation_history = history
    interview.updated_at = __import__("datetime").datetime.utcnow()

    db.commit()

    return {"code": 0, "msg": "success"}
