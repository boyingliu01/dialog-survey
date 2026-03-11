"""
Interview management API endpoints.
"""

import os
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session

from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus

router = APIRouter()

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
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=20),
    offset: int = Query(default=0),
    db: Session = Depends(get_db),
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
def get_interview_report(session_id: str, db: Session = Depends(get_db)):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")

    if not interview.report_path or not os.path.exists(interview.report_path):
        raise HTTPException(status_code=404, detail="Report not available")

    with open(interview.report_path, "r", encoding="utf-8") as f:
        content = f.read()

    return {
        "session_id": session_id,
        "report": content,
        "report_path": interview.report_path,
    }


@router.get("/interviews/{session_id}")
def get_interview(session_id: str, db: Session = Depends(get_db)):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")
    return _interview_detail(interview)


@router.post("/interviews/{session_id}/end")
def end_interview(session_id: str, db: Session = Depends(get_db)):
    interview = db.query(Interview).filter_by(session_id=session_id).first()
    if interview is None or interview.status != InterviewStatus.IN_PROGRESS:
        raise HTTPException(status_code=404, detail="Interview not found or not in progress")

    interview.status = InterviewStatus.CANCELLED
    db.commit()

    return {"code": 0, "msg": "success"}
