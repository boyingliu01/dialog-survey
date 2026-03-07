"""
LangGraph nodes for interview conversation flow.
"""

from typing import Dict, Any
from langgraph.graph import END

from src.core.state import InterviewState


def planning_node(state: InterviewState) -> InterviewState:
    """Planning node: Initialize interview with template.

    This node loads the interview template and generates the first question.
    It transitions from "planning" to "interviewing" status.

    Args:
        state: Current interview state

    Returns:
        Updated state with first question
    """
    # TODO: Load template from TemplateManager
    # For now, use default structure

    # Set default topics if not set
    if not state.get("topics"):
        state["topics"] = [
            {
                "id": "product_quality",
                "name": "产品质量",
                "description": "对产品质量的评价",
                "initial_question": "请您对产品的整体质量做一个评价？",
            },
            {
                "id": "service_quality",
                "name": "服务质量",
                "description": "对服务体验的评价",
                "initial_question": "您对我们服务的整体体验如何？",
            },
            {
                "id": "improvement",
                "name": "改进建议",
                "description": "需要改进的地方",
                "initial_question": "您认为我们在哪些方面还有提升空间？",
            },
        ]

    # Set domain context
    if not state.get("domain_context"):
        state["domain_context"] = """
质量满意度评估维度：
1. 产品功能：产品功能是否满足需求
2. 产品性能：响应速度、稳定性等
3. 服务态度：客服响应速度、态度
4. 解决问题能力：能否有效解决问题
5. 整体满意度：综合评价
"""

    # Generate first question
    first_topic = state["topics"][0]
    state["pending_question"] = first_topic.get(
        "initial_question", "请开始分享您的想法"
    )

    # Add welcome message to history
    welcome_msg = f"您好！欢迎参加「{state['topic']}」访谈。我会问您几个问题，您可以按照自己的节奏回答。"
    state["conversation_history"] = [
        {"role": "assistant", "content": welcome_msg},
        {"role": "assistant", "content": state["pending_question"]},
    ]

    state["status"] = "interviewing"
    state["current_topic_index"] = 0

    return state


def interview_node(state: InterviewState) -> InterviewState:
    """Interview node: Process user answer and decide next action.

    This is the main conversation node. It:
    1. Gets the last user answer from conversation history
    2. Calls LLM to determine if follow-up is needed
    3. Either generates follow-up or moves to next topic

    Args:
        state: Current interview state

    Returns:
        Updated state with next question or analysis trigger
    """
    # Extract last user answer
    user_answer = ""
    for msg in reversed(state["conversation_history"]):
        if msg.get("role") == "user":
            user_answer = msg.get("content", "")
            break

    if not user_answer:
        # No user answer yet, just return
        return state

    # Call LLM to determine if follow-up is needed
    try:
        from src.services.llm import get_qwen_service

        llm = get_qwen_service()

        # Check if we should follow up
        needs_followup, followup_type, reason = llm.is_followup_needed(
            state["conversation_history"], state.get("extracted_info", {})
        )

        state["needs_followup"] = needs_followup
        state["followup_type"] = followup_type

        if needs_followup:
            # Will generate follow-up in followup_node
            return state
    except Exception as e:
        # If LLM fails, just continue without follow-up
        state["needs_followup"] = False
        state["followup_type"] = None

    # Get current topic
    current_idx = state["current_topic_index"]
    total_topics = len(state.get("topics", []))

    # Check if all topics are done
    if current_idx >= total_topics - 1:
        # All topics covered, move to analysis
        state["status"] = "analyzing"
    else:
        # Move to next topic
        next_topic = state["topics"][current_idx + 1]
        state["pending_question"] = next_topic.get("initial_question", "请继续分享")
        state["current_topic_index"] = current_idx + 1

        # Add question to history
        state["conversation_history"].append(
            {"role": "assistant", "content": state["pending_question"]}
        )

    return state


def followup_node(state: InterviewState) -> InterviewState:
    """Follow-up node: Generate follow-up question.

    This node generates a follow-up question based on:
    - The user's previous answer
    - The follow-up type (clarification, deep, validation, expansion)

    Args:
        state: Current interview state

    Returns:
        Updated state with follow-up question
    """
    # Get user answer
    user_answer = ""
    for msg in reversed(state["conversation_history"]):
        if msg.get("role") == "user":
            user_answer = msg.get("content", "")
            break

    followup_type = state.get("followup_type") or "deep"
    domain_context = state.get("domain_context", "")

    # Try to generate intelligent follow-up using LLM
    try:
        from src.services.llm import get_qwen_service

        llm = get_qwen_service()

        followup_question = llm.generate_followup(
            user_answer=user_answer,
            followup_type=followup_type,
            domain_context=domain_context,
        )
    except Exception:
        # Fallback to simple follow-up
        if followup_type == "clarification":
            followup_question = "您能具体说明一下吗？"
        elif followup_type == "deep":
            followup_question = "您能举个例子说明吗？"
        elif followup_type == "validation":
            followup_question = "您是说...对吗？"
        else:  # expansion
            followup_question = "除此之外，还有其他想法吗？"

    state["pending_question"] = followup_question

    # Add to conversation history
    state["conversation_history"].append(
        {"role": "assistant", "content": followup_question}
    )

    # Reset follow-up state
    state["needs_followup"] = False
    state["followup_type"] = None

    return state


def analysis_node(state: InterviewState) -> InterviewState:
    """Analysis node: Generate interview report.

    This node generates a structured Markdown report based on
    the conversation history and extracted information.

    Args:
        state: Current interview state

    Returns:
        Updated state with generated report
    """
    # Try to generate report using LLM
    try:
        from src.services.llm import get_qwen_service

        llm = get_qwen_service()

        report = llm.generate_report(
            conversation_history=state.get("conversation_history", []),
            topics=state.get("topics", []),
            topic=state.get("topic", "访谈"),
        )

        state["report"] = report
    except Exception:
        # Fallback to simple report
        history = state.get("conversation_history", [])

        report_lines = [
            f"# {state.get('topic', '访谈')}报告",
            "",
            "## 一、访谈基本信息",
            f"- 会话ID：{state.get('session_id', 'N/A')}",
            f"- 用户ID：{state.get('user_id', 'N/A')}",
            f"- 模板：{state.get('template_id', 'N/A')}",
            "",
            "## 二、对话摘要",
            "",
        ]

        # Add conversation
        for msg in history:
            role = "受访者" if msg.get("role") == "user" else "访谈师"
            content = msg.get("content", "")
            report_lines.append(f"**{role}**: {content}")
            report_lines.append("")

        report_lines.extend(
            [
                "## 三、提取的信息",
                "",
                str(state.get("extracted_info", {})),
                "",
                "---",
                "*报告自动生成*",
            ]
        )

        state["report"] = "\n".join(report_lines)

    state["status"] = "completed"

    return state


def should_continue(state: InterviewState) -> str:
    """Determine if conversation should continue.

    This is the router function for conditional edges.

    Args:
        state: Current interview state

    Returns:
        Next node name or "end"
    """
    # If completed, end
    if state.get("status") == "completed":
        return "end"

    # If analyzing, go to analysis
    if state.get("status") == "analyzing":
        return "analyze"

    # If needs follow-up, go to followup
    if state.get("needs_followup"):
        return "followup"

    # Otherwise continue interviewing
    return "continue"


def end_node(state: InterviewState) -> InterviewState:
    """End node: Final state cleanup.

    Args:
        state: Current interview state

    Returns:
        Final state
    """
    state["status"] = "completed"
    return state
