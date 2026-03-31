"""LangGraph nodes for interview conversation flow."""

import logging
from typing import Any

from src.core.state import InterviewState

logger = logging.getLogger(__name__)

# Maximum conversation history size to prevent unbounded growth
MAX_CONVERSATION_HISTORY = 100

# FR-002 AC-003: Maximum follow-up questions per topic
MAX_FOLLOWUP_PER_TOPIC = 2


def _get_topic_key(topic: dict[str, Any]) -> str:
    """Get unique key for a topic (use id if available, else name).

    Args:
        topic: Topic dict with 'id' and/or 'name' fields

    Returns:
        Unique key string for the topic

    """
    return topic.get("id") or topic.get("name") or "unknown_topic"


def _truncate_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Truncate conversation history to max size, keeping most recent messages.

    Args:
        history: Current conversation history

    Returns:
        Truncated history keeping most recent messages

    """
    if len(history) > MAX_CONVERSATION_HISTORY:
        return history[-MAX_CONVERSATION_HISTORY:]
    return history


def planning_node(state: InterviewState) -> InterviewState:
    """Planning node: Initialize interview with template.

    This node loads the interview template and generates the first question using LLM.
    It transitions from "planning" to "interviewing" status.

    Args:
        state: Current interview state

    Returns:
        Updated state with first question

    """
    # 🔧 FIX: Check if already initialized - skip if conversation already started
    existing_history = state.get("conversation_history", [])
    has_assistant_message = any(msg.get("role") == "assistant" for msg in existing_history)
    if has_assistant_message:
        # Already initialized, skip planning and go directly to interviewing
        logger.info(
            "Interview already initialized, skipping planning. session=%s",
            state.get("session_id"),
        )
        state["status"] = "interviewing"
        # Ensure followup_count is initialized (FR-002 AC-003)
        if state.get("followup_count") is None:
            state["followup_count"] = {}
        return state

    # Set default topics if not set
    if not state.get("topics"):
        state["topics"] = [
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

    # Get persona config from template or use default
    persona_config = state.get("persona_config") or {
        "role_name": "用户体验研究员",
        "personality": "友善、善于倾听、专业但不刻板",
        "conversation_style": "轻松自然的对话式，像朋友聊天一样",
        "tone": "友好、开放、鼓励分享",
        "topic_name": state.get("topic", "用户访谈"),
        "topic_scope": "产品质量、服务体验、改进建议",
    }

    # Generate opening question using LLM
    try:
        from src.services.llm import get_qwen_service

        llm = get_qwen_service()

        first_topic = state["topics"][0]
        opening = llm.generate_opening_question(
            topic_name=state.get("topic", "用户访谈"),
            topic_description=state.get("domain_context", ""),
            first_topic=first_topic["name"],
            persona_config=persona_config,
        )

        state["pending_question"] = opening
        logger.info("Generated opening question using LLM")
    except Exception as e:
        logger.warning("Failed to generate opening with LLM, using fallback: %s", e)
        # Fallback to simple welcome
        first_topic = state["topics"][0]
        state["pending_question"] = (
            f"你好！欢迎参加今天的访谈。我想先聊聊{first_topic['name']}，你能分享一下你的想法吗？"
        )

    # Add to conversation history
    state["conversation_history"] = [
        {"role": "assistant", "content": state["pending_question"]},
    ]

    state["status"] = "interviewing"
    state["current_topic_index"] = 0
    state["persona_config"] = persona_config
    state["followup_count"] = {}  # FR-002 AC-003: Initialize empty follow-up count

    logger.info(
        "Interview session initialized session=%s user=%s",
        state.get("session_id"),
        state.get("user_id"),
    )

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
    print(f"[NODE] interview_node called: status={state.get('status')}, history_len={len(state.get('conversation_history', []))}", flush=True)
    # Extract last user answer
    user_answer = ""
    for msg in reversed(state["conversation_history"]):
        if msg.get("role") == "user":
            user_answer = msg.get("content", "")
            break

    print(f"[NODE] Extracted user_answer: {user_answer[:30] if user_answer else 'None'}", flush=True)
    if not user_answer:
        # No user answer yet, just return
        # Mark as waiting for user input
        state["status"] = "waiting_for_user"
        print("[NODE] No user answer, setting status=waiting_for_user", flush=True)
        return state

    # Call LLM to determine if follow-up is needed
    print("[NODE] Calling LLM to check if followup needed...", flush=True)
    try:
        from src.services.llm import get_qwen_service

        llm = get_qwen_service()

        # Check if we should follow up
        needs_followup, followup_type, _reason = llm.is_followup_needed(
            state["conversation_history"], state.get("extracted_info", {})
        )

        print(f"[NODE] LLM returned: needs_followup={needs_followup}, type={followup_type}", flush=True)
        state["needs_followup"] = needs_followup
        state["followup_type"] = followup_type

        # FR-002 AC-003: Check if follow-up limit reached for current topic
        if needs_followup:
            topics = state.get("topics", [])
            current_idx = state.get("current_topic_index", 0)
            followup_count = state.get("followup_count", {})

            if current_idx < len(topics):
                current_topic = topics[current_idx]
                topic_key = _get_topic_key(current_topic)
                current_count = followup_count.get(topic_key, 0)

                # If limit reached, skip follow-up and move to next topic
                if current_count >= MAX_FOLLOWUP_PER_TOPIC:
                    logger.info(
                        "Follow-up limit reached for topic '%s' (count=%d), skipping followup",
                        topic_key,
                        current_count,
                    )
                    print(f"[NODE] Followup limit reached for topic {topic_key}", flush=True)
                    state["needs_followup"] = False
                    state["followup_type"] = None
                    # Continue to next topic logic below
                else:
                    # Will generate follow-up in followup_node
                    print("[NODE] Will generate followup in followup_node", flush=True)
                    return state
    except Exception as e:
        # If LLM fails, just continue without follow-up
        print(f"[NODE] LLM exception: {e}", flush=True)
        state["needs_followup"] = False
        state["followup_type"] = None

    # Get current topic
    current_idx = state["current_topic_index"]
    total_topics = len(state.get("topics", []))
    print(f"[NODE] current_idx={current_idx}, total_topics={total_topics}", flush=True)

    # Check if all topics are done
    if current_idx >= total_topics - 1:
        # All topics covered, move to analysis
        state["status"] = "analyzing"
        print("[NODE] All topics done, setting status=analyzing", flush=True)
    else:
        # Move to next topic - generate question using LLM
        print("[NODE] Moving to next topic...", flush=True)
        next_topic = state["topics"][current_idx + 1]

        try:
            from src.services.llm import get_qwen_service

            llm = get_qwen_service()

            persona_config = state.get("persona_config") or {
                "role_name": "用户体验研究员",
                "personality": "友善、善于倾听、专业但不刻板",
                "conversation_style": "轻松自然的对话式，像朋友聊天一样",
                "tone": "友好、开放、鼓励分享",
            }
            print(f"[NODE] Generating next question for topic: {next_topic['name']}", flush=True)
            next_question = llm.generate_next_question_enhanced(
                conversation_history=state["conversation_history"],
                current_topic=next_topic["name"],
                topic_description=next_topic.get("description", ""),
                current_topic_index=current_idx + 1,
                total_topics=total_topics,
                extracted_info=state.get("extracted_info", {}),
                persona_config=persona_config,
            )
            state["pending_question"] = next_question
            logger.info("Generated next question using LLM for topic: %s", next_topic["name"])
            print(f"[NODE] Next question generated: {next_question[:50]}", flush=True)
        except Exception as e:
            logger.warning("Failed to generate next question with LLM, using fallback: %s", e)
            print(f"[NODE] LLM failed for next question: {e}", flush=True)
            # Fallback to simple transition
            state["pending_question"] = (
                f"接下来我想聊聊{next_topic['name']}，{next_topic.get('description', '你有什么想法？')}"
            )

        state["current_topic_index"] = current_idx + 1

        # Add question to history
        state["conversation_history"].append({"role": "assistant", "content": state["pending_question"]})
        state["conversation_history"] = _truncate_history(state["conversation_history"])

    print(f"[NODE] interview_node done: status={state.get('status')}", flush=True)
    return state


def followup_node(state: InterviewState) -> InterviewState:
    """Follow-up node: Generate follow-up question.

    This node generates a follow-up question based on:
    - The user's previous answer
    - The follow-up type (clarification, deep, validation, expansion)
    - Full conversation context

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
    followup_reason = state.get("followup_reason", "需要更多信息")

    # Try to generate intelligent follow-up using LLM with full context
    try:
        from src.services.llm import get_qwen_service
        from src.services.prompts import (
            FOLLOWUP_GENERATE_PROMPT,
            build_system_prompt,
            format_conversation_history,
        )

        llm = get_qwen_service()

        persona_config = state.get("persona_config") or {
            "role_name": "用户体验研究员",
            "personality": "友善、善于倾听、专业但不刻板",
            "conversation_style": "轻松自然的对话式，像朋友聊天一样",
            "tone": "友好、开放、鼓励分享",
        }
        system_prompt = build_system_prompt(**persona_config) if persona_config else ""

        prompt = FOLLOWUP_GENERATE_PROMPT.format(
            system_prompt=system_prompt,
            conversation_history=format_conversation_history(state["conversation_history"]),
            user_answer=user_answer,
            followup_type=followup_type,
            followup_reason=followup_reason,
        )

        followup_question = llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

        logger.info("Generated follow-up question using LLM: %s", followup_question[:50])
    except Exception as e:
        logger.warning("Failed to generate follow-up with LLM, using fallback: %s", e)
        # Fallback to simple follow-up
        if followup_type == "clarification":
            followup_question = "你能具体说说吗？"
        elif followup_type == "deep":
            followup_question = "能多分享一些细节吗？"
        elif followup_type == "validation":
            followup_question = "我理解得对吗？"
        else:  # expansion
            followup_question = "还有其他想法吗？"

    state["pending_question"] = followup_question

    # Add to conversation history
    state["conversation_history"].append({"role": "assistant", "content": followup_question})
    state["conversation_history"] = _truncate_history(state["conversation_history"])

    # FR-002 AC-003: Increment follow-up count for current topic
    # Initialize followup_count if missing (edge case handling)
    if state.get("followup_count") is None:
        state["followup_count"] = {}

    followup_count = state["followup_count"]
    topics = state.get("topics", [])
    current_idx = state.get("current_topic_index", 0)

    if current_idx < len(topics):
        current_topic = topics[current_idx]
        topic_key = _get_topic_key(current_topic)
        current_count = followup_count.get(topic_key, 0)

        # Cap at MAX_FOLLOWUP_PER_TOPIC (don't exceed)
        if current_count < MAX_FOLLOWUP_PER_TOPIC:
            followup_count[topic_key] = current_count + 1
            logger.info(
                "Follow-up count for topic '%s' incremented to %d",
                topic_key,
                followup_count[topic_key],
            )
        else:
            # Edge case: somehow reached followup_node when limit was already reached
            logger.warning(
                "Follow-up count for topic '%s' already at max (%d), not incrementing",
                topic_key,
                current_count,
            )

    # Reset follow-up state
    state["needs_followup"] = False
    state["followup_type"] = None
    state["followup_reason"] = None

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

    # Persist report to file using ReportService
    try:
        from src.services.report_service import get_report_service

        report_service = get_report_service()
        report_path = report_service.save_report(state["session_id"], state["report"])
        state["report_path"] = report_path
        logger.info("Report saved session=%s path=%s", state.get("session_id"), report_path)
    except Exception:
        state["report_path"] = None

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

    # If waiting for user input, end (wait for next message)
    if state.get("status") == "waiting_for_user":
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
