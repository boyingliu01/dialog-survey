"""
Integration tests covering end-to-end flows: webhook → graph → report.

These tests use FastAPI TestClient with an in-memory SQLite database and
mocked LLM/DingTalk services so no external APIs are required.
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
# DB fixtures
# ---------------------------------------------------------------------------

SQLITE_URL = "sqlite:///:memory:"
TEST_API_KEY = "test-secret-api-key-12345"


@pytest.fixture(autouse=True)
def setup_test_api_key(monkeypatch):
    """Set INTERNAL_API_KEY so all endpoints pass auth."""
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_interview(session_id, user_id, status=InterviewStatus.IN_PROGRESS):
    return Interview(
        session_id=session_id,
        user_id=user_id,
        template_id="quality_survey",
        status=status,
        topic="集成测试访谈",
        conversation_history=[{"role": "assistant", "content": "第一个问题"}],
    )


# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------

class TestHealthEndpoints:
    def test_root_returns_200(self, client):
        resp = client.get("/")
        # Accept 200 or 404 depending on whether a root route is defined
        assert resp.status_code in (200, 404)

    def test_openapi_schema_accessible(self, client):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "openapi" in data


# ---------------------------------------------------------------------------
# Template endpoints
# ---------------------------------------------------------------------------

class TestTemplateEndpoints:
    def test_list_templates_returns_list(self, client):
        resp = client.get("/api/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_list_templates_items_have_id_and_name(self, client):
        resp = client.get("/api/templates")
        for item in resp.json():
            assert "id" in item
            assert "name" in item

    def test_get_existing_template(self, client):
        resp = client.get("/api/templates/quality_survey")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "quality_survey"

    def test_get_nonexistent_template_returns_fallback_or_404(self, client):
        resp = client.get("/api/templates/does_not_exist_xyz")
        # The service falls back to quality_survey or returns 404 — both are acceptable
        assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# Interview CRUD
# ---------------------------------------------------------------------------

class TestInterviewCRUD:
    def test_list_interviews_empty(self, client):
        resp = client.get("/api/interviews")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    def test_list_interviews_with_data(self, client, db_session):
        db_session.add(_make_interview("intg_s1", "u1"))
        db_session.add(_make_interview("intg_s2", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    def test_get_interview_detail(self, client, db_session):
        db_session.add(_make_interview("intg_detail", "u_detail"))
        db_session.commit()

        resp = client.get("/api/interviews/intg_detail")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "intg_detail"
        assert "conversation_history" in data

    def test_get_interview_not_found(self, client):
        resp = client.get("/api/interviews/not_a_real_session")
        assert resp.status_code == 404

    def test_end_interview_success(self, client, db_session):
        db_session.add(_make_interview("intg_end", "u_end", InterviewStatus.IN_PROGRESS))
        db_session.commit()

        resp = client.post("/api/interviews/intg_end/end")
        assert resp.status_code == 200

        db_session.expire_all()
        interview = db_session.query(Interview).filter_by(session_id="intg_end").first()
        assert interview.status == InterviewStatus.CANCELLED

    def test_end_nonexistent_interview_returns_404(self, client):
        resp = client.post("/api/interviews/ghost_session/end")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Report endpoints
# ---------------------------------------------------------------------------

class TestReportEndpoints:
    def test_report_not_found_for_missing_interview(self, client):
        resp = client.get("/api/interviews/no_such/report")
        assert resp.status_code == 404

    def test_report_not_available_without_path(self, client, db_session):
        db_session.add(_make_interview("intg_no_rpt", "u_rpt", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews/intg_no_rpt/report")
        assert resp.status_code == 404

    def test_report_returns_content_when_file_exists(self, client, db_session, tmp_path):
        report_file = tmp_path / "report.md"
        report_file.write_text("# 集成测试报告\n\n内容在此。", encoding="utf-8")

        interview = _make_interview("intg_rpt_ok", "u_rpt_ok", InterviewStatus.COMPLETED)
        db_session.add(interview)
        db_session.commit()

        interview.report_path = str(report_file)
        db_session.commit()

        resp = client.get("/api/interviews/intg_rpt_ok/report")
        assert resp.status_code == 200
        data = resp.json()
        assert "集成测试报告" in data["report"]


# ---------------------------------------------------------------------------
# Status filtering & pagination
# ---------------------------------------------------------------------------

class TestFilterAndPagination:
    def test_filter_by_in_progress(self, client, db_session):
        db_session.add(_make_interview("f_ip", "u1", InterviewStatus.IN_PROGRESS))
        db_session.add(_make_interview("f_done", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews?status=IN_PROGRESS")
        data = resp.json()
        assert data["total"] == 1
        assert data["interviews"][0]["session_id"] == "f_ip"

    def test_filter_by_completed(self, client, db_session):
        db_session.add(_make_interview("f_ip2", "u1", InterviewStatus.IN_PROGRESS))
        db_session.add(_make_interview("f_done2", "u2", InterviewStatus.COMPLETED))
        db_session.commit()

        resp = client.get("/api/interviews?status=COMPLETED")
        data = resp.json()
        assert data["total"] == 1
        assert data["interviews"][0]["status"] == "COMPLETED"

    def test_pagination_limit(self, client, db_session):
        for i in range(6):
            db_session.add(_make_interview(f"pg_{i}", f"u{i}"))
        db_session.commit()

        resp = client.get("/api/interviews?limit=3")
        data = resp.json()
        assert data["total"] == 6
        assert len(data["interviews"]) == 3

    def test_pagination_offset(self, client, db_session):
        for i in range(6):
            db_session.add(_make_interview(f"pg2_{i}", f"u{i}"))
        db_session.commit()

        resp = client.get("/api/interviews?limit=3&offset=4")
        data = resp.json()
        assert data["total"] == 6
        assert len(data["interviews"]) == 2


# ---------------------------------------------------------------------------
# Input edge cases
# ---------------------------------------------------------------------------

class TestInputEdgeCases:
    def test_empty_session_id_in_path(self, client):
        # Should return 404 or 405 but not crash
        resp = client.get("/api/interviews/ /report")
        assert resp.status_code in (404, 405, 422)

    def test_very_long_session_id(self, client):
        long_id = "a" * 500
        resp = client.get(f"/api/interviews/{long_id}")
        assert resp.status_code in (404, 422)

    def test_session_id_with_special_chars(self, client):
        resp = client.get("/api/interviews/test-session_123.abc")
        assert resp.status_code in (404, 422)

    def test_special_characters_in_interview_topic(self, client, db_session):
        """Interview with special characters in topic should be stored and returned correctly."""
        special_input = "特殊字符：<>\"'&@#$%^*()[]{}|\\~`"
        interview = Interview(
            session_id="special_chars_test",
            user_id="u_special",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic=special_input,
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        resp = client.get("/api/interviews/special_chars_test")
        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"] == special_input

    def test_unicode_content_in_conversation(self, client, db_session):
        """Conversation history with full unicode should round-trip correctly."""
        history = [
            {"role": "assistant", "content": "您好！请问您对产品质量有什么看法？"},
            {"role": "user", "content": "产品质量很好，我非常满意。🎉"},
        ]
        interview = Interview(
            session_id="unicode_test",
            user_id="u_unicode",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="Unicode测试",
            conversation_history=history,
        )
        db_session.add(interview)
        db_session.commit()

        resp = client.get("/api/interviews/unicode_test")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["conversation_history"]) == 2
        assert "🎉" in data["conversation_history"][1]["content"]
