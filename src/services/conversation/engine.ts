import { runInterviewTurn, resumeInterview } from "../../core/graph";
import { getDashScopeProvider, type DashScopeConfig } from "../llm";
import { InterviewRepository } from "../../repositories/interview";
import type { InterviewTemplate } from "../../core/types";
import type { InterviewState } from "../../core/state";

/**
 * Conversation Engine configuration
 */
export interface ConversationEngineConfig {
  llmConfig?: DashScopeConfig;
  useLlm?: boolean;
}

/**
 * Conversation Engine
 * Orchestrates the interview flow between webhook and LangGraph
 */
export class ConversationEngine {
  private useLlm: boolean;
  private llmConfig?: DashScopeConfig;

  constructor(config: ConversationEngineConfig = {}) {
    this.useLlm = config.useLlm ?? false;
    this.llmConfig = config.llmConfig;
  }

  /**
   * Process an incoming user message
   * @returns The assistant's response
   */
  async processMessage(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
    userMessage: string,
  ): Promise<string> {
    // Initialize LLM provider if enabled
    if (this.useLlm && this.llmConfig) {
      try {
        getDashScopeProvider(this.llmConfig);
      } catch {
        // Provider already initialized or will use mock
      }
    }

    // Check for existing interview
    // TODO: Race condition risk - concurrent messages from same session could cause lost updates
    // Consider adding Prisma transaction with optimistic locking or unique constraint retry
    const existingInterview =
      await InterviewRepository.findBySessionId(sessionId);

    let result: InterviewState;

    if (existingInterview) {
      // Resume existing conversation
      const currentState = this.deserializeState(existingInterview);
      result = await resumeInterview(
        sessionId,
        currentState,
        userMessage,
        this.useLlm ? getDashScopeProvider() : undefined,
      );
    } else {
      // Start new conversation
      result = await runInterviewTurn(
        sessionId,
        templateId,
        template,
        userMessage,
        this.useLlm ? getDashScopeProvider() : undefined,
      );
    }

    // Save updated state to database
    await this.saveState(sessionId, userId, templateId, result);

    // Return assistant's last message
    const lastAssistantMessage = result.conversationHistory
      .filter((m) => m.role === "assistant")
      .pop();

    return lastAssistantMessage?.content ?? "感谢您的回复。";
  }

  /**
   * Start a new interview session
   */
  async startInterview(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
  ): Promise<string> {
    // Initialize LLM if enabled
    if (this.useLlm && this.llmConfig) {
      try {
        getDashScopeProvider(this.llmConfig);
      } catch {
        // Already initialized
      }
    }

    // Run planning turn
    const result = await runInterviewTurn(
      sessionId,
      templateId,
      template,
      null, // No user message for first turn
      this.useLlm ? getDashScopeProvider() : undefined,
    );

    // Save state
    await this.saveState(sessionId, userId, templateId, result);

    // Return greeting
    const lastAssistantMessage = result.conversationHistory
      .filter((m) => m.role === "assistant")
      .pop();

    return lastAssistantMessage?.content ?? "欢迎参加访谈！";
  }

  /**
   * Deserialize database record to InterviewState
   */
  private deserializeState(interview: {
    sessionId: string;
    templateId: string;
    conversationHistory: unknown;
    extractedInfo: unknown;
    createdAt: Date;
    template?: InterviewTemplate;
  }): InterviewState {
    const history =
      (interview.conversationHistory as {
        template?: InterviewTemplate;
        messages?: Array<{
          role: "user" | "assistant" | "system";
          content: string;
        }>;
        currentTopicIndex?: number;
        currentQuestionIndex?: number;
        completedTopics?: string[];
      }) ?? {};

    const info =
      (interview.extractedInfo as {
        answers?: Record<string, string>;
      }) ?? {};

    return {
      sessionId: interview.sessionId,
      templateId: interview.templateId,
      template: history.template ?? {
        id: "",
        name: "",
        topics: [],
        questions: [],
      },
      conversationHistory: history.messages ?? [],
      currentTopicIndex: history.currentTopicIndex ?? 0,
      currentQuestionIndex: history.currentQuestionIndex ?? 0,
      answers: info.answers ?? {},
      completedTopics: history.completedTopics ?? [],
      interviewStatus: "interviewing",
      followupNeeded: false,
      followupQuestion: undefined,
      startTime: interview.createdAt,
      endTime: undefined,
      report: undefined,
      error: undefined,
    };
  }

  /**
   * Save state to database
   */
  private async saveState(
    sessionId: string,
    userId: string,
    templateId: string,
    state: InterviewState,
  ): Promise<void> {
    const existingInterview =
      await InterviewRepository.findBySessionId(sessionId);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const conversationHistory = JSON.parse(
      JSON.stringify({
        template: state.template,
        messages: state.conversationHistory,
        currentTopicIndex: state.currentTopicIndex,
        currentQuestionIndex: state.currentQuestionIndex,
        completedTopics: state.completedTopics,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const extractedInfo = JSON.parse(
      JSON.stringify({
        answers: state.answers,
      }),
    );

    if (existingInterview) {
      await InterviewRepository.update(existingInterview.id, {
        conversationHistory: conversationHistory as unknown as never,
        extractedInfo: extractedInfo as unknown as never,
        status:
          state.interviewStatus === "completed" ? "COMPLETED" : "IN_PROGRESS",
        report: state.report,
      });
    } else {
      await InterviewRepository.create({
        sessionId,
        userId,
        templateId,
        topic: state.template.name ?? "Interview",
        conversationHistory: conversationHistory as unknown as never,
        extractedInfo: extractedInfo as unknown as never,
      });
    }
  }
}

// Singleton instance
let engineInstance: ConversationEngine | null = null;

/**
 * Get or create conversation engine instance
 */
export function getConversationEngine(
  config?: ConversationEngineConfig,
): ConversationEngine {
  if (!engineInstance) {
    engineInstance = new ConversationEngine(config);
  }
  return engineInstance;
}

/**
 * Initialize conversation engine
 */
export function initializeConversationEngine(
  config: ConversationEngineConfig,
): ConversationEngine {
  engineInstance = new ConversationEngine(config);
  return engineInstance;
}

/**
 * Reset engine instance (for testing)
 */
export function resetConversationEngine(): void {
  engineInstance = null;
}
