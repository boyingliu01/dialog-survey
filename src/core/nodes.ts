import type { LLMProvider, Message } from "./types";
import type { InterviewState } from "./state";
import {
  PLANNING_PROMPT,
  INTERVIEW_PROMPT,
  FOLLOWUP_PROMPT,
  ANALYZE_PROMPT,
} from "./prompts";
import { extractUserAnswer } from "./state";

function buildHistory(state: InterviewState): Message[] {
  return state.conversationHistory.slice(-6);
}

export async function planningNode(
  state: InterviewState,
  llm: LLMProvider,
): Promise<InterviewState> {
  try {
    const prompt = PLANNING_PROMPT(state.template);
    const response = await llm.generateResponse(prompt, buildHistory(state));

    const assistantMessage: Message = {
      role: "assistant",
      content: response.content,
    };

    return {
      ...state,
      conversationHistory: [...state.conversationHistory, assistantMessage],
      interviewStatus: "interviewing",
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      ...state,
      conversationHistory: [
        ...state.conversationHistory,
        { role: "assistant", content: "欢迎参加访谈，我们开始吧！" },
      ],
      interviewStatus: "interviewing",
      error: errorMessage,
    };
  }
}

export async function interviewNode(
  state: InterviewState,
  llm: LLMProvider,
): Promise<InterviewState> {
  const userAnswer = extractUserAnswer(state);
  if (!userAnswer) {
    return state;
  }

  const prompt = INTERVIEW_PROMPT(
    state.template,
    state.currentTopicIndex,
    state.currentQuestionIndex,
  );

  try {
    const response = await llm.generateResponse(prompt, buildHistory(state));

    const assistantMessage: Message = {
      role: "assistant",
      content: response.content,
    };

    const answers = { ...state.answers };
    const answerKey = `q${state.currentTopicIndex}_${state.currentQuestionIndex}`;
    answers[answerKey] = userAnswer;

    let currentTopicIndex = state.currentTopicIndex;
    let currentQuestionIndex = state.currentQuestionIndex + 1;
    let completedTopics = [...state.completedTopics];
    let interviewStatus: InterviewState["interviewStatus"] =
      state.interviewStatus;
    const followupNeeded = response.isFollowupNeeded ?? false;
    const followupQuestion = response.followupQuestion;

    const questionsInTopic = state.template.questions.length;
    const topicsCount = state.template.topics.length;

    if (currentQuestionIndex >= questionsInTopic) {
      completedTopics = Array.from(
        new Set([
          ...completedTopics,
          state.template.topics[currentTopicIndex].id,
        ]),
      );
      currentTopicIndex += 1;
      currentQuestionIndex = 0;
    }

    if (completedTopics.length >= topicsCount) {
      interviewStatus = "analyzing";
    } else if (followupNeeded) {
      interviewStatus = "followup";
    } else {
      interviewStatus = "interviewing";
    }

    return {
      ...state,
      conversationHistory: [...state.conversationHistory, assistantMessage],
      answers,
      currentTopicIndex,
      currentQuestionIndex,
      completedTopics,
      interviewStatus,
      followupNeeded,
      followupQuestion,
    };
  } catch (error: unknown) {
    return {
      ...state,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function followupNode(
  state: InterviewState,
  llm: LLMProvider,
): Promise<InterviewState> {
  const userAnswer = extractUserAnswer(state) ?? "";
  const lastQuestion =
    state.template.questions[state.currentQuestionIndex]?.text ?? "";
  const prompt = FOLLOWUP_PROMPT(lastQuestion, userAnswer);

  try {
    const response = await llm.generateResponse(prompt, buildHistory(state));
    const assistantMessage: Message = {
      role: "assistant",
      content: response.content,
    };

    return {
      ...state,
      conversationHistory: [...state.conversationHistory, assistantMessage],
      followupNeeded: false,
      followupQuestion: undefined,
      interviewStatus: "interviewing",
    };
  } catch (error: unknown) {
    return {
      ...state,
      followupNeeded: false,
      followupQuestion: undefined,
      interviewStatus: "interviewing",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function analyzeNode(
  state: InterviewState,
  llm: LLMProvider,
): Promise<InterviewState> {
  try {
    const prompt = ANALYZE_PROMPT(state.template);
    const response = await llm.generateResponse(prompt, buildHistory(state));

    return {
      ...state,
      report: response.content,
      interviewStatus: "completed",
      endTime: new Date(),
    };
  } catch (error: unknown) {
    return {
      ...state,
      report:
        "# Interview Report\n\nError generating report. Please review the conversation manually.",
      interviewStatus: "completed",
      endTime: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
