"""
Interview state definition for LangGraph.
"""

from typing import TypedDict, List, Dict, Any, Optional


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
    conversation_history: List[Dict[str, str]]
    extracted_info: Dict[str, Any]

    # Topic/content
    topics: List[Dict[str, Any]]
    topic: str  # Interview topic/title
    domain_context: str  # Domain knowledge context

    # Flow control
    status: str  # "planning", "interviewing", "analyzing", "completed"

    # Pending actions
    pending_question: Optional[str]
    needs_followup: Optional[bool]
    followup_type: Optional[str]  # "clarification", "deep", "validation", "expansion"

    # Report
    report: Optional[str]
    report_path: Optional[str]


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
    return InterviewState(
        session_id=session_id,
        user_id=user_id,
        template_id=template_id,
        current_topic_index=0,
        conversation_history=[],
        extracted_info={},
        topics=[],
        topic=topic,
        domain_context="",
        status="planning",
        pending_question=None,
        needs_followup=None,
        followup_type=None,
        report=None,
        report_path=None,
    )
