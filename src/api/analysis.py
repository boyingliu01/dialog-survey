"""
Analysis API endpoints for batch interview analysis and export.

Endpoints:
    - POST /api/analysis/jobs - Create analysis job
    - GET /api/analysis/jobs - List analysis jobs
    - GET /api/analysis/jobs/{job_id} - Get job details
    - GET /api/analysis/jobs/{job_id}/result - Get analysis result
    - GET /api/analysis/jobs/{job_id}/topics - Get topic analysis
    - GET /api/analysis/jobs/{job_id}/export/pdf - Export PDF report
    - GET /api/analysis/jobs/{job_id}/export/excel - Export Excel data
"""

import logging
import os
from datetime import datetime
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.models.analysis import AnalysisJob, AnalysisJobStatus
from src.models.database import get_db
from src.models.interview import Interview, InterviewStatus
from src.services.export_service import get_export_service

router = APIRouter(prefix="/api/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class CreateAnalysisJobRequest(BaseModel):
    """Request model for creating an analysis job."""

    interview_ids: list[str] = Field(..., min_length=1, description="List of interview session IDs to analyze")


class AnalysisJobResponse(BaseModel):
    """Response model for analysis job."""

    id: int
    status: str
    interview_ids: list[str]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


class AnalysisResultResponse(BaseModel):
    """Response model for analysis result."""

    topics: list[dict]
    sentiment: dict
    key_points: list[dict]
    satisfaction_score: Optional[int] = None


class TopicsResponse(BaseModel):
    """Response model for topics."""

    topics: list[dict]


class AnalysisJobsListResponse(BaseModel):
    """Response model for listing analysis jobs."""

    jobs: list[AnalysisJobResponse]
    total: int


# ---------------------------------------------------------------------------
# Auth Helper
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _job_to_response(job: AnalysisJob) -> AnalysisJobResponse:
    """Convert AnalysisJob model to response dict."""
    return AnalysisJobResponse(
        id=job.id,
        status=job.status.value.upper(),
        interview_ids=job.interview_ids or [],
        created_at=job.created_at.isoformat() if job.created_at else None,
        updated_at=job.updated_at.isoformat() if job.updated_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


_STATUS_MAP = {
    "PENDING": AnalysisJobStatus.PENDING,
    "PROCESSING": AnalysisJobStatus.PROCESSING,
    "COMPLETED": AnalysisJobStatus.COMPLETED,
    "FAILED": AnalysisJobStatus.FAILED,
}


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@router.post("/jobs", response_model=AnalysisJobResponse, status_code=201)
def create_analysis_job(
    request: CreateAnalysisJobRequest,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Create a new analysis job for batch interview analysis.

    Validates that all specified interview_ids exist and are completed.
    """
    # Validate that all interviews exist and are completed
    for session_id in request.interview_ids:
        interview = db.query(Interview).filter_by(session_id=session_id).first()
        if interview is None:
            raise HTTPException(status_code=404, detail=f"Interview not found: {session_id}")
        if interview.status != InterviewStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail=f"Interview {session_id} is not completed (status: {interview.status.value})",
            )

    # Create analysis job
    job = AnalysisJob(
        status=AnalysisJobStatus.PENDING,
        interview_ids=request.interview_ids,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(f"Created analysis job {job.id} for {len(request.interview_ids)} interviews")

    return _job_to_response(job)


@router.get("/jobs", response_model=AnalysisJobsListResponse)
def list_analysis_jobs(
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """List all analysis jobs with optional status filter and pagination."""
    query = db.query(AnalysisJob)

    if status is not None:
        enum_status = _STATUS_MAP.get(status.upper())
        if enum_status is None:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        query = query.filter(AnalysisJob.status == enum_status)

    total = query.count()
    jobs = query.offset(offset).limit(limit).all()

    return AnalysisJobsListResponse(
        jobs=[_job_to_response(j) for j in jobs],
        total=total,
    )


@router.get("/jobs/{job_id}", response_model=AnalysisJobResponse)
def get_analysis_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Get analysis job details by ID."""
    job = db.query(AnalysisJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return _job_to_response(job)


@router.get("/jobs/{job_id}/result", response_model=AnalysisResultResponse)
def get_analysis_result(
    job_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Get analysis result for a completed job.

    Returns topics, sentiment analysis, key points, and satisfaction score.
    """
    job = db.query(AnalysisJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    if job.status != AnalysisJobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Analysis job is not completed (status: {job.status.value})")

    return AnalysisResultResponse(
        topics=job.topics or [],
        sentiment=job.sentiment or {},
        key_points=job.key_points or [],
        satisfaction_score=job.satisfaction_score,
    )


@router.get("/jobs/{job_id}/topics", response_model=TopicsResponse)
def get_analysis_topics(
    job_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Get topic analysis results for a completed job."""
    job = db.query(AnalysisJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    if job.status != AnalysisJobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Analysis job is not completed (status: {job.status.value})")

    return TopicsResponse(topics=job.topics or [])


@router.get("/jobs/{job_id}/export/pdf")
def export_analysis_pdf(
    job_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Export analysis result as PDF report.

    Returns a downloadable PDF file with complete analysis report.
    """
    job = db.query(AnalysisJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    if job.status != AnalysisJobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Analysis job is not completed (status: {job.status.value})")

    # Generate PDF using export service
    export_service = get_export_service()
    pdf_bytes = export_service.generate_pdf_report(
        job_id=job.id,
        topics=job.topics or [],
        sentiment=job.sentiment or {},
        key_points=job.key_points or [],
        satisfaction_score=job.satisfaction_score,
    )

    # Create streaming response
    filename = f"analysis_report_{job_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/jobs/{job_id}/export/excel")
def export_analysis_excel(
    job_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(verify_api_key),
):
    """Export analysis data as Excel spreadsheet.

    Returns a downloadable Excel file with multiple sheets:
    - Topics analysis
    - Sentiment distribution
    - Key points
    """
    job = db.query(AnalysisJob).filter_by(id=job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    if job.status != AnalysisJobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Analysis job is not completed (status: {job.status.value})")

    # Generate Excel using export service
    export_service = get_export_service()
    excel_bytes = export_service.generate_excel(
        topics=job.topics or [],
        sentiment=job.sentiment or {},
        key_points=job.key_points or [],
    )

    # Create streaming response
    filename = f"analysis_data_{job_id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
