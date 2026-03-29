"""
Tests for FR-002 AC-003: Follow-up Question Limit.

This module tests that the interview bot limits follow-up questions
to a maximum of 2 per topic, preventing over-questioning.

TDD approach: These tests are written BEFORE implementation.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.core.nodes import followup_node, interview_node, planning_node
from src.core.state import create_initial_state


# Maximum follow-up questions allowed per topic
MAX_FOLLOWUP_PER_TOPIC = 2


class TestStateHasFollowupCount:
    """Tests for state having followup_count field."""

    def test_create_initial_state_has_followup_count(self):
        """Test that create_initial_state includes followup_count field."""
        state = create_initial_state(session_id="test_001", user_id="user_123", topic="质量满意度调查")

        # State should have followup_count field initialized as empty dict
        assert "followup_count" in state
        assert state["followup_count"] == {}

    def test_state_followup_count_is_dict(self):
        """Test that followup_count is a dict type."""
        state = create_initial_state("test_002", "user_456")

        assert isinstance(state["followup_count"], dict)

    def test_state_followup_count_can_track_multiple_topics(self):
        """Test that followup_count can track counts for multiple topics."""
        state = create_initial_state("test_003", "user_789")
        state["topics"] = [
            {"id": "topic_1", "name": "产品质量"},
            {"id": "topic_2", "name": "服务质量"},
        ]

        # Manually set counts to verify dict can hold multiple topic counts
        state["followup_count"] = {"topic_1": 2, "topic_2": 1}

        assert state["followup_count"]["topic_1"] == 2
        assert state["followup_count"]["topic_2"] == 1


class TestFollowupLimitedTo2PerTopic:
    """Tests for follow-up being limited to max 2 per topic."""

    def test_interview_node_skips_followup_when_limit_reached(self):
        """Test that interview_node skips follow-up when count >= MAX for topic."""
        state = create_initial_state("test_limit_001", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
            {"id": "service_quality", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        # Simulate that we already have MAX_FOLLOWUP_PER_TOPIC follow-ups for this topic
        state["followup_count"] = {"product_quality": MAX_FOLLOWUP_PER_TOPIC}

        mock_llm = MagicMock()
        # LLM says follow-up is needed, but we should skip due to limit
        mock_llm.is_followup_needed.return_value = (True, "deep", "需要深入")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should NOT set needs_followup even though LLM says yes
        # Because limit is reached, we should move to next topic
        assert result["needs_followup"] is False
        assert result["current_topic_index"] == 1  # Moved to next topic

    def test_interview_node_allows_followup_when_below_limit(self):
        """Test that interview_node allows follow-up when count < MAX for topic."""
        state = create_initial_state("test_limit_002", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
            {"id": "service_quality", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        # Only 1 follow-up so far - should allow another
        state["followup_count"] = {"product_quality": 1}

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (True, "deep", "需要深入")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should set needs_followup because limit not reached
        assert result["needs_followup"] is True

    def test_interview_node_allows_followup_when_count_zero(self):
        """Test that interview_node allows follow-up when count is 0."""
        state = create_initial_state("test_limit_003", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        # No follow-ups yet
        state["followup_count"] = {}

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (True, "clarification", "需要澄清")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should allow follow-up
        assert result["needs_followup"] is True


class TestFollowupCountIncrements:
    """Tests for follow-up count incrementing correctly."""

    def test_followup_node_increments_count_for_current_topic(self):
        """Test that followup_node increments count for the current topic."""
        state = create_initial_state("test_increment_001", "user_123")
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        state["followup_type"] = "deep"
        state["followup_count"] = {}  # Start with empty

        result = followup_node(state)

        # Count should be incremented for the topic
        assert result["followup_count"]["product_quality"] == 1

    def test_followup_node_increments_existing_count(self):
        """Test that followup_node increments existing count."""
        state = create_initial_state("test_increment_002", "user_123")
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        state["followup_type"] = "deep"
        state["followup_count"] = {"product_quality": 1}  # Already has 1

        result = followup_node(state)

        # Count should be incremented to 2
        assert result["followup_count"]["product_quality"] == 2

    def test_followup_node_does_not_increment_when_limit_reached(self):
        """Test edge case: followup_node should not increment beyond limit."""
        state = create_initial_state("test_increment_003", "user_123")
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        state["followup_type"] = "deep"
        state["followup_count"] = {"product_quality": MAX_FOLLOWUP_PER_TOPIC}

        # Note: This state shouldn't normally reach followup_node
        # because interview_node should skip followup when limit reached.
        # But if it does happen (edge case), we should cap at MAX.
        result = followup_node(state)

        # Count should remain at MAX (not exceed)
        assert result["followup_count"]["product_quality"] == MAX_FOLLOWUP_PER_TOPIC


class TestFullInterviewWithFollowupLimit:
    """Integration tests for complete interview with follow-up limit."""

    def test_followup_count_persists_across_topics(self):
        """Test that followup_count persists correctly across topic transitions."""
        state = create_initial_state("test_persist_001", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "product_quality", "name": "产品质量"},
            {"id": "service_quality", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        # 2 follow-ups for first topic
        state["followup_count"] = {"product_quality": MAX_FOLLOWUP_PER_TOPIC}

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (False, None, "")
        mock_llm.generate_next_question_enhanced.return_value = "服务质量如何？"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should move to next topic, preserving first topic's count
        assert result["current_topic_index"] == 1
        # First topic count should still be there
        assert result["followup_count"]["product_quality"] == MAX_FOLLOWUP_PER_TOPIC
        # Second topic should start with 0 (no entry yet)
        assert "service_quality" not in result["followup_count"]

    def test_multiple_topics_each_have_own_limit(self):
        """Test that each topic has its own independent follow-up limit."""
        state = create_initial_state("test_multi_001", "user_123")
        state["current_topic_index"] = 1  # On second topic
        state["topics"] = [
            {"id": "t1", "name": "产品质量"},
            {"id": "t2", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "问题1"},
            {"role": "user", "content": "回答1"},
            {"role": "assistant", "content": "追问1"},
            {"role": "user", "content": "回答2"},
            {"role": "assistant", "content": "服务质量如何？"},
            {"role": "user", "content": "服务还行"},
        ]
        # First topic hit limit, second topic at 1
        state["followup_count"] = {"t1": MAX_FOLLOWUP_PER_TOPIC, "t2": 1}
        state["followup_type"] = "deep"

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (True, "deep", "需要深入")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Second topic should still allow follow-up (1 < MAX)
        assert result["needs_followup"] is True

    def test_planning_node_initializes_empty_followup_count(self):
        """Test that planning_node initializes followup_count as empty dict."""
        state = create_initial_state("test_planning_001", "user_123")

        result = planning_node(state)

        assert "followup_count" in result
        assert result["followup_count"] == {}

    def test_followup_count_reset_for_new_session(self):
        """Test that new session starts with empty followup_count."""
        from src.core.state import create_initial_state

        # Create two different sessions
        state1 = create_initial_state("session_001", "user_123")
        state2 = create_initial_state("session_002", "user_456")

        # Both should have empty followup_count
        assert state1["followup_count"] == {}
        assert state2["followup_count"] == {}

        # Modifying one should not affect the other
        state1["followup_count"] = {"topic_1": 2}
        assert state2["followup_count"] == {}

    def test_graph_flow_respects_followup_limit(self):
        """Integration test: verify interview_node respects follow-up limit.

        Note: We test interview_node directly rather than the full graph because
        LangGraph's MemorySaver cannot serialize MagicMock objects.
        """
        state = create_initial_state("graph_limit_test_001", "test_user")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "t1", "name": "产品质量"},
            {"id": "t2", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
            {"role": "assistant", "content": "具体说说？"},
            {"role": "user", "content": "功能稳定"},
            {"role": "assistant", "content": "还有吗？"},
            {"role": "user", "content": "没有了"},
        ]
        # Already at limit for first topic
        state["followup_count"] = {"t1": MAX_FOLLOWUP_PER_TOPIC}

        mock_llm = MagicMock()
        # LLM says follow-up is needed, but limit should prevent it
        mock_llm.is_followup_needed.return_value = (True, "deep", "深入")
        mock_llm.generate_next_question_enhanced.return_value = "服务质量如何？"

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should NOT set needs_followup (limit reached)
        assert result["needs_followup"] is False
        # Should have moved to next topic
        assert result["current_topic_index"] == 1
        # First topic count should be preserved
        assert result["followup_count"]["t1"] == MAX_FOLLOWUP_PER_TOPIC


class TestEdgeCases:
    """Tests for edge cases in follow-up limit logic."""

    def test_topic_without_id_uses_name_as_key(self):
        """Test that topics without 'id' field use 'name' as fallback key."""
        state = create_initial_state("test_edge_001", "user_123")
        state["current_topic_index"] = 0
        state["topics"] = [
            {"name": "产品质量"},  # No 'id' field
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        state["followup_type"] = "deep"
        state["followup_count"] = {}

        result = followup_node(state)

        # Should use name as key when id is missing
        assert "产品质量" in result["followup_count"]
        assert result["followup_count"]["产品质量"] == 1

    def test_followup_count_missing_in_state(self):
        """Test that nodes handle missing followup_count gracefully."""
        state = create_initial_state("test_edge_002", "user_123")
        state["current_topic_index"] = 0
        state["topics"] = [{"id": "t1", "name": "产品质量"}]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        state["followup_type"] = "deep"
        # Simulate missing followup_count (shouldn't happen but test robustness)
        state["followup_count"] = None

        # Should not crash - should initialize as empty dict
        result = followup_node(state)
        assert result["followup_count"] is not None
        assert isinstance(result["followup_count"], dict)

    def test_empty_topics_list(self):
        """Test that nodes handle empty topics list gracefully."""
        state = create_initial_state("test_edge_003", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = []  # Empty topics
        state["conversation_history"] = [
            {"role": "user", "content": "回答"},
        ]
        state["followup_count"] = {}

        result = interview_node(state)

        # Should handle gracefully - likely move to analyzing
        assert result is not None

    def test_followup_count_at_exactly_limit(self):
        """Test behavior when count is exactly at MAX_FOLLOWUP_PER_TOPIC."""
        state = create_initial_state("test_edge_004", "user_123")
        state["status"] = "interviewing"
        state["current_topic_index"] = 0
        state["topics"] = [
            {"id": "t1", "name": "产品质量"},
            {"id": "t2", "name": "服务质量"},
        ]
        state["conversation_history"] = [
            {"role": "assistant", "content": "产品质量如何？"},
            {"role": "user", "content": "质量还行"},
        ]
        # Exactly at limit (not over)
        state["followup_count"] = {"t1": MAX_FOLLOWUP_PER_TOPIC}

        mock_llm = MagicMock()
        mock_llm.is_followup_needed.return_value = (True, "deep", "需要深入")

        with patch("src.services.llm.get_qwen_service", return_value=mock_llm):
            result = interview_node(state)

        # Should NOT allow follow-up (limit reached)
        assert result["needs_followup"] is False
