"""
Integration tests for analysis API endpoints.

Uses FastAPI TestClient with an in-memory SQLite database so no external
services are required.

Following TDD: Write tests FIRST before implementation (RED phase).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.models.analysis import AnalysisJob, AnalysisJobStatus
from src.models.database import Base, get_db
from src.models.interview import Interview, InterviewStatus

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SQLITE_URL = "sqlite:///:memory:"

# Test API key for auth tests
TEST_API_KEY = "test-secret-api-key-12345"


@pytest.fixture(autouse=True)
def setup_test_api_key(monkeypatch):
    """Set up test API key environment variable."""
    monkeypatch.setenv("INTERNAL_API_KEY", TEST_API_KEY)


@pytest.fixture()
def db_engine():
    engine = create_engine(
        SQLITE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    """TestClient with DB dependency overridden to use in-memory SQLite."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as c:
        yield c
    app.dependency_overrides.clear()


def _make_interview(session_id, user_id, status=InterviewStatus.COMPLETED, topic="测试访谈"):
    """Helper to create test interview."""
    return Interview(
        session_id=session_id,
        user_id=user_id,
        template_id="quality_survey",
        status=status,
        topic=topic,
        conversation_history=[
            {"role": "assistant", "content": "第一个问题"},
            {"role": "user", "content": "这是用户的回答"},
        ],
    )


def _make_analysis_job(job_id=None, status=AnalysisJobStatus.COMPLETED, interview_ids=None):
    """Helper to create test analysis job."""
    job = AnalysisJob(
        status=status,
        interview_ids=interview_ids or ["s1", "s2"],
        topics=[
            {"name": "产品质量", "count": 10, "keywords": ["质量", "性能"]},
            {"name": "服务体验", "count": 8, "keywords": ["服务", "响应"]},
        ],
        sentiment={"positive": 60, "negative": 20, "neutral": 20},
        key_points=[
            {"topic": "产品质量", "summary": "质量总体满意", "quotes": ["质量很好"]},
        ],
        satisfaction_score=75,
    )
    if job_id:
        job.id = job_id
    return job


# ---------------------------------------------------------------------------
# POST /api/analysis/jobs - Create analysis job
# ---------------------------------------------------------------------------


class TestCreateAnalysisJob:
    """Tests for POST /api/analysis/jobs endpoint."""

    def test_create_analysis_job_api_success(self, client, db_session):
        """Test creating analysis job with valid request."""
        # Add some completed interviews first
        db_session.add(_make_interview("s1", "u1", InterviewStatus.COMPLETED))
        db_session.add(_make_interview("s2", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.post(
            "/api/analysis/jobs",
            json={"interview_ids": ["s1", "s2"]},
        )

        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["status"] == "PENDING"
        assert data["interview_ids"] == ["s1", "s2"]

    def test_create_analysis_job_api_with_no_interview_ids(self, client):
        """Test creating analysis job without interview_ids returns error."""
        resp = client.post("/api/analysis/jobs", json={})

        assert resp.status_code == 400

    def test_create_analysis_job_api_with_nonexistent_interviews(self, client):
        """Test creating analysis job with nonexistent interview_ids."""
        resp = client.post(
            "/api/analysis/jobs",
            json={"interview_ids": ["nonexistent1", "nonexistent2"]},
        )

        assert resp.status_code == 404

    def test_create_analysis_job_api_requires_auth(self, client, db_session):
        """Test that creating analysis job requires API key."""
        # Remove auth header temporarily
        client.headers.pop("X-API-Key", None)

        resp = client.post(
            "/api/analysis/jobs",
            json={"interview_ids": ["s1"]},
        )

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs/{job_id} - Get analysis job details
# ---------------------------------------------------------------------------


class TestGetAnalysisJob:
    """Tests for GET /api/analysis/jobs/{job_id} endpoint."""

    def test_get_analysis_job_api_success(self, client, db_session):
        """Test getting existing analysis job."""
        job = _make_analysis_job()
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == job.id
        assert data["status"] == "COMPLETED"
        assert "interview_ids" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_get_analysis_job_api_not_found(self, client):
        """Test getting nonexistent analysis job returns 404."""
        resp = client.get("/api/analysis/jobs/999")

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Analysis job not found"

    def test_get_analysis_job_api_requires_auth(self, client, db_session):
        """Test that getting analysis job requires API key."""
        job = _make_analysis_job()
        db_session.add(job)
        db_session.commit()

        client.headers.pop("X-API-Key", None)
        resp = client.get(f"/api/analysis/jobs/{job.id}")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs - List analysis jobs
# ---------------------------------------------------------------------------


class TestListAnalysisJobs:
    """Tests for GET /api/analysis/jobs endpoint."""

    def test_list_analysis_jobs_api_empty(self, client):
        """Test listing analysis jobs with empty database."""
        resp = client.get("/api/analysis/jobs")

        assert resp.status_code == 200
        data = resp.json()
        assert data["jobs"] == []
        assert data["total"] == 0

    def test_list_analysis_jobs_api_with_jobs(self, client, db_session):
        """Test listing analysis jobs with multiple jobs."""
        db_session.add(_make_analysis_job(status=AnalysisJobStatus.COMPLETED))
        db_session.add(_make_analysis_job(status=AnalysisJobStatus.PENDING))
        db_session.commit()

        resp = client.get("/api/analysis/jobs")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["jobs"]) == 2

    def test_list_analysis_jobs_api_filter_by_status(self, client, db_session):
        """Test listing analysis jobs filtered by status."""
        db_session.add(_make_analysis_job(status=AnalysisJobStatus.COMPLETED))
        db_session.add(_make_analysis_job(status=AnalysisJobStatus.PENDING))
        db_session.commit()

        resp = client.get("/api/analysis/jobs?status=COMPLETED")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["jobs"][0]["status"] == "COMPLETED"

    def test_list_analysis_jobs_api_pagination(self, client, db_session):
        """Test listing analysis jobs with pagination."""
        for i in range(5):
            db_session.add(_make_analysis_job(status=AnalysisJobStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/analysis/jobs?limit=2&offset=1")

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["jobs"]) == 2

    def test_list_analysis_jobs_api_requires_auth(self, client):
        """Test that listing analysis jobs requires API key."""
        client.headers.pop("X-API-Key", None)
        resp = client.get("/api/analysis/jobs")

        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs/{job_id}/result - Get analysis result
# ---------------------------------------------------------------------------


class TestGetAnalysisResult:
    """Tests for GET /api/analysis/jobs/{job_id}/result endpoint."""

    def test_get_analysis_result_api_success(self, client, db_session):
        """Test getting analysis result for completed job."""
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/result")

        assert resp.status_code == 200
        data = resp.json()
        assert "topics" in data
        assert "sentiment" in data
        assert "key_points" in data
        assert "satisfaction_score" in data

    def test_get_analysis_result_api_pending_job(self, client, db_session):
        """Test getting result for pending job returns appropriate response."""
        job = AnalysisJob(
            status=AnalysisJobStatus.PENDING,
            interview_ids=["s1"],
        )
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/result")

        # Pending job should return 400 or indicate not ready
        assert resp.status_code == 400
        assert "not completed" in resp.json()["detail"].lower()

    def test_get_analysis_result_api_not_found(self, client):
        """Test getting result for nonexistent job returns 404."""
        resp = client.get("/api/analysis/jobs/999/result")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs/{job_id}/topics - Get analysis topics
# ---------------------------------------------------------------------------


class TestGetAnalysisTopics:
    """Tests for GET /api/analysis/jobs/{job_id}/topics endpoint."""

    def test_get_analysis_topics_api_success(self, client, db_session):
        """Test getting topics for completed analysis job."""
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/topics")

        assert resp.status_code == 200
        data = resp.json()
        assert "topics" in data
        assert len(data["topics"]) > 0
        assert "name" in data["topics"][0]
        assert "count" in data["topics"][0]

    def test_get_analysis_topics_api_not_found(self, client):
        """Test getting topics for nonexistent job returns 404."""
        resp = client.get("/api/analysis/jobs/999/topics")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs/{job_id}/export/pdf - Export PDF
# ---------------------------------------------------------------------------


class TestExportAnalysisPdf:
    """Tests for GET /api/analysis/jobs/{job_id}/export/pdf endpoint."""

    def test_export_analysis_pdf_api_success(self, client, db_session):
        """Test exporting analysis as PDF."""
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/export/pdf")

        assert resp.status_code == 200
        # Should return binary content
        assert resp.content is not None
        assert len(resp.content) > 0
        # Check content disposition header for filename
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_export_analysis_pdf_api_not_found(self, client):
        """Test exporting PDF for nonexistent job returns 404."""
        resp = client.get("/api/analysis/jobs/999/export/pdf")

        assert resp.status_code == 404

    def test_export_analysis_pdf_api_pending_job(self, client, db_session):
        """Test exporting PDF for pending job returns error."""
        job = AnalysisJob(
            status=AnalysisJobStatus.PENDING,
            interview_ids=["s1"],
        )
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/export/pdf")

        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/analysis/jobs/{job_id}/export/excel - Export Excel
# ---------------------------------------------------------------------------


class TestExportAnalysisExcel:
    """Tests for GET /api/analysis/jobs/{job_id}/export/excel endpoint."""

    def test_export_analysis_excel_api_success(self, client, db_session):
        """Test exporting analysis as Excel."""
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/export/excel")

        assert resp.status_code == 200
        # Should return binary content (Excel file)
        assert resp.content is not None
        assert len(resp.content) > 0
        # Check content type is Excel
        content_type = resp.headers.get("content-type", "")
        assert "application" in content_type
        # Check content disposition header for filename
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_export_analysis_excel_api_not_found(self, client):
        """Test exporting Excel for nonexistent job returns 404."""
        resp = client.get("/api/analysis/jobs/999/export/excel")

        assert resp.status_code == 404

    def test_export_analysis_excel_api_pending_job(self, client, db_session):
        """Test exporting Excel for pending job returns error."""
        job = AnalysisJob(
            status=AnalysisJobStatus.PENDING,
            interview_ids=["s1"],
        )
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/api/analysis/jobs/{job.id}/export/excel")

        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Authentication tests (all endpoints)
# ---------------------------------------------------------------------------


class TestAnalysisApiAuth:
    """Tests for API key authentication on all analysis endpoints."""

    def test_all_endpoints_require_api_key(self, client, db_session):
        """Test that all analysis endpoints require X-API-Key header."""
        # Create a job for testing
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        client.headers.pop("X-API-Key", None)

        # All these should return 401
        endpoints = [
            "/api/analysis/jobs",
            f"/api/analysis/jobs/{job.id}",
            f"/api/analysis/jobs/{job.id}/result",
            f"/api/analysis/jobs/{job.id}/topics",
            f"/api/analysis/jobs/{job.id}/export/pdf",
            f"/api/analysis/jobs/{job.id}/export/excel",
        ]

        for endpoint in endpoints:
            resp = client.get(endpoint)
            assert resp.status_code == 401, f"{endpoint} should require auth"

    def test_invalid_api_key_returns_403(self, client, db_session):
        """Test that invalid API key returns 403 Forbidden."""
        job = _make_analysis_job(status=AnalysisJobStatus.COMPLETED)
        db_session.add(job)
        db_session.commit()

        client.headers["X-API-Key"] = "wrong-key"

        resp = client.get(f"/api/analysis/jobs/{job.id}")
        assert resp.status_code == 403
