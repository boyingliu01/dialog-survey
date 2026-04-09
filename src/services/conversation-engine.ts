import { runInterviewGraph } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';

export interface ProcessMessageInput {
  userId: string;
  content: string;
  isVoice?: boolean;
}

export interface ProcessMessageOutput {
  success: boolean;
  response?: string;
  error?: string;
}

export class ConversationEngine {
  async processMessage(input: ProcessMessageInput): Promise<ProcessMessageOutput> {
    const { userId, content, isVoice } = input;

    info('Processing message', {
      userId,
      isVoice,
      contentLength: content.length,
    });

    try {
      const state = await this.loadOrCreateState(userId);

      const result = await runInterviewGraph(state, {
        userId,
        content,
        isVoice: isVoice || false,
      });

      if (result.response) {
        await this.saveResponse(userId, result.response);
      }

      return { success: true, response: result.response };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      error('Conversation processing failed', { error: errMsg, userId });
      return { success: false, error: errMsg };
    }
  }

  private async loadOrCreateState(userId: string): Promise<InterviewState> {
    return {
      userId,
      status: 'PENDING',
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: 2,
      responses: [],
      reportGenerated: false,
    };
  }

  private async saveResponse(userId: string, response: string) {
    info('Saving response', { userId, responseLength: response.length });
  }
}
