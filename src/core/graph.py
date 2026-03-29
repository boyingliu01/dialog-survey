"""
LangGraph interview conversation graph.
"""

from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from src.core.nodes import (
    analysis_node,
    end_node,
    followup_node,
    interview_node,
    planning_node,
    should_continue,
)
from src.core.state import InterviewState, create_initial_state


def create_interview_graph() -> StateGraph:
    """Create the interview conversation graph.

    The graph has the following structure:

        planning → interviewing
                      ↓
              ┌───────┴───────┐
              │               │
         needs_followup    continue
              ↓               ↓
           followup      next topic or
              ↓          analyze
              └──────┬───────┘
                     ↓
                  analyze → completed

    Returns:
        Compiled LangGraph StateGraph
    """
    # Create workflow
    workflow = StateGraph(InterviewState)

    # Add nodes
    workflow.add_node("planning", planning_node)
    workflow.add_node("interviewing", interview_node)
    workflow.add_node("followup", followup_node)
    workflow.add_node("analyzing", analysis_node)
    workflow.add_node("completed", end_node)

    # Set entry point
    workflow.set_entry_point("planning")

    # Flow: planning -> interviewing
    workflow.add_edge("planning", "interviewing")

    # Conditional edges from interviewing
    workflow.add_conditional_edges(
        "interviewing",
        should_continue,
        {
            "followup": "followup",
            "continue": "interviewing",
            "analyze": "analyzing",
            "end": "completed",
        },
    )

    # Flow: followup -> interviewing
    workflow.add_edge("followup", "interviewing")

    # Flow: analyzing -> completed
    workflow.add_edge("analyzing", "completed")

    # End
    workflow.add_edge("completed", END)

    # Compile with memory checkpoint
    checkpointer = MemorySaver()

    return workflow.compile(checkpointer=checkpointer)


def run_interview(
    session_id: str,
    user_id: str,
    template_id: str = "quality_survey",
    topic: str = "质量满意度调查",
    user_message: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    current_topic_index: int | None = None,
    completed_topics: list[str] | None = None,
) -> InterviewState:
    """Run an interview conversation turn.

    This is the main entry point for processing interview messages.

    Args:
        session_id: Session identifier
        user_id: User identifier
        template_id: Template to use
        topic: Interview topic
        user_message: Optional user message to process
        conversation_history: Optional conversation history from database

    Returns:
        Updated interview state
    """
    # Use singleton graph to preserve state across calls
    graph = get_interview_graph()

    # Create initial state
    config = {"configurable": {"thread_id": session_id}}

    # 🔧 FIX: Prefer database history over MemorySaver (which is lost on restart)
    # Check if we have history from database (source of truth)
    if conversation_history:
        # Use database history - this is the source of truth
        initial_state = create_initial_state(
            session_id=session_id,
            user_id=user_id,
            template_id=template_id,
            topic=topic,
        )
        initial_state["conversation_history"] = list(conversation_history)

        # Check if already initialized (has assistant messages)
        has_assistant = any(m.get("role") == "assistant" for m in conversation_history)
        if has_assistant:
            initial_state["status"] = "interviewing"
            # Estimate topic index from history
            topic_count = sum(1 for m in conversation_history if m.get("role") == "assistant")
            initial_state["current_topic_index"] = min(topic_count - 1, 2)
    else:
        # No database history - try MemorySaver or create new
        try:
            state = graph.get_state(config)
            if state is None or not state.values:
                initial_state = create_initial_state(
                    session_id=session_id,
                    user_id=user_id,
                    template_id=template_id,
                    topic=topic,
                )
            else:
                initial_state = dict(state.values)
        except Exception:
            initial_state = create_initial_state(
                session_id=session_id,
                user_id=user_id,
                template_id=template_id,
                topic=topic,
            )

    # Ensure required fields exist (for restored sessions)
    required_fields = {
        "conversation_history": [],
        "extracted_info": {},
        "topics": [],
        "current_topic_index": 0,
        "status": "planning",
        "pending_question": None,
        "needs_followup": False,
        "followup_type": None,
        "followup_count": {},  # FR-002 AC-003: Follow-up count per topic
        "report": None,
        "report_path": None,
        "domain_context": "",
        "topic": topic,
        "user_id": user_id,
        "template_id": template_id,
        "session_id": session_id,
    }

    for field, default_value in required_fields.items():
        if field not in initial_state:
            initial_state[field] = default_value

    # Add user message if provided
    if user_message:
        initial_state["conversation_history"].append({"role": "user", "content": user_message})

    # Run the graph
    result = graph.invoke(initial_state, config)

    return result


# Singleton instance
_interview_graph = None


def get_interview_graph() -> StateGraph:
    """Get singleton interview graph instance."""
    global _interview_graph
    if _interview_graph is None:
        _interview_graph = create_interview_graph()
    return _interview_graph
