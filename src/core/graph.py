"""LangGraph interview conversation graph."""

from typing import Any

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

    # Compile without checkpointer - database is the single source of truth
    # MemorySaver is removed to avoid state drift across server restarts and multi-worker deployments
    return workflow.compile()


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
    Database is the single source of truth for conversation state.

    Args:
        session_id: Session identifier
        user_id: User identifier
        template_id: Template to use
        topic: Interview topic
        user_message: Optional user message to process
        conversation_history: Conversation history from database (required for multi-turn)

    Returns:
        Updated interview state (caller persists to database)

    """
    print(f"[GRAPH] run_interview called: session_id={session_id}, user_message={user_message[:30] if user_message else 'None'}", flush=True)
    # Use singleton graph (stateless - no checkpointer)
    graph = get_interview_graph()
    print("[GRAPH] Graph obtained, creating initial state...", flush=True)

    # Create initial state from database history (source of truth)
    initial_state = create_initial_state(
        session_id=session_id,
        user_id=user_id,
        template_id=template_id,
        topic=topic,
    )
    print("[GRAPH] Initial state created", flush=True)

    # Restore conversation history from database
    if conversation_history:
        print(f"[GRAPH] Restoring conversation_history: {len(conversation_history)} messages", flush=True)
        initial_state["conversation_history"] = list(conversation_history)

        # Check if already initialized (has assistant messages)
        has_assistant = any(m.get("role") == "assistant" for m in conversation_history)
        if has_assistant:
            initial_state["status"] = "interviewing"
            # Estimate topic index from history
            topic_count = sum(1 for m in conversation_history if m.get("role") == "assistant")
            initial_state["current_topic_index"] = min(topic_count - 1, 2)
            print(f"[GRAPH] Restored status=interviewing, topic_index={initial_state['current_topic_index']}", flush=True)

            # 🔧 FIX: Ensure topics are populated for restored sessions
            if not initial_state.get("topics"):
                initial_state["topics"] = [
                    {
                        "id": "product_quality",
                        "name": "产品质量",
                        "description": "对产品质量的评价",
                    },
                    {
                        "id": "service_quality",
                        "name": "服务质量",
                        "description": "对服务体验的评价",
                    },
                    {
                        "id": "improvement",
                        "name": "改进建议",
                        "description": "需要改进的地方",
                    },
                ]
                print(f"[GRAPH] Populated default topics for restored session", flush=True)

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
        print(f"[GRAPH] Adding user message to history: {user_message[:30]}", flush=True)
        initial_state["conversation_history"].append({"role": "user", "content": user_message})

    # Run the graph (stateless - no config needed since no checkpointer)
    print(f"[GRAPH] Invoking graph with state: status={initial_state.get('status')}, history_len={len(initial_state.get('conversation_history', []))}", flush=True)
    result = graph.invoke(initial_state)
    print(f"[GRAPH] Graph completed, result keys: {list(result.keys())}", flush=True)

    return result


# Singleton instance
_interview_graph = None


def get_interview_graph() -> StateGraph:
    """Get singleton interview graph instance."""
    global _interview_graph
    if _interview_graph is None:
        _interview_graph = create_interview_graph()
    return _interview_graph
