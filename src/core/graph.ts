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

interface CompiledGraph {
  invoke: (
    input: InterviewState,
    config?: { configurable: { thread_id: string } },
  ) => Promise<InterviewState>;
}

let graphInstance: CompiledGraph | null = null;

export function createInterviewGraph(llm?: LLMProvider): CompiledGraph {
  const workflow = new StateGraph(InterviewStateAnnotation)
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
    .addEdge(START, "planning")
    .addEdge("planning", "interviewing")
    .addConditionalEdges("interviewing", (state: InterviewState) => {
      if (state.followupNeeded || state.interviewStatus === "followup") {
        return "followup";
      }
      if (state.interviewStatus === "analyzing" || isInterviewComplete(state)) {
        return "analyzing";
      }
      return END;
    })
    .addEdge("followup", END)
    .addEdge("analyzing", END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer }) as CompiledGraph;
}

export function getInterviewGraph(llm?: LLMProvider): CompiledGraph {
  if (!graphInstance) {
    graphInstance = createInterviewGraph(llm);
  }
  return graphInstance;
}

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

export function resetGraphInstance(): void {
  graphInstance = null;
}

export { createInitialState };
export { isInterviewComplete } from "./edges";
