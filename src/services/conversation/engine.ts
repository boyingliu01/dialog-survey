import { runInterviewTurn, resumeInterview } from "../../core/graph";
import { getDashScopeProvider, type DashScopeConfig } from "../llm";
import {
  InterviewRepository,
  OptimisticLockError,
} from "../../repositories/interview";
import type { InterviewTemplate } from "../../core/types";
import type { InterviewState } from "../../core/state";

export interface ConversationEngineConfig {
  llmConfig?: DashScopeConfig;
  useLlm?: boolean;
  maxRetries?: number;
}

export class ConversationEngine {
  private useLlm: boolean;
  private llmConfig?: DashScopeConfig;
  private maxRetries: number;

  constructor(config: ConversationEngineConfig = {}) {
    this.useLlm = config.useLlm ?? false;
    this.llmConfig = config.llmConfig;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async processMessage(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
    userMessage: string,
  ): Promise<string> {
    if (this.useLlm && this.llmConfig) {
      try {
        getDashScopeProvider(this.llmConfig);
      } catch {
        // Provider already initialized or will use mock
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.processMessageWithTransaction(
          sessionId,
          userId,
          templateId,
          template,
          userMessage,
        );
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          lastError = error;
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          );
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error("Failed to process message after retries");
  }

  private async processMessageWithTransaction(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
    userMessage: string,
  ): Promise<string> {
    return InterviewRepository.withTransaction(async () => {
      const existingInterview =
        await InterviewRepository.findBySessionId(sessionId);

      let result: InterviewState;

      if (existingInterview) {
        const currentState = this.deserializeState(existingInterview);
        result = await resumeInterview(
          sessionId,
          currentState,
          userMessage,
          this.useLlm ? getDashScopeProvider() : undefined,
        );
      } else {
        result = await runInterviewTurn(
          sessionId,
          templateId,
          template,
          userMessage,
          this.useLlm ? getDashScopeProvider() : undefined,
        );
      }

      await this.saveState(
        sessionId,
        userId,
        templateId,
        result,
        existingInterview,
      );

      const lastAssistantMessage = result.conversationHistory
        .filter((m) => m.role === "assistant")
        .pop();

      return lastAssistantMessage?.content ?? "感谢您的回复。";
    });
  }

  async startInterview(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
  ): Promise<string> {
    if (this.useLlm && this.llmConfig) {
      try {
        getDashScopeProvider(this.llmConfig);
      } catch {
        // Already initialized
      }
    }

    const result = await runInterviewTurn(
      sessionId,
      templateId,
      template,
      null,
      this.useLlm ? getDashScopeProvider() : undefined,
    );

    await this.saveState(sessionId, userId, templateId, result, null);

    const lastAssistantMessage = result.conversationHistory
      .filter((m) => m.role === "assistant")
      .pop();

    return lastAssistantMessage?.content ?? "欢迎参加访谈！";
  }

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

  private async saveState(
    sessionId: string,
    userId: string,
    templateId: string,
    state: InterviewState,
    existingInterview: { id: string; version: number } | null,
  ): Promise<void> {
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
      await InterviewRepository.updateWithVersion(existingInterview.id, {
        version: existingInterview.version,
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
