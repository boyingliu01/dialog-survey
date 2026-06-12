import { PrismaClient } from '@prisma/client';
import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
import {
  parseStreamMessage,
  sendReply as sendReplyUnsafe,
  isAllowedWebhookUrl,
} from './stream-message-utils.js';
export type { StreamMessage, ParsedStreamMessage, ProcessResult } from './stream-message-utils.js';

const MAX_RETRIES = 3;

export class StreamMessageService {
  private repo: InterviewStateRepository;

  constructor(repo?: InterviewStateRepository) {
    this.repo = repo || new InterviewStateRepository();
  }

  parseStreamMessage = parseStreamMessage;

  async sendReply(sessionWebhook: string, content: string): Promise<boolean> {
    if (!isAllowedWebhookUrl(sessionWebhook)) {
      error('Webhook URL hostname not in allowlist', { url: sessionWebhook });
      return false;
    }
    return sendReplyUnsafe(sessionWebhook, content);
  }

  async processStreamMessage(
    message: { data: string; headers: { messageId: string } },
    retryCount = 0
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const parsed = parseStreamMessage(message as import('./stream-message-utils.js').StreamMessage);

    if (!parsed) {
      error('Message parse failed - invalid format', {
        data: message.data?.substring(0, 200),
      });
      return { success: false, error: 'Invalid message format' };
    }

    if (!parsed.userId || !parsed.content) {
      error('Message missing required fields', {
        userId: parsed.userId,
        content: parsed.content?.substring(0, 100),
      });
      return { success: false, error: 'Missing userId or content' };
    }

    info('Processing stream message', {
      userId: parsed.userId,
      content: parsed.content,
      messageId: parsed.messageId,
    });

    let state = await this.repo.findActiveInterview(parsed.userId);

    if (!state) {
      const templateId = await this.resolveDefaultTemplateId();
      const interviewId = await this.repo.createInterview(parsed.userId, templateId);
      state = {
        userId: parsed.userId,
        interviewId,
        templateId,
        status: 'PENDING',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };
    }

    state.pendingMessages.push({
      role: 'user',
      content: parsed.content,
      isVoice: false,
    });

    if (!state.userName) {
      const prisma = new PrismaClient();
      try {
        const interview = await prisma.interview.findFirst({
          where: { userId: parsed.userId },
          select: { planId: true },
        });
        if (interview?.planId) {
          const plan = await prisma.interviewPlan.findUnique({
            where: { id: interview.planId },
            select: { inviteeData: true },
          });
          if (plan?.inviteeData) {
            const invitees = plan.inviteeData as { userId: string; name?: string }[];
            const matched = invitees.find((inv) => inv.userId === parsed.userId);
            if (matched?.name) state.userName = matched.name;
          }
        }
      } catch {
        // Silently fail userName resolution
      } finally {
        await prisma.$disconnect();
      }
    }

    const graphResult: GraphResult = await runInterviewGraph(state, {
      userId: parsed.userId,
      content: parsed.content,
      isVoice: false,
    });

    const nextState = graphResult.nextState;
    const existingCount = state.responses.length;
    const newResponses = nextState.responses.slice(existingCount);
    if (newResponses.length > 0) {
      nextState.pendingResponses = newResponses;
    }
    nextState.pendingMessages.push({
      role: 'assistant',
      content: graphResult.response,
      isVoice: false,
    });

    try {
      await this.repo.saveFullState(state.interviewId as string, nextState);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
        info('Retrying due to version conflict', {
          userId: parsed.userId,
          retryCount: retryCount + 1,
        });
        const freshState = await this.repo.loadFullState(
          state.interviewId as string,
          parsed.userId
        );
        if (freshState) {
          freshState.pendingMessages = [{ role: 'user', content: parsed.content, isVoice: false }];
          const retryGraphResult = await runInterviewGraph(freshState, {
            userId: parsed.userId,
            content: parsed.content,
            isVoice: false,
          });
          const retryExistingCount = freshState.responses.length;
          const retryNewResponses = retryGraphResult.nextState.responses.slice(retryExistingCount);
          if (retryNewResponses.length > 0) {
            retryGraphResult.nextState.pendingResponses = retryNewResponses;
          }
          retryGraphResult.nextState.pendingMessages.push({
            role: 'assistant',
            content: retryGraphResult.response,
            isVoice: false,
          });
          return this.processStreamMessageWithState(
            message,
            retryGraphResult,
            freshState,
            retryCount + 1
          );
        }
      }
      return { success: false, error: errorMsg };
    }

    if (parsed.sessionWebhook) {
      await this.sendReply(parsed.sessionWebhook, graphResult.response);
    }

    return { success: true, response: graphResult.response };
  }

  private async processStreamMessageWithState(
    message: { data: string; headers: { messageId: string } },
    graphResult: GraphResult,
    state: InterviewState,
    retryCount: number
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const parsed = parseStreamMessage(message as import('./stream-message-utils.js').StreamMessage);
    if (!parsed) {
      return { success: false, error: 'Invalid message format' };
    }

    try {
      const existingCount = state.responses.length;
      const newResponses = graphResult.nextState.responses.slice(existingCount);
      if (newResponses.length > 0) {
        graphResult.nextState.pendingResponses = newResponses;
      }
      await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
        return this.processStreamMessage(message, retryCount + 1);
      }
      return { success: false, error: errorMsg };
    }

    if (parsed.sessionWebhook) {
      await this.sendReply(parsed.sessionWebhook, graphResult.response);
    }

    return { success: true, response: graphResult.response };
  }

  private async resolveDefaultTemplateId(): Promise<string> {
    const repo = new TemplateRepository();
    const templates = await repo.findAll();
    const published = templates.find((t) => t.status === 'PUBLISHED');
    if (published) return published.id;
    return templates.length > 0 ? templates[0].id : 'test-template';
  }
}

// Backwards-compatible exports
export { parseStreamMessage, sendReply, isAllowedWebhookUrl } from './stream-message-utils.js';

export async function processStreamMessage(
  message: import('./stream-message-utils.js').StreamMessage,
  prisma?: PrismaClient
): Promise<{ success: boolean; response?: string; error?: string }> {
  const repo = new InterviewStateRepository(prisma);
  const service = new StreamMessageService(repo);
  return service.processStreamMessage(message);
}
