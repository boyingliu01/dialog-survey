import { PrismaClient } from '@prisma/client';
import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import type { InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
import {
  isAllowedWebhookUrl,
  parseStreamMessage,
  sendReply as sendReplyUnsafe,
} from './stream-message-utils.js';
export type { StreamMessage, ParsedStreamMessage, ProcessResult } from './stream-message-utils.js';

const MAX_RETRIES = 3;
const DEDUP_CACHE_SIZE = 1000;

export class StreamMessageService {
  private repo: InterviewStateRepository;
  private userLocks = new Map<string, Promise<void>>();
  private dedupCache = new Map<string, number>();

  constructor(repo: InterviewStateRepository) {
    this.repo = repo;
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
    retryCount = 0,
    prisma?: PrismaClient
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

    // H-4: Empty content guard (also handled in graph.ts)
    if (!parsed.content.trim()) {
      info('Skipping empty message', { userId: parsed.userId });
      return { success: false, error: 'Empty message content' };
    }

    // H-1: Message dedup via LRU cache
    if (parsed.messageId) {
      const cached = this.dedupCache.get(parsed.messageId);
      if (cached) {
        info('Skipping duplicate message', { messageId: parsed.messageId });
        return { success: false, error: 'Duplicate message' };
      }
      this.dedupCache.set(parsed.messageId, Date.now());
      // Evict oldest entries when cache exceeds limit
      if (this.dedupCache.size > DEDUP_CACHE_SIZE) {
        const oldest = [...this.dedupCache.entries()].sort((a, b) => a[1] - b[1])[0];
        if (oldest) this.dedupCache.delete(oldest[0]);
      }
    }

    // H-6: Per-user mutex to serialize concurrent messages
    return this.withUserLock(parsed.userId, () =>
      this.processMessageInternal(parsed as ReturnType<typeof parseStreamMessage> & { userId: string; content: string; messageId?: string; sessionWebhook?: string }, message, retryCount, prisma)
    );
  }

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.userLocks.get(userId) ?? Promise.resolve();

    let release: (() => void) | undefined;
    const lock = new Promise<void>((resolve) => { release = resolve; });

    const current = previous.then(async () => {
      try {
        return await fn();
      } finally {
        release?.();
      }
    });

    this.userLocks.set(userId, lock);
    return current;
  }

  private async processMessageInternal(
    parsed: { userId: string; content: string; messageId?: string; sessionWebhook?: string },
    message: { data: string; headers: { messageId: string } },
    retryCount: number,
    prisma?: PrismaClient
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    let state = await this.repo.findActiveInterview(parsed.userId);

    if (!state) {
      // Check for recently completed interview to prevent infinite restart
      const completed = await this.repo.findCompletedInterview(parsed.userId);
      if (completed) {
        const cooldownMinutes = Number.parseInt(process.env['INTERVIEW_COOLDOWN_MINUTES'] || '30', 10);
        const effectiveCooldown = Number.isNaN(cooldownMinutes) || cooldownMinutes <= 0 ? 30 : cooldownMinutes;
        const cooldownMs = effectiveCooldown * 60 * 1000;
        const elapsed = Date.now() - completed.completedAt.getTime();
        if (elapsed < cooldownMs) {
          const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
          const cooldownMsg = `您的上一次访谈刚刚结束，请等待约 ${remainingMin} 分钟后再开始新的访谈。`;
          if (parsed.sessionWebhook) {
            await this.sendReply(parsed.sessionWebhook, cooldownMsg);
          }
          info('Cooldown active — blocked interview restart', {
            userId: parsed.userId,
            completedAt: completed.completedAt,
            remainingMinutes: remainingMin,
          });
          return { success: true, response: cooldownMsg };
        }
      }

      const templateId = await this.resolveDefaultTemplateId(prisma);
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

    if (!state.userName && prisma) {
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
      }
    }

    // Timeout check: if user hasn't responded in a while, send a nudge reminder
    const timeoutResult = this.checkTimeoutNudge(state, parsed);
    if (timeoutResult) return timeoutResult;

    const graphResult: GraphResult = await runInterviewGraph(
      state,
      {
        userId: parsed.userId,
        content: parsed.content,
        isVoice: false,
      },
      prisma
    );

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
          const retryGraphResult = await runInterviewGraph(
            freshState,
            {
              userId: parsed.userId,
              content: parsed.content,
              isVoice: false,
            },
            prisma
          );
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

      // H-5: Dead letter queue for pending data on retry exhaustion
      if (retryCount >= MAX_RETRIES) {
        error('Persistence retries exhausted - pending data may be lost', {
          userId: parsed.userId,
          interviewId: state.interviewId,
          pendingMessagesCount: nextState.pendingMessages.length,
          pendingResponsesCount: nextState.pendingResponses.length,
        });
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

      // H-5: Dead letter logging on retry exhaustion
      if (retryCount >= MAX_RETRIES) {
        error('Persistence retries exhausted in retry path', {
          interviewId: state.interviewId,
          pendingMessagesCount: graphResult.nextState.pendingMessages.length,
          pendingResponsesCount: graphResult.nextState.pendingResponses.length,
        });
      }

      return { success: false, error: errorMsg };
    }

    if (parsed.sessionWebhook) {
      await this.sendReply(parsed.sessionWebhook, graphResult.response);
    }

    return { success: true, response: graphResult.response };
  }

  private checkTimeoutNudge(
    state: InterviewState,
    parsed: { userId: string; content: string; sessionWebhook?: string }
  ): Promise<{ success: boolean; response: string }> | null {
    if (state.status !== 'ACTIVE') return null;

    const lastBotMsg = [...state.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastBotMsg?.timestamp) return null;

    const timeoutHours = Number.parseInt(process.env['INTERVIEW_TIMEOUT_HOURS'] || '1', 10);
    const effectiveTimeout = Number.isNaN(timeoutHours) || timeoutHours <= 0 ? 1 : timeoutHours;
    const timeoutMs = effectiveTimeout * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(lastBotMsg.timestamp).getTime();

    if (elapsed >= timeoutMs) {
      const nudgeCount = (state as any).nudgeCount ?? 0;
      const maxNudges = Number.parseInt(process.env['INTERVIEW_TIMEOUT_MAX_NUDGES'] || '3', 10);
      const effectiveMaxNudges = Number.isNaN(maxNudges) || maxNudges <= 0 ? 3 : maxNudges;

      if (nudgeCount < effectiveMaxNudges) {
        const nudgeMsg = '您好，距离上次回复已过去较长时间。您的访谈还在进行中，请继续回答。';
        if (parsed.sessionWebhook) {
          this.sendReply(parsed.sessionWebhook, nudgeMsg).catch(() => {});
        }
        info('Timeout nudge sent', {
          userId: parsed.userId,
          nudgeCount: nudgeCount + 1,
          elapsedHours: Math.round(elapsed / (60 * 60 * 1000)),
        });
        return Promise.resolve({ success: true, response: nudgeMsg });
      }

      // Max nudges exceeded — skip to next question
      info('Max nudges exceeded, skipping question', {
        userId: parsed.userId,
        nudgeCount,
        currentQuestion: state.currentQuestion,
      });
    }

    return null;
  }

  private async resolveDefaultTemplateId(prisma?: PrismaClient): Promise<string> {
    if (!prisma) {
      return 'test-template';
    }
    const repo = new TemplateRepository(prisma);
    const templates = await repo.findAll();
    const published = templates.find((t) => t.status === 'PUBLISHED');
    if (published) return published.id;
    return templates.length > 0 ? templates[0].id : 'test-template';
  }
}

export { parseStreamMessage, sendReply, isAllowedWebhookUrl } from './stream-message-utils.js';

export async function processStreamMessage(
  message: import('./stream-message-utils.js').StreamMessage,
  prisma: PrismaClient
): Promise<{ success: boolean; response?: string; error?: string }> {
  const repo = new InterviewStateRepository(prisma);
  const service = new StreamMessageService(repo);
  return service.processStreamMessage(message, 0, prisma);
}
