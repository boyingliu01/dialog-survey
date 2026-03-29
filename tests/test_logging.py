"""
Tests verifying that key operations emit structured log records.
Uses pytest's caplog fixture — no external dependencies needed.
"""

import logging
from unittest.mock import MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.models.database import Base, get_db
from src.models.interview import Interview, InterviewStatus

# ---------------------------------------------------------------------------
# Shared DB fixture (same pattern as test_webhook.py)
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
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
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Include valid signature headers since signature verification is now mandatory
    with TestClient(app, headers={"timestamp": "1234567890", "signature": "valid_sig", "nonce": "test_nonce"}) as c:
        yield c
    app.dependency_overrides.clear()


def _mock_dingtalk(user_id="user123", content="开始"):
    svc = Mock()
    svc.verify_signature.return_value = True
    svc.parse_webhook_message.return_value = {
        "msg_type": "text",
        "user_id": user_id,
        "content": content,
        "conversation_id": "conv_001",
    }
    return svc


# ---------------------------------------------------------------------------
# Webhook logging tests
# ---------------------------------------------------------------------------

class TestWebhookLogging:
    def test_incoming_message_is_logged(self, client, caplog):
        """Every POST to /api/webhook should log the received message."""
        with caplog.at_level(logging.INFO, logger="src.api.webhook"):
            with patch("src.api.webhook.get_dingtalk_service") as mock_dt:
                mock_dt.return_value = _mock_dingtalk(content="随便说")
                client.post("/api/webhook", json={})

        assert any("user123" in r.message for r in caplog.records)

    def test_new_interview_start_is_logged(self, client, caplog):
        """Starting a new interview logs a session-creation event."""
        with caplog.at_level(logging.INFO, logger="src.api.webhook"):
            with patch("src.api.webhook.get_dingtalk_service") as mock_dt, \
                 patch("src.api.webhook.run_interview") as mock_run:
                mock_dt.return_value = _mock_dingtalk(content="开始")
                mock_run.return_value = {
                    "conversation_history": [{"role": "assistant", "content": "欢迎"}],
                    "status": "interviewing",
                }
                client.post("/api/webhook", json={"senderStaffId": "user123"})

        messages = [r.message for r in caplog.records]
        assert any("session" in m.lower() or "interview" in m.lower() or "user123" in m for m in messages)

    def test_langgraph_error_is_logged_as_error(self, client, db_session, caplog):
        """LangGraph errors are logged at ERROR level."""
        interview = Interview(
            session_id="sess_log_err",
            user_id="err_user",
            template_id="quality_survey",
            status=InterviewStatus.IN_PROGRESS,
            topic="测试",
            conversation_history=[],
        )
        db_session.add(interview)
        db_session.commit()

        with caplog.at_level(logging.ERROR, logger="src.api.webhook"):
            with patch("src.api.webhook.get_dingtalk_service") as mock_dt, \
                 patch("src.api.webhook.run_interview", side_effect=RuntimeError("boom")):
                mock_dt.return_value = _mock_dingtalk(user_id="err_user", content="回答")
                client.post("/api/webhook", json={"senderStaffId": "err_user"})

        error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
        assert len(error_records) >= 1
        assert any("boom" in r.message or "sess_log_err" in r.message for r in error_records)


# ---------------------------------------------------------------------------
# Node logging tests
# ---------------------------------------------------------------------------

class TestNodeLogging:
    def test_analysis_node_logs_report_save(self, tmp_path, monkeypatch, caplog):
        """analysis_node logs when the report file is saved."""
        from src.core.nodes import analysis_node
        from src.core.state import create_initial_state

        monkeypatch.setenv("REPORTS_DIR", str(tmp_path))

        state = create_initial_state("log_sess_01", "user_log")
        state["topic"] = "日志测试"
        state["conversation_history"] = [{"role": "user", "content": "回答"}]

        mock_llm = MagicMock()
        mock_llm.generate_report.return_value = "# 访谈报告\n内容"

        with caplog.at_level(logging.INFO, logger="src.core.nodes"):
            with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
                result = analysis_node(state)

        assert result["report_path"] is not None
        # Should log something about report generation / file save
        messages = " ".join(r.message for r in caplog.records)
        assert "report" in messages.lower() or "log_sess_01" in messages

    def test_planning_node_logs_session_init(self, caplog):
        """planning_node logs interview initialization."""
        from src.core.nodes import planning_node
        from src.core.state import create_initial_state

        state = create_initial_state("log_sess_02", "user_log")

        with caplog.at_level(logging.INFO, logger="src.core.nodes"):
            planning_node(state)

        assert len(caplog.records) >= 1
