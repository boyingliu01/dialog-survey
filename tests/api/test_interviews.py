"""
Integration tests for interview management API endpoints.

Uses FastAPI TestClient with an in-memory SQLite database so no external
services are required.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
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


def _make_interview(session_id, user_id, status=InterviewStatus.IN_PROGRESS, topic="测试访谈"):
    return Interview(
        session_id=session_id,
        user_id=user_id,
        template_id="quality_survey",
        status=status,
        topic=topic,
        conversation_history=[{"role": "assistant", "content": "第一个问题"}],
    )


# ---------------------------------------------------------------------------
# GET /api/interviews
# ---------------------------------------------------------------------------


class TestListInterviews:
    def test_empty_db_returns_empty_list(self, client):
        resp = client.get("/api/interviews")
        assert resp.status_code == 200
        data = resp.json()
        assert data["interviews"] == []
        assert data["total"] == 0

    def test_returns_all_interviews(self, client, db_session):
        db_session.add(_make_interview("s1", "u1"))
        db_session.add(_make_interview("s2", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["interviews"]) == 2

    def test_each_item_has_required_fields(self, client, db_session):
        db_session.add(_make_interview("s_fields", "u_fields"))
        db_session.commit()

        resp = client.get("/api/interviews")
        item = resp.json()["interviews"][0]
        for field in ("session_id", "user_id", "status", "topic", "created_at", "updated_at"):
            assert field in item, f"Missing field: {field}"

    def test_filter_by_status_in_progress(self, client, db_session):
        db_session.add(_make_interview("s_ip", "u1", InterviewStatus.IN_PROGRESS))
        db_session.add(_make_interview("s_done", "u2", InterviewStatus.COMPLETED))
        db_session.add(_make_interview("s_cancel", "u3", InterviewStatus.CANCELLED))
        db_session.commit()

        resp = client.get("/api/interviews?status=IN_PROGRESS")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["interviews"][0]["session_id"] == "s_ip"

    def test_filter_by_status_completed(self, client, db_session):
        db_session.add(_make_interview("s_ip2", "u1", InterviewStatus.IN_PROGRESS))
        db_session.add(_make_interview("s_done2", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews?status=COMPLETED")
        data = resp.json()
        assert data["total"] == 1
        assert data["interviews"][0]["status"] == "COMPLETED"

    def test_filter_by_status_cancelled(self, client, db_session):
        db_session.add(_make_interview("s_can", "u1", InterviewStatus.CANCELLED))
        db_session.add(_make_interview("s_ip3", "u2", InterviewStatus.IN_PROGRESS))
        db_session.commit()

        resp = client.get("/api/interviews?status=CANCELLED")
        data = resp.json()
        assert data["total"] == 1
        assert data["interviews"][0]["status"] == "CANCELLED"

    def test_pagination_limit(self, client, db_session):
        for i in range(5):
            db_session.add(_make_interview(f"s_page_{i}", f"u{i}"))
        db_session.commit()

        resp = client.get("/api/interviews?limit=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["interviews"]) == 2

    def test_pagination_offset(self, client, db_session):
        for i in range(5):
            db_session.add(_make_interview(f"s_off_{i}", f"u{i}"))
        db_session.commit()

        resp = client.get("/api/interviews?limit=2&offset=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert len(data["interviews"]) == 2

    def test_default_limit_is_20(self, client, db_session):
        for i in range(25):
            db_session.add(_make_interview(f"s_lim_{i}", f"u{i}"))
        db_session.commit()

        resp = client.get("/api/interviews")
        data = resp.json()
        assert data["total"] == 25
        assert len(data["interviews"]) == 20


# ---------------------------------------------------------------------------
# GET /api/interviews/{session_id}
# ---------------------------------------------------------------------------


class TestGetInterview:
    def test_returns_interview_with_conversation_history(self, client, db_session):
        db_session.add(_make_interview("s_detail", "u_detail"))
        db_session.commit()

        resp = client.get("/api/interviews/s_detail")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "s_detail"
        assert "conversation_history" in data
        assert isinstance(data["conversation_history"], list)

    def test_not_found_returns_404(self, client):
        resp = client.get("/api/interviews/nonexistent_session")
        assert resp.status_code == 404

    def test_returns_all_interview_fields(self, client, db_session):
        db_session.add(_make_interview("s_full", "u_full"))
        db_session.commit()

        resp = client.get("/api/interviews/s_full")
        data = resp.json()
        for field in ("session_id", "user_id", "status", "topic", "created_at", "updated_at", "conversation_history"):
            assert field in data, f"Missing field: {field}"


# ---------------------------------------------------------------------------
# GET /api/interviews/{session_id}/report
# ---------------------------------------------------------------------------


class TestGetReport:
    def test_interview_not_found_returns_404(self, client):
        resp = client.get("/api/interviews/no_such_session/report")
        assert resp.status_code == 404

    def test_no_report_path_returns_404(self, client, db_session):
        interview = _make_interview("s_no_report", "u_no_report", InterviewStatus.COMPLETED)
        # report_path column doesn't exist in model, so we just don't set it
        db_session.add(interview)
        db_session.commit()

        resp = client.get("/api/interviews/s_no_report/report")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Report not available"

    def test_report_path_file_not_exist_returns_404(self, client, db_session):
        interview = _make_interview("s_bad_path", "u_rpt")
        db_session.add(interview)
        db_session.commit()

        # Directly set report_path on the DB object after commit
        interview.report_path = "/nonexistent/path/report.md"
        db_session.commit()

        resp = client.get("/api/interviews/s_bad_path/report")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Report not available"

    def test_report_file_exists_returns_content(self, client, db_session, tmp_path):
        report_file = tmp_path / "report.md"
        report_file.write_text("# Report\n\nThis is the report content.")

        interview = _make_interview("s_with_report", "u_rpt2", InterviewStatus.COMPLETED)
        db_session.add(interview)
        db_session.commit()

        interview.report_path = str(report_file)
        db_session.commit()

        resp = client.get("/api/interviews/s_with_report/report")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "s_with_report"
        assert "Report" in data["report"]
        assert data["report_path"] == str(report_file)


# ---------------------------------------------------------------------------
# POST /api/interviews/{session_id}/end
# ---------------------------------------------------------------------------


class TestEndInterview:
    def test_end_in_progress_sets_cancelled(self, client, db_session):
        db_session.add(_make_interview("s_end", "u_end", InterviewStatus.IN_PROGRESS))
        db_session.commit()

        resp = client.post("/api/interviews/s_end/end")
        assert resp.status_code == 200
        assert resp.json() == {"code": 0, "msg": "success"}

        db_session.expire_all()
        interview = db_session.query(Interview).filter_by(session_id="s_end").first()
        assert interview.status == InterviewStatus.CANCELLED

    def test_end_nonexistent_returns_404(self, client):
        resp = client.post("/api/interviews/no_such/end")
        assert resp.status_code == 404

    def test_end_completed_interview_returns_404(self, client, db_session):
        db_session.add(_make_interview("s_done_end", "u_done", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.post("/api/interviews/s_done_end/end")
        assert resp.status_code == 404

    def test_end_cancelled_interview_returns_404(self, client, db_session):
        db_session.add(_make_interview("s_cancel_end", "u_cancel", InterviewStatus.CANCELLED))
        db_session.commit()

        resp = client.post("/api/interviews/s_cancel_end/end")
        assert resp.status_code == 404
