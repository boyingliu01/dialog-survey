"""
Tests for LangGraph core components.
"""

import pytest
from unittest.mock import patch, MagicMock
from src.core.state import InterviewState, create_initial_state
from src.core.nodes import (
    planning_node,
    interview_node,
    followup_node,
    analysis_node,
    should_continue,
    end_node,
)


class TestInterviewState:
    """Tests for interview state."""

    def test_create_initial_state(self):
        """Test creating initial state."""
        state = create_initial_state(
            session_id="test_001", user_id="user_123", topic="质量满意度调查"
        )

        assert state["session_id"] == "test_001"
        assert state["user_id"] == "user_123"
        assert state["status"] == "planning"
        assert state["conversation_history"] == []
        assert state["extracted_info"] == {}

    def test_create_initial_state_with_defaults(self):
        """Test creating initial state with defaults."""
        state = create_initial_state(session_id="test_002", user_id="user_456")

        assert state["template_id"] == "quality_survey"
        assert state["topic"] == "访谈"


class TestPlanningNode:
    """Tests for planning node."""

    def test_planning_node_sets_first_question(self):
        """Test planning node sets first question."""
        state = create_initial_state("test_001", "user_123")

        result = planning_node(state)

        assert result["status"] == "interviewing"
        assert result["pending_question"] is not None
        assert len(result["conversation_history"]) > 0

    def test_planning_node_sets_default_topics(self):
        """Test planning node sets default topics."""
        state = create_initial_state("test_001", "user_123")

        result = planning_node(state)

        assert len(result["topics"]) > 0
        assert result["topics"][0]["name"] == "产品质量"


class TestInterviewNode:
    """Tests for interview node."""

    def test_interview_node_moves_to_next_topic(self):
        """Test interview node moves to next topic when no follow-up needed."""
        state = create_initial_state("test_001", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "t1", "name": "产品质量", "initial_question": "Q1"},
            {"id": "t2", "name": "服务质量", "initial_question": "Q2"},
            {"id": "t3", "name": "改进建议", "initial_question": "Q3"},
        ]
        state["conversation_history"] = [{"role": "user", "content": "产品质量还行"}]

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (False, None, "")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        assert result["current_topic_index"] == 1

    def test_interview_node_triggers_analysis(self):
        """Test interview node triggers analysis when done."""
        state = create_initial_state("test_001", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 2  # Last topic
        state["topics"] = [
            {"id": "1", "name": "T1", "initial_question": "Q1"},
            {"id": "2", "name": "T2", "initial_question": "Q2"},
            {"id": "3", "name": "T3", "initial_question": "Q3"},
        ]
        state["conversation_history"] = [{"role": "user", "content": "回答"}]

        result = interview_node(state)

        assert result["status"] == "analyzing"


class TestFollowupNode:
    """Tests for follow-up node."""

    def test_followup_generates_question(self):
        """Test follow-up node generates question."""
        state = create_initial_state("test_001", "user_123")
        state["conversation_history"] = [{"role": "user", "content": "产品还可以"}]
        state["followup_type"] = "deep"

        result = followup_node(state)

        assert result["pending_question"] is not None
        assert len(result["conversation_history"]) > 1

    def test_followup_different_types(self):
        """Test different follow-up types."""
        types = ["clarification", "deep", "validation", "expansion"]

        for ft in types:
            state = create_initial_state("test_001", "user_123")
            state["conversation_history"] = [{"role": "user", "content": "test"}]
            state["followup_type"] = ft

            result = followup_node(state)
            assert result["pending_question"] is not None


class TestShouldContinue:
    """Tests for routing function."""

    def test_returns_end_when_completed(self):
        """Test returns end when status is completed."""
        state = {"status": "completed"}
        result = should_continue(state)
        assert result == "end"

    def test_returns_analyze_when_analyzing(self):
        """Test returns analyze when status is analyzing."""
        state = {"status": "analyzing"}
        result = should_continue(state)
        assert result == "analyze"

    def test_returns_followup_when_needed(self):
        """Test returns followup when needs_followup is True."""
        state = {"status": "interviewing", "needs_followup": True}
        result = should_continue(state)
        assert result == "followup"

    def test_returns_continue_by_default(self):
        """Test returns continue by default."""
        state = {"status": "interviewing", "needs_followup": False}
        result = should_continue(state)
        assert result == "continue"


class TestAnalysisNode:
    """Tests for analysis node."""

    def test_analysis_generates_report(self):
        """Test analysis node generates report using LLM."""
        state = create_initial_state("test_001", "user_123")
        state["topic"] = "质量满意度调查"
        state["conversation_history"] = [
            {"role": "assistant", "content": "问题1"},
            {"role": "user", "content": "回答1"},
            {"role": "assistant", "content": "问题2"},
            {"role": "user", "content": "回答2"},
        ]

        mock_llm = MagicMock()
        mock_llm.generate_report.return_value = "# 访谈报告\n\n## 一、发现\n模拟内容"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = analysis_node(state)

        assert result["report"] is not None
        assert "访谈报告" in result["report"]
        assert result["status"] == "completed"

    def test_analysis_persists_report_to_file(self, tmp_path, monkeypatch):
        """Test analysis node writes report to a file and stores the path."""
        import os

        monkeypatch.setenv("REPORTS_DIR", str(tmp_path))

        state = create_initial_state("sess_file_test", "user_123")
        state["topic"] = "文件测试访谈"
        state["conversation_history"] = [
            {"role": "assistant", "content": "问题"},
            {"role": "user", "content": "回答"},
        ]

        mock_llm = MagicMock()
        mock_llm.generate_report.return_value = "# 访谈报告\n\n内容"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = analysis_node(state)

        assert result["report_path"] is not None
        assert os.path.exists(result["report_path"])
        with open(result["report_path"], encoding="utf-8") as f:
            content = f.read()
        assert "# 访谈报告" in content

    def test_analysis_report_path_contains_session_id(self, tmp_path, monkeypatch):
        """Test report file path is scoped under the session directory."""
        monkeypatch.setenv("REPORTS_DIR", str(tmp_path))

        state = create_initial_state("my_session_abc", "user_x")
        state["topic"] = "测试"
        state["conversation_history"] = [{"role": "user", "content": "回答"}]

        mock_llm = MagicMock()
        mock_llm.generate_report.return_value = "# 访谈报告\n内容"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = analysis_node(state)

        assert "my_session_abc" in result["report_path"]

    def test_analysis_file_write_failure_does_not_crash(self, monkeypatch):
        """Test that a file write failure is handled gracefully."""
        monkeypatch.setenv("REPORTS_DIR", "/nonexistent/readonly/path/xyz")

        state = create_initial_state("sess_fail", "user_y")
        state["topic"] = "测试"
        state["conversation_history"] = [{"role": "user", "content": "回答"}]

        mock_llm = MagicMock()
        mock_llm.generate_report.return_value = "# 访谈报告\n内容"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = analysis_node(state)

        # Report is still generated even if file write fails
        assert result["report"] is not None
        assert result["status"] == "completed"
