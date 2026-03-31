"""Interview state definition for LangGraph."""

from typing import Any, TypedDict


class InterviewState(TypedDict):
    """State for interview conversation flow.

    This defines the data structure that flows through the LangGraph.
    """

    # Session identifiers
    session_id: str
    user_id: str
    template_id: str

    # Conversation state
    current_topic_index: int
    conversation_history: list[dict[str, str]]
    extracted_info: dict[str, Any]

    # Topic/content
    topics: list[dict[str, Any]]
    topic: str  # Interview topic/title
    domain_context: str  # Domain knowledge context

    # Flow control
    status: str  # "planning", "interviewing", "analyzing", "completed"

    # Follow-up tracking (FR-002 AC-003: max 2 follow-ups per topic)
    followup_count: dict[str, int]  # topic_id -> count of follow-ups asked

    # Pending actions
    pending_question: str | None
    needs_followup: bool | None
    followup_type: str | None  # "clarification", "deep", "validation", "expansion"
    followup_reason: str | None  # Reason for follow-up

    # Report
    report: str | None
    report_path: str | None

    # Persona configuration
    persona_config: dict[str, Any] | None  # Role, personality, style settings


def create_initial_state(
    session_id: str,
    user_id: str,
    template_id: str = "quality_survey",
    topic: str = "访谈",
) -> InterviewState:
    """Create initial interview state.

    Args:
        session_id: Unique session identifier
        user_id: User identifier
        template_id: Interview template ID
        topic: Interview topic

    Returns:
        Initial InterviewState

    """
    return {
        "session_id": session_id,
        "user_id": user_id,
        "template_id": template_id,
        "current_topic_index": 0,
        "conversation_history": [],
        "extracted_info": {},
        "topics": [],
        "topic": topic,
        "domain_context": "",
        "status": "planning",
        "followup_count": {},  # FR-002 AC-003: Initialize empty follow-up count per topic
        "pending_question": None,
        "needs_followup": None,
        "followup_type": None,
        "followup_reason": None,
        "report": None,
        "report_path": None,
        "persona_config": None,
    }
