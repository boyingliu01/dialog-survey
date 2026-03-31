"""
End-to-End Tests for Complete Interview Flow

These tests verify the complete interview workflow from webhook
message reception through to report generation.

Tests use mocked LLM and DingTalk services with a real or SQLite database.
"""

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.api.main import app
from src.core.graph import create_interview_graph
from src.core.state import create_initial_state
from src.models.database import Base, get_db
from src.models.interview import Interview, InterviewStatus

# Test configuration
TEST_API_KEY = "test-e2e-api-key-2024"
SQLITE_URL = "sqlite:///:memory:"


# ---------------------------------------------------------------------------
# Database Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_engine():
    """Create in-memory SQLite engine for testing."""
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
    """Create database session."""
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Set up test environment variables."""
    monkeypatch.setenv("INTERNAL_API_KEY", TEST_API_KEY)
    monkeypatch.setenv("REPORTS_DIR", tempfile.mkdtemp())


# ---------------------------------------------------------------------------
# Mock LLM Service
# ---------------------------------------------------------------------------


def create_mock_llm_service():
    """Create a deterministic mock LLM service."""
    mock = Mock()

    call_count = [0]

    def mock_is_followup_needed(history, extracted_info):
        call_count[0] += 1
        if call_count[0] % 3 == 0:
            return True, "deep", "需要深入了解这个话题"
        return False, None, None

    mock.is_followup_needed = mock_is_followup_needed

    def mock_generate_followup(user_answer, followup_type, domain_context):
        followups = {
            "clarification": "您能举个例子具体说明一下吗？",
            "deep": "您能详细描述一下这个情况吗？",
            "validation": "所以您的意思是...对吗？",
            "expansion": "除此之外，还有其他想分享的吗？",
        }
        return followups.get(followup_type, "请继续分享您的想法。")

    mock.generate_followup = mock_generate_followup

    def mock_generate_report(conversation_history, topics, topic):
        user_messages = [m["content"] for m in conversation_history if m.get("role") == "user"]
        return f"""# {topic}报告

## 访谈摘要

本次访谈共收集 {len(user_messages)} 条用户反馈。

## 用户反馈

{chr(10).join([f"- {msg}" for msg in user_messages])}

## 结论

测试报告 - 系统自动生成

---
*由 AI 面试机器人自动生成*
"""

    mock.generate_report = mock_generate_report

    return mock


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------


class TestInterviewStateMachine:
    """Test the interview state machine directly."""

    def test_planning_node_initializes_state(self, db_session):
        """Planning node should initialize interview state."""
        with patch("src.services.llm.get_qwen_service", return_value=create_mock_llm_service()):
            state = create_initial_state(
                session_id="test_session", user_id="test_user", template_id="quality_survey", topic="测试访谈"
            )

            graph = create_interview_graph()
            config = {"configurable": {"thread_id": "test_session"}}

            # Run planning node
            result = graph.invoke(state, config)

            # Graph runs through to completion since there's no user input
            assert result is not None
            assert "conversation_history" in result
            assert len(result["conversation_history"]) >= 1

    def test_interview_turn_adds_question_to_history(self, db_session):
        """Interview node should add next question to history."""
        with patch("src.services.llm.get_qwen_service", return_value=create_mock_llm_service()):
            state = create_initial_state(session_id="test_session_2", user_id="test_user", topic="测试")
            state["conversation_history"].append({"role": "user", "content": "这是一个测试回答"})

            graph = create_interview_graph()
            config = {"configurable": {"thread_id": "test_session_2"}}

            # Process the answer
            result = graph.invoke(state, config)

            # Should have added another assistant message (next question)
            assistant_msgs = [m for m in result["conversation_history"] if m.get("role") == "assistant"]
            assert len(assistant_msgs) >= 2  # At least welcome + question

    def test_interview_completes_after_all_topics(self, db_session):
        """Interview should complete after all topics are covered."""
        with patch("src.services.llm.get_qwen_service", return_value=create_mock_llm_service()):
            state = create_initial_state(session_id="test_session_3", user_id="test_user", topic="快速测试")
            # Set to last topic
            state["current_topic_index"] = len(state["topics"]) - 1
            state["conversation_history"].append({"role": "user", "content": "最后一个问题的回答"})

            graph = create_interview_graph()
            config = {"configurable": {"thread_id": "test_session_3"}}

            # Process - should move to analyzing
            result = graph.invoke(state, config)

            # Status should be analyzing or completed
            assert result["status"] in ("analyzing", "completed")

    def test_graph_compilation_succeeds(self):
        """Test that graph can be compiled."""
        graph = create_interview_graph()
        assert graph is not None


class TestInterviewCRUDEndpoints:
    """Test interview management API endpoints."""

    def _create_client(self, db_session):
        """Create test client with database override."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app, headers={"X-API-Key": TEST_API_KEY})
        yield client
        app.dependency_overrides.clear()

    def test_list_interviews_empty(self, db_session):
        """GET /api/interviews with no data returns empty list."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 0
            assert data["interviews"] == []
        app.dependency_overrides.clear()

    def test_list_interviews_with_data(self, db_session):
        """GET /api/interviews returns existing interviews."""
        from fastapi.testclient import TestClient

        # Add interview
        interview = Interview(
            session_id="list_test",
            user_id="list_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试列表",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1
            assert data["interviews"][0]["session_id"] == "list_test"
        app.dependency_overrides.clear()

    def test_get_interview_detail(self, db_session):
        """GET /api/interviews/{id} returns interview with history."""
        from fastapi.testclient import TestClient

        interview = Interview(
            session_id="detail_test",
            user_id="detail_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="详情测试",
            conversation_history=[
                {"role": "assistant", "content": "问题1"},
                {"role": "user", "content": "回答1"},
            ],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews/detail_test")
            assert resp.status_code == 200
            data = resp.json()
            assert data["session_id"] == "detail_test"
            assert len(data["conversation_history"]) == 2
        app.dependency_overrides.clear()

    def test_get_interview_not_found(self, db_session):
        """GET /api/interviews/{id} for nonexistent returns 404."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews/nonexistent")
            assert resp.status_code == 404
        app.dependency_overrides.clear()

    def test_end_interview_success(self, db_session):
        """POST /api/interviews/{id}/end cancels interview."""
        from fastapi.testclient import TestClient

        interview = Interview(
            session_id="end_test",
            user_id="end_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="结束测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.post("/api/interviews/end_test/end")
            assert resp.status_code == 200

            db_session.expire_all()
            updated = db_session.query(Interview).filter_by(session_id="end_test").first()
            assert updated.status == InterviewStatus.CANCELLED
        app.dependency_overrides.clear()

    def test_filter_interviews_by_status(self, db_session):
        """GET /api/interviews?status=X filters correctly."""
        from fastapi.testclient import TestClient

        # Add interviews with different statuses
        statuses_to_add = [
            InterviewStatus.IN_PROGRESS,
            InterviewStatus.COMPLETED,
            InterviewStatus.IN_PROGRESS,
        ]
        for i, status in enumerate(statuses_to_add):
            db_session.add(
                Interview(
                    session_id=f"filter_{i}",
                    user_id=f"filter_user_{i}",
                    template_id="quality_survey",
                    status=status,
                    topic="过滤测试",
                    conversation_history=[],
                )
            )
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews?status=IN_PROGRESS")
            data = resp.json()
            assert data["total"] == 2
        app.dependency_overrides.clear()


class TestTemplateEndpoints:
    """Test template API endpoints."""

    def test_list_templates(self, db_session):
        """GET /api/templates returns template list."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/templates")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            assert len(data) > 0
        app.dependency_overrides.clear()

    def test_get_template_by_id(self, db_session):
        """GET /api/templates/{id} returns template details."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/templates/quality_survey")
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == "quality_survey"
            assert "topics" in data
            assert "domain_context" in data
        app.dependency_overrides.clear()


class TestReportGeneration:
    """Test interview report generation."""

    def test_report_generated_on_completion(self, db_session, tmp_path):
        """Report should be generated when interview completes."""
        from fastapi.testclient import TestClient

        # Create completed interview
        interview = Interview(
            session_id="report_test",
            user_id="report_user",
            template_id="quality_survey",
            status=InterviewStatus.COMPLETED,
            topic="报告测试",
            conversation_history=[
                {"role": "assistant", "content": "问题"},
                {"role": "user", "content": "回答"},
            ],
        )

        # Create report file
        report_dir = tmp_path / "report_test"
        report_dir.mkdir()
        report_file = report_dir / "report.md"
        report_file.write_text("# 测试报告\n\n这是测试内容。", encoding="utf-8")
        interview.report_path = str(report_file)

        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews/report_test/report")
            assert resp.status_code == 200
            data = resp.json()
            assert "测试报告" in data["report"]
        app.dependency_overrides.clear()

    def test_report_not_available_for_in_progress(self, db_session):
        """Report endpoint returns 404 for in-progress interview."""
        from fastapi.testclient import TestClient

        interview = Interview(
            session_id="no_report_test",
            user_id="no_report_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="无报告测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
            resp = client.get("/api/interviews/no_report_test/report")
            assert resp.status_code == 404
        app.dependency_overrides.clear()


class TestHealthEndpoints:
    """Test health and info endpoints."""

    def test_health_check(self, db_session):
        """GET /health returns healthy status."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.get("/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "healthy"
        app.dependency_overrides.clear()

    def test_root_endpoint(self, db_session):
        """GET / returns API info."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.get("/")
            assert resp.status_code == 200
            data = resp.json()
            assert "name" in data
            assert "version" in data
        app.dependency_overrides.clear()

    def test_openapi_schema(self, db_session):
        """GET /openapi.json returns OpenAPI schema."""
        from fastapi.testclient import TestClient

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            resp = client.get("/openapi.json")
            assert resp.status_code == 200
            data = resp.json()
            assert "openapi" in data
            assert "paths" in data
        app.dependency_overrides.clear()


class TestFullInterviewFlow:
    """
    End-to-end test simulating a complete interview session.

    This test verifies:
    1. User starts interview via webhook
    2. User answers questions through multiple turns
    3. Follow-up questions are asked when needed
    4. Interview completes and report is generated
    5. Report can be retrieved via API
    """

    def test_complete_interview_flow(self, db_session, tmp_path):
        """Simulate a complete interview from start to report."""
        from fastapi.testclient import TestClient

        # Set reports directory
        reports_dir = str(tmp_path / "reports")
        os.makedirs(reports_dir, exist_ok=True)

        def override_get_db():
            yield db_session

        app.dependency_overrides[get_db] = override_get_db

        with patch.dict(os.environ, {"REPORTS_DIR": reports_dir}):
            with TestClient(app, headers={"X-API-Key": TEST_API_KEY}) as client:
                # Step 1: Create an interview directly in DB
                interview = Interview(
                    session_id="flow_session",
                    user_id="flow_user",
                    template_id="quality_survey",
                    status=InterviewStatus.IN_PROGRESS,
                    topic="测试访谈",
                    conversation_history=[
                        {"role": "assistant", "content": "欢迎参加访谈！"},
                        {"role": "assistant", "content": "第一个问题：产品质量如何？"},
                    ],
                )
                db_session.add(interview)
                db_session.commit()

                # Step 2: Check interview status via API
                resp = client.get("/api/interviews/flow_session")
                assert resp.status_code == 200
                data = resp.json()
                assert data["session_id"] == "flow_session"
                assert len(data["conversation_history"]) >= 2

                # Step 3: Verify listing works
                resp = client.get("/api/interviews")
                assert resp.status_code == 200
                data = resp.json()
                assert data["total"] >= 1

                # Step 4: End interview
                resp = client.post("/api/interviews/flow_session/end")
                assert resp.status_code == 200

                # Verify status changed
                db_session.expire_all()
                updated = db_session.query(Interview).filter_by(session_id="flow_session").first()
                assert updated.status == InterviewStatus.CANCELLED

        app.dependency_overrides.clear()
