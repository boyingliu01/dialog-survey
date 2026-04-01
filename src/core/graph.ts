import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import type { InterviewTemplate, LLMProvider } from "./types";
import type { InterviewState } from "./state";
import { InterviewStateAnnotation, createInitialState } from "./state";
import {
  planningNode,
  interviewNode,
  followupNode,
  analyzeNode,
} from "./nodes";
import { isInterviewComplete } from "./edges";

// Graph instance cache
let graphInstance: ReturnType<typeof createInterviewGraph> | null = null;

/**
 * Create the interview conversation graph using LangGraph StateGraph.
 * Uses method chaining for proper type inference.
 */
export function createInterviewGraph(llm?: LLMProvider) {
  // Use method chaining for proper TypeScript type inference
  const workflow = new StateGraph(InterviewStateAnnotation)
    // Add nodes
    .addNode("planning", async (state: InterviewState) => {
      if (!llm) {
        return {
          conversationHistory: [
            ...state.conversationHistory,
            {
              role: "assistant" as const,
              content: "欢迎参加访谈，我们开始吧！",
            },
          ],
          interviewStatus: "interviewing" as const,
        };
      }
      return planningNode(state, llm);
    })
    .addNode("interviewing", async (state: InterviewState) => {
      if (!llm) {
        return state;
      }
      return interviewNode(state, llm);
    })
    .addNode("followup", async (state: InterviewState) => {
      if (!llm) {
        return {
          ...state,
          followupNeeded: false,
          followupQuestion: undefined,
          interviewStatus: "interviewing" as const,
        };
      }
      return followupNode(state, llm);
    })
    .addNode("analyzing", async (state: InterviewState) => {
      if (!llm) {
        return {
          report: "# Interview Report\n\nInterview completed.",
          interviewStatus: "completed" as const,
          endTime: new Date(),
        };
      }
      return analyzeNode(state, llm);
    })
    // Set entry point
    .addEdge(START, "planning")
    // planning -> interviewing
    .addEdge("planning", "interviewing")
    // Conditional edges from interviewing
    .addConditionalEdges("interviewing", (state: InterviewState) => {
      if (state.followupNeeded || state.interviewStatus === "followup") {
        return "followup";
      }
      if (state.interviewStatus === "analyzing" || isInterviewComplete(state)) {
        return "analyzing";
      }
      return END;
    })
    // followup -> END (waiting for user)
    .addEdge("followup", END)
    // analyzing -> END
    .addEdge("analyzing", END);

  // Compile with memory saver
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}

/**
 * Get or create the singleton graph instance.
 */
export function getInterviewGraph(llm?: LLMProvider) {
  if (!graphInstance) {
    graphInstance = createInterviewGraph(llm);
  }
  return graphInstance;
}

/**
 * Run a single turn of the interview.
 */
export async function runInterviewTurn(
  sessionId: string,
  templateId: string,
  template: InterviewTemplate,
  userMessage: string | null,
  llm?: LLMProvider,
): Promise<InterviewState> {
  const graph = getInterviewGraph(llm);

  const initialState: InterviewState = {
    sessionId,
    templateId,
    template,
    conversationHistory: userMessage
      ? [{ role: "user" as const, content: userMessage }]
      : [],
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    completedTopics: [],
    interviewStatus: "planning",
    followupNeeded: false,
    followupQuestion: undefined,
    startTime: new Date(),
    endTime: undefined,
    report: undefined,
    error: undefined,
  };

  const result = await graph.invoke(initialState, {
    configurable: { thread_id: sessionId },
  });

  return result;
}

/**
 * Resume an existing interview.
 */
export async function resumeInterview(
  sessionId: string,
  currentState: InterviewState,
  userMessage: string,
  llm?: LLMProvider,
): Promise<InterviewState> {
  const graph = getInterviewGraph(llm);

  const stateWithMessage: InterviewState = {
    ...currentState,
    conversationHistory: [
      ...currentState.conversationHistory,
      { role: "user" as const, content: userMessage },
    ],
  };

  const result = await graph.invoke(stateWithMessage, {
    configurable: { thread_id: sessionId },
  });

  return result;
}

/**
 * Reset the graph instance.
 */
export function resetGraphInstance(): void {
  graphInstance = null;
}

// Legacy exports
export { createInitialState };
export { isInterviewComplete } from "./edges";
