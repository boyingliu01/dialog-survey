"""
Interview management API endpoints.
"""

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus

router = APIRouter()
logger = logging.getLogger(__name__)


def verify_api_key(x_api_key: str | None = Header(None)) -> str:
    """Verify API key from X-API-Key header."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    expected_key = os.environ.get("INTERNAL_API_KEY")
    if not expected_key:
        logger.warning("INTERNAL_API_KEY not configured - rejecting all requests")
        raise HTTPException(status_code=401, detail="API key not configured")
    if x_api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key

# Map query param strings to enum values
_STATUS_MAP = {
    "IN_PROGRESS": InterviewStatus.IN_PROGRESS,
    "COMPLETED": InterviewStatus.COMPLETED,
    "CANCELLED": InterviewStatus.CANCELLED,
}


def _interview_summary(interview: Interview) -> dict:
    return {
        "session_id": interview.session_id,
        "user_id": interview.user_id,
        "status": interview.status.value.upper(),
        "topic": interview.topic,
        "created_at": interview.created_at.isoformat() if interview.created_at else None,
        "updated_at": interview.updated_at.isoformat() if interview.updated_at else None,
    }


def _interview_detail(interview: Interview) -> dict:
    data = _interview_summary(interview)
    data["conversation_history"] = interview.conversation_history or []
    return data


@router.get("/interviews")
def list_interviews(
    status: str | None = Query(default=None),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    db: Session = Depends(get_db),
    _=Depends(verify_api_key),
):
    query = db.query(Interview)

    if status is not None:
        enum_status = _STATUS_MAP.get(status.upper())
        if enum_status is None:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        query = query.filter(Interview.status == enum_status)

    total = query.count()
    interviews = query.offset(offset).limit(limit).all()

    return {
        "interviews": [_interview_summary(i) for i in interviews],
        "total": total,
    }


@router.get("/interviews/{session_id}/report")
def get_interview_report(
    session_id: str,
    db: Session = Depends(get_db),
    _=Depends(verify_api_key),
):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    if not interview.report_path or not os.path.exists(interview.report_path):
        raise HTTPException(status_code=404, detail="Report not available")

    with open(interview.report_path, encoding="utf-8") as f:
        content = f.read()

    return {
        "session_id": session_id,
        "report": content,
        "report_path": interview.report_path,
    }


@router.get("/interviews/{session_id}")
def get_interview(
    session_id: str,
    db: Session = Depends(get_db),
    _=Depends(verify_api_key),
):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")
    return _interview_detail(interview)


@router.post("/interviews/{session_id}/end")
def end_interview(
    session_id: str,
    db: Session = Depends(get_db),
    _=Depends(verify_api_key),
):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None or interview.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=404, detail="Interview not found or not in progress")

    interview.status = InterviewStatus.CANCELLED
    db.commit()

    return {"code": 0, "msg": "success"}
