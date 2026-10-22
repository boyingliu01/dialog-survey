import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import { DEFAULT_MAX_FOLLOWUPS, type InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import {
  type StreamMessage,
  isAllowedWebhookUrl,
  parseStreamMessage,
  sendReply as sendReplyUnsafe,
} from './stream-message-utils.js';
export type { StreamMessage, ParsedStreamMessage, ProcessResult } from './stream-message-utils.js';

const MAX_RETRIES = 3;
const DEDUP_CACHE_SIZE = 1000;

/**
 * Read a positive integer setting, falling back when it is absent, unparsable,
 * or non-positive.
 *
 * Three call sites repeated the same `parseInt` + `isNaN` + `<= 0` dance with
 * their own default; centralising it keeps the fallback rule in one place.
 */
function positiveEnvInt(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isNaN(raw) || raw <= 0 ? fallback : raw;
}

/**
 * Queue the graph's assistant reply and the responses it produced onto the next
 * state, leaving the status for the caller to decide.
 *
 * Shared by the first attempt and the version-conflict retry so the two paths
 * cannot drift: before this helper they each duplicated the same four steps, and
 * the retry copy had already drifted once.
 */
function stageAssistantReply(state: InterviewState, graphResult: GraphResult): InterviewState {
  const nextState = graphResult.nextState;
  const newResponses = nextState.responses.slice(state.responses.length);
  if (newResponses.length > 0) {
    nextState.pendingResponses = newResponses;
  }
  nextState.pendingMessages.push({
    role: 'assistant',
    content: graphResult.response,
  });
  return nextState;
}

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
      this.processMessageInternal(
        parsed as ReturnType<typeof parseStreamMessage> & {
          userId: string;
          content: string;
          messageId?: string;
          sessionWebhook?: string;
        },
        message,
        retryCount,
        prisma
      )
    );
  }

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.userLocks.get(userId) ?? Promise.resolve();

    let release: (() => void) | undefined;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });

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
      const cooldown = await this.checkRestartCooldown(parsed);
      if (cooldown) return cooldown;
      state = await this.startInterview(parsed.userId, prisma);
    }

    state.pendingMessages.push({
      role: 'user',
      content: parsed.content,
    });

    await this.resolveUserName(state, parsed.userId, prisma);

    this.checkTimeoutNudge(state, parsed);

    // Detect silent recovery: previous processing was interrupted
    if (state.status === 'PROCESSING') {
      info('Silent resume from interrupted processing', {
        userId: parsed.userId,
        interviewId: state.interviewId,
      });
    }

    // Two-phase persistence: save PROCESSING before LLM call, then ACTIVE after
    state.status = 'PROCESSING';
    try {
      await this.repo.saveFullState(state.interviewId as string, state);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      error('Failed to persist user message before LLM call', {
        userId: parsed.userId,
        error: errMsg,
      });
      return { success: false, error: errMsg };
    }

    const graphResult: GraphResult = await runInterviewGraph(
      state,
      {
        userId: parsed.userId,
        content: parsed.content,
      },
      prisma
    );

    info('[DIAG] runInterviewGraph returned', {
      userId: parsed.userId,
      responsePreview: graphResult.response.substring(0, 60),
      nextStateStatus: graphResult.nextState.status,
      nextStateShouldContinue: (graphResult.nextState as unknown as Record<string, unknown>)[
        'shouldContinue'
      ],
      nextStateCurrentQ: graphResult.nextState.currentQuestion,
    });

    const nextState = stageAssistantReply(state, graphResult);
    // Preserve COMPLETED status from graph (don't overwrite when interview ends)
    if (nextState.status === 'COMPLETED') {
      info('[DIAG] COMPLETED status preserved', { userId: parsed.userId });
    } else {
      nextState.status = 'ACTIVE';
    }

    try {
      await this.repo.saveFullState(state.interviewId as string, nextState);
      info('[DIAG] saveFullState succeeded', {
        userId: parsed.userId,
        savedStatus: nextState.status,
        newVersion: nextState.version,
      });
    } catch (err) {
      return this.recoverFromPersistFailure(err, { state, parsed, message }, prisma, retryCount);
    }

    return this.finishWithReply(parsed.sessionWebhook, graphResult.response);
  }

  /**
   * A finished interview stays closed for a cooldown window so a stray inbound
   * message cannot silently restart the dialog.
   *
   * Returns the reply payload when the cooldown blocked the restart, or null when
   * the user is free to start a new interview.
   */
  private async checkRestartCooldown(parsed: {
    userId: string;
    sessionWebhook?: string;
  }): Promise<{ success: boolean; response?: string; error?: string } | null> {
    // Check for recently completed interview to prevent infinite restart
    const completed = await this.repo.findCompletedInterview(parsed.userId);
    if (!completed) return null;

    const cooldownMs = positiveEnvInt('INTERVIEW_COOLDOWN_MINUTES', 30) * 60 * 1000;
    const elapsed = Date.now() - completed.completedAt.getTime();
    if (elapsed >= cooldownMs) return null;

    const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
    const cooldownMsg = `您的访谈已经完成，感谢您的参与！如需再次访谈，请等待约 ${remainingMin} 分钟后重试。`;
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

  /** Create a fresh PENDING interview state for a user with no active one. */
  private async startInterview(userId: string, prisma?: PrismaClient): Promise<InterviewState> {
    const templateId = await this.resolveDefaultTemplateId(prisma);
    const interviewId = await this.repo.createInterview(userId, templateId);
    return {
      userId,
      interviewId,
      templateId,
      status: 'PENDING',
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: DEFAULT_MAX_FOLLOWUPS,
      nudgeCount: 0,
      responses: [],
      reportGenerated: false,
      version: 1,
      originalVersion: 1,
      pendingMessages: [],
      pendingResponses: [],
    };
  }

  /**
   * Backfill `state.userName` from the plan's invitee data when it is still
   * empty. Best-effort: a lookup failure must never abort the conversation, so
   * the error is swallowed deliberately.
   */
  private async resolveUserName(
    state: InterviewState,
    userId: string,
    prisma?: PrismaClient
  ): Promise<void> {
    if (state.userName || !prisma) return;
    try {
      const interview = await prisma.interview.findFirst({
        where: { userId },
        select: { planId: true },
      });
      if (!interview?.planId) return;
      const plan = await prisma.interviewPlan.findUnique({
        where: { id: interview.planId },
        select: { inviteeData: true },
      });
      if (!plan?.inviteeData) return;
      const invitees = plan.inviteeData as { userId: string; name?: string }[];
      const matched = invitees.find((inv) => inv.userId === userId);
      if (matched?.name) state.userName = matched.name;
    } catch {
      // Silently fail userName resolution
    }
  }

  /**
   * Handle a failed `saveFullState` after the graph ran: retry once on a version
   * conflict, log a dead-letter warning when retries are exhausted, and report
   * the failure.
   */
  private async recoverFromPersistFailure(
    err: unknown,
    request: {
      state: InterviewState;
      parsed: { userId: string; content: string; sessionWebhook?: string };
      message: { data: string; headers: { messageId: string } };
    },
    prisma: PrismaClient | undefined,
    retryCount: number
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const { state, parsed, message } = request;
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
      info('Retrying due to version conflict', {
        userId: parsed.userId,
        retryCount: retryCount + 1,
      });
      const freshState = await this.repo.loadFullState(state.interviewId as string, parsed.userId);
      if (freshState) {
        freshState.pendingMessages = [{ role: 'user', content: parsed.content }];
        const retryGraphResult = await runInterviewGraph(
          freshState,
          { userId: parsed.userId, content: parsed.content },
          prisma
        );
        stageAssistantReply(freshState, retryGraphResult);
        if (retryGraphResult.nextState.status !== 'COMPLETED') {
          retryGraphResult.nextState.status = 'ACTIVE';
        }
        return this.processStreamMessageWithState(
          message,
          retryGraphResult,
          freshState,
          retryCount + 1,
          prisma
        );
      }
    }

    if (retryCount >= MAX_RETRIES) {
      error('Persistence retries exhausted - pending data may be lost', {
        userId: parsed.userId,
        interviewId: state.interviewId,
      });
    }

    return { success: false, error: errorMsg };
  }

  private async processStreamMessageWithState(
    message: { data: string; headers: { messageId: string } },
    graphResult: GraphResult,
    state: InterviewState,
    retryCount: number,
    prisma?: PrismaClient
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const parsed = parseStreamMessage(message as StreamMessage);
    if (!parsed) {
      return { success: false, error: 'Invalid message format' };
    }

    try {
      await this.repo.saveFullState(state.interviewId as string, graphResult.nextState);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      if (errorMsg.includes('Version conflict') && retryCount < MAX_RETRIES) {
        // Re-enter the internal path, not processStreamMessage: the public entry
        // point would hit the dedup cache, which already holds this messageId
        // because the first attempt registered it. Routing the retry through it
        // made every version-conflict retry return "Duplicate message" instead
        // of actually retrying, so MAX_RETRIES was unreachable in practice.
        return this.processMessageInternal(
          parsed as {
            userId: string;
            content: string;
            messageId?: string;
            sessionWebhook?: string;
          },
          message,
          retryCount + 1,
          prisma
        );
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

    return this.finishWithReply(parsed.sessionWebhook, graphResult.response);
  }

  /**
   * Deliver the graph's reply (when the message carried a session webhook) and
   * report success. Shared by the first attempt and the version-conflict retry
   * path so both return the same shape.
   */
  private async finishWithReply(
    sessionWebhook: string | undefined,
    response: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    if (sessionWebhook) {
      await this.sendReply(sessionWebhook, response);
    }
    return { success: true, response };
  }

  private checkTimeoutNudge(
    state: InterviewState,
    parsed: { userId: string; content: string; sessionWebhook?: string }
  ): void {
    const statuses = ['ACTIVE', 'WAITING'] as string[];
    if (!statuses.includes(state.status)) return;

    const lastBotMsg = [...state.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastBotMsg?.timestamp) return;

    const timeoutMs = positiveEnvInt('INTERVIEW_TIMEOUT_HOURS', 1) * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(lastBotMsg.timestamp).getTime();
    if (elapsed < timeoutMs) return;

    if (state.nudgeCount >= positiveEnvInt('INTERVIEW_TIMEOUT_MAX_NUDGES', 3)) {
      info('Max nudges exceeded, will skip to next question', {
        userId: parsed.userId,
        nudgeCount: state.nudgeCount,
        currentQuestion: state.currentQuestion,
      });
      return;
    }

    const nudgeMsg = '您好，距离上次回复已过去较长时间。您的访谈还在进行中，请继续回答。';
    if (parsed.sessionWebhook) {
      this.sendReply(parsed.sessionWebhook, nudgeMsg).catch(() => {});
    }

    state.nudgeCount++;
    info('Timeout nudge sent', {
      userId: parsed.userId,
      nudgeCount: state.nudgeCount,
      elapsedHours: Math.round(elapsed / (60 * 60 * 1000)),
    });
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
  message: StreamMessage,
  prisma: PrismaClient
): Promise<{ success: boolean; response?: string; error?: string }> {
  const repo = new InterviewStateRepository(prisma);
  const service = new StreamMessageService(repo);
  return service.processStreamMessage(message, 0, prisma);
}
