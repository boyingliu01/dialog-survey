import { runInterviewGraph } from '../core/graph.js';
import type { GraphResult } from '../core/graph.js';
import { DEFAULT_MAX_FOLLOWUPS, type InterviewState } from '../core/types/index.js';
import { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import { START_SIGNAL_REPLY, isStartSignal } from './start-signal.js';
import {
  type ParsedStreamMessage,
  type ProcessResult,
  type StreamMessage,
  isAllowedWebhookUrl,
  parseStreamMessage,
  sendReply as sendReplyUnsafe,
} from './stream-message-utils.js';
export type { StreamMessage, ParsedStreamMessage, ProcessResult } from './stream-message-utils.js';

const MAX_RETRIES = 3;
const DEDUP_CACHE_SIZE = 1000;

/**
 * Log how much pending data a lost turn takes with it, once retries are exhausted.
 *
 * Only the counts are logged, never the content: this is the dead-letter signal that
 * the user lost a turn, and it must not become a copy of the conversation.
 */
function reportExhaustedRetries(
  retryCount: number,
  userId: string,
  interviewId: string | undefined
): void {
  if (retryCount < MAX_RETRIES) return;
  error('Persistence retries exhausted - pending data may be lost', { userId, interviewId });
}

/**
 * Milliseconds since the last assistant prompt, or null when a nudge cannot apply.
 *
 * Two conditions make a nudge meaningless and both return null: the interview must be
 * in a state where the user owes a reply (ACTIVE/WAITING -- nudging a COMPLETED
 * interview would reopen it), and there must be a timestamped bot message to measure
 * from.
 */
function idleSinceLastPrompt(state: InterviewState): number | null {
  if (state.status !== 'ACTIVE' && state.status !== 'WAITING') return null;
  const lastBotMsg = [...state.messages].reverse().find((m) => m.role === 'assistant');
  if (!lastBotMsg?.timestamp) return null;
  return Date.now() - new Date(lastBotMsg.timestamp).getTime();
}

/**
 * Whether a persistence error is an optimistic-lock conflict.
 *
 * Matched on the message because the repository raises it as a plain Error; a
 * conflict is the ONE failure worth retrying, since the data is intact and only this
 * copy is stale.
 */
function isVersionConflict(errorMsg: string): boolean {
  return errorMsg.includes('Version conflict');
}

/**
 * The invitee's display name from the plan they belong to, if any.
 *
 * Two lookups because the name lives on the PLAN's `inviteeData`, not on the
 * interview: the interview only records which plan to ask. Every missing step
 * returns undefined rather than throwing -- the caller treats a name as a nicety.
 */
async function lookupInviteeName(
  prisma: PrismaClient,
  userId: string
): Promise<string | undefined> {
  const interview = await prisma.interview.findFirst({
    where: { userId },
    select: { planId: true },
  });
  if (!interview?.planId) return undefined;

  const plan = await prisma.interviewPlan.findUnique({
    where: { id: interview.planId },
    select: { inviteeData: true },
  });
  if (!plan?.inviteeData) return undefined;

  const invitees = plan.inviteeData as { userId: string; name?: string }[];
  return invitees.find((invitee) => invitee.userId === userId)?.name;
}

/**
 * Why a parsed message cannot be answered, or null when it can.
 *
 * Split from the parse itself because these three checks all mean "this delivery
 * carries no usable turn" while looking at different things: a missing field, and a
 * body that is only whitespace. That last one parses fine but would send the LLM an
 * empty question, so it needs its own guard (H-4, also enforced in graph.ts).
 */
function unusableMessage(parsed: ParsedStreamMessage): { success: false; error: string } | null {
  if (!parsed.userId || !parsed.content) {
    error('Message missing required fields', {
      userId: parsed.userId,
      content: parsed.content?.substring(0, 100),
    });
    return { success: false, error: 'Missing userId or content' };
  }
  if (parsed.content.trim()) return null;
  info('Skipping empty message', { userId: parsed.userId });
  return { success: false, error: 'Empty message content' };
}

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
    const accepted = this.acceptMessage(message);
    if ('error' in accepted) return accepted;
    const { parsed } = accepted;

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

  /**
   * Parse and gate an inbound message, returning it or the refusal to answer with.
   *
   * Every rejection here is silent from the user's side on purpose: a duplicate
   * delivery and an empty body both arrive because DingTalk retried, and replying
   * "invalid message" would make a retry look like a broken bot. The distinction is
   * carried in `error` for the caller and the log, not for the user.
   */
  private acceptMessage(message: { data: string; headers: { messageId: string } }):
    | { parsed: ParsedStreamMessage }
    | { success: false; error: string } {
    const parsed = parseStreamMessage(message as import('./stream-message-utils.js').StreamMessage);
    if (!parsed) {
      error('Message parse failed - invalid format', {
        data: message.data?.substring(0, 200),
      });
      return { success: false, error: 'Invalid message format' };
    }

    const unusable = unusableMessage(parsed);
    if (unusable) return unusable;

    if (this.rememberMessageId(parsed.messageId)) {
      return { success: false, error: 'Duplicate message' };
    }
    return { parsed };
  }

  /**
   * Record a message id for dedup, reporting whether it was already seen.
   *
   * Returns false for a message with NO id: without one there is nothing to compare,
   * and treating "no id" as "already seen" would drop every such message.
   */
  private rememberMessageId(messageId: string | undefined): boolean {
    if (!messageId) return false;
    if (this.dedupCache.has(messageId)) {
      info('Skipping duplicate message', { messageId });
      return true;
    }

    this.dedupCache.set(messageId, Date.now());
    this.evictOldestDedupEntry();
    return false;
  }

  /** Keep the dedup cache bounded by dropping the least recently seen id. */
  private evictOldestDedupEntry(): void {
    if (this.dedupCache.size <= DEDUP_CACHE_SIZE) return;
    const oldest = [...this.dedupCache.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) this.dedupCache.delete(oldest[0]);
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

  /**
   * The two refusals that must happen before any turn work starts.
   *
   * Returns the reply to send when the turn must not proceed, or null to continue.
   * Ordered: a start signal is acknowledged BEFORE the PROCESSING pre-write, because
   * acknowledging it must not flip the state nor reach the graph (#231); the pre-write
   * itself then aborts the turn if persistence is unavailable.
   */
  private async rejectBeforeTurn(
    state: InterviewState,
    parsed: { userId: string; content: string; sessionWebhook?: string },
    wasPending: boolean
  ): Promise<ProcessResult | null> {
    const acknowledged = await this.acknowledgeStartSignal(state, parsed, wasPending);
    if (acknowledged) return acknowledged;
    return this.markProcessing(state, parsed.userId);
  }

  /**
   * Answer a bare start signal without recording it as an answer (#231).
   *
   * Templates close their invitation with "准备好了直接回复任意消息，我们就开始", so the
   * system explicitly invites a message that must not be stored — yet everything the
   * interviewee sent became a `Response` and advanced the pointer. In the measured
   * interview the greeting was followed by "开始", a role clarification, then "开始"
   * again: q0 was stored as the literal string "开始", so two of 14 slots held no data.
   *
   * Returns the reply when the turn was a start signal, or null to let the caller
   * process it as an answer. Only a NON-first turn qualifies: on a first turn the
   * message is what triggers the greeting, and the graph still has to run planningNode
   * to produce it.
   */
  private async acknowledgeStartSignal(
    state: InterviewState,
    parsed: { userId: string; content: string; sessionWebhook?: string },
    wasPending: boolean
  ): Promise<ProcessResult | null> {
    if (wasPending || state.status !== 'ACTIVE') return null;
    if (!isStartSignal(parsed.content)) return null;

    info('Start signal acknowledged without consuming a question', {
      userId: parsed.userId,
      interviewId: state.interviewId,
      currentQuestion: state.currentQuestion,
      content: parsed.content,
    });
    return this.finishWithReply(parsed.sessionWebhook, START_SIGNAL_REPLY);
  }

  private async processMessageInternal(
    parsed: { userId: string; content: string; messageId?: string; sessionWebhook?: string },
    message: { data: string; headers: { messageId: string } },
    retryCount: number,
    prisma?: PrismaClient
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    const opened = await this.openTurnState(parsed, prisma);
    if ('refusal' in opened) return opened.refusal;
    const { state, wasPending } = opened;

    const rejection = await this.rejectBeforeTurn(state, parsed, wasPending);
    if (rejection) return rejection;
    const graphResult: GraphResult = await runInterviewGraph(
      state,
      {
        userId: parsed.userId,
        content: parsed.content,
      },
      prisma,
      { firstTurn: wasPending }
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
   * Find the interview this message belongs to, or open a new one.
   *
   * Returns the state plus whether the turn is a FIRST turn, which has to be
   * captured here rather than after the two-phase write below: the graph runs
   * planningNode and sends a greeting on a first turn, and deriving that from the
   * status once it has been flipped to PROCESSING made planningNode unreachable --
   * the opening message was recorded as the answer to q1 and the greeting never
   * rendered.
   *
   * A PROCESSING status on entry means the previous turn was interrupted, so the
   * user is RESUMING, not starting, and it must not be treated as a first turn.
   */
  private async openTurnState(
    parsed: { userId: string; content: string; sessionWebhook?: string },
    prisma?: PrismaClient
  ): Promise<{ state: InterviewState; wasPending: boolean } | { refusal: ProcessResult }> {
    let state = await this.repo.findActiveInterview(parsed.userId);

    if (!state) {
      const cooldown = await this.checkRestartCooldown(parsed);
      if (cooldown) return { refusal: cooldown };
      state = await this.startInterview(parsed.userId, prisma);
    }

    state.pendingMessages.push({ role: 'user', content: parsed.content });
    await this.resolveUserName(state, parsed.userId, prisma);
    this.checkTimeoutNudge(state, parsed);

    if (state.status === 'PROCESSING') {
      info('Silent resume from interrupted processing', {
        userId: parsed.userId,
        interviewId: state.interviewId,
      });
    }

    return { state, wasPending: state.status === 'PENDING' };
  }

  /**
   * Persist the PROCESSING status before the LLM call, returning the reply on failure.
   *
   * This pre-write is what makes an interrupted turn detectable on the next message:
   * a state stuck at PROCESSING means the user is resuming, not starting. So a write
   * failure must ABORT the turn -- continuing would run the graph against a state
   * nobody can see, and the next message would look like a fresh start.
   */
  private async markProcessing(
    state: InterviewState,
    userId: string
  ): Promise<ProcessResult | null> {
    state.status = 'PROCESSING';
    try {
      await this.repo.saveFullState(state.interviewId as string, state);
      return null;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      error('Failed to persist user message before LLM call', { userId, error: errMsg });
      return { success: false, error: errMsg };
    }
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
      state.userName = (await lookupInviteeName(prisma, userId)) ?? state.userName;
    } catch {
      // Silently fail userName resolution: the name only personalises the greeting,
      // and aborting the turn over it would lose the user's actual message.
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

    if (isVersionConflict(errorMsg) && retryCount < MAX_RETRIES) {
      const retried = await this.retryAfterVersionConflict(
        state,
        parsed,
        message,
        retryCount,
        prisma
      );
      if (retried) return retried;
    }

    reportExhaustedRetries(retryCount, parsed.userId, state.interviewId);
    return { success: false, error: errorMsg };
  }

  /**
   * Re-run the turn against a freshly loaded state after a version conflict.
   *
   * Returns null when the state is gone, so the caller falls through to reporting
   * the original failure. Only the USER's pending message is kept from the retry
   * write: everything else must come from the fresh read, because the whole point of
   * the conflict is that another turn wrote something this copy cannot see.
   */
  private async retryAfterVersionConflict(
    state: InterviewState,
    parsed: { userId: string; content: string },
    message: { data: string; headers: { messageId: string } },
    retryCount: number,
    prisma?: PrismaClient
  ): Promise<ProcessResult | null> {
    info('Retrying due to version conflict', {
      userId: parsed.userId,
      retryCount: retryCount + 1,
    });

    const freshState = await this.repo.loadFullState(state.interviewId as string, parsed.userId);
    if (!freshState) return null;

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
      return this.retryOrReportSaveFailure(
        err,
        { message, parsed, graphResult, state, retryCount },
        prisma
      );
    }

    return this.finishWithReply(parsed.sessionWebhook, graphResult.response);
  }

  /**
   * Retry a conflicting save, or report it — with a dead-letter log on exhaustion.
   *
   * The retry re-enters the INTERNAL path, never `processStreamMessage`: the public
   * entry point would hit the dedup cache, which already holds this messageId because
   * the first attempt registered it. Routing the retry through it made every
   * version-conflict retry return "Duplicate message" instead of retrying, so
   * MAX_RETRIES was unreachable in practice.
   */
  private async retryOrReportSaveFailure(
    err: unknown,
    ctx: {
      message: { data: string; headers: { messageId: string } };
      parsed: ParsedStreamMessage & { userId: string; content: string };
      graphResult: GraphResult;
      state: InterviewState;
      retryCount: number;
    },
    prisma?: PrismaClient
  ): Promise<ProcessResult> {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const { message, parsed, graphResult, state, retryCount } = ctx;

    if (isVersionConflict(errorMsg) && retryCount < MAX_RETRIES) {
      return this.processMessageInternal(parsed, message, retryCount + 1, prisma);
    }

    // H-5: dead-letter log on retry exhaustion, recording how much pending data
    // is at risk — that count is the only estimate of what the user will lose.
    if (retryCount >= MAX_RETRIES) {
      error('Persistence retries exhausted in retry path', {
        interviewId: state.interviewId,
        pendingMessagesCount: graphResult.nextState.pendingMessages.length,
        pendingResponsesCount: graphResult.nextState.pendingResponses.length,
      });
    }

    return { success: false, error: errorMsg };
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
    const idleMs = idleSinceLastPrompt(state);
    if (idleMs === null) return;

    const timeoutMs = positiveEnvInt('INTERVIEW_TIMEOUT_HOURS', 1) * 60 * 60 * 1000;
    if (idleMs < timeoutMs) return;

    if (state.nudgeCount >= positiveEnvInt('INTERVIEW_TIMEOUT_MAX_NUDGES', 3)) {
      info('Max nudges exceeded, will skip to next question', {
        userId: parsed.userId,
        nudgeCount: state.nudgeCount,
        currentQuestion: state.currentQuestion,
      });
      return;
    }

    this.sendNudge(state, parsed.sessionWebhook);
    info('Timeout nudge sent', {
      userId: parsed.userId,
      nudgeCount: state.nudgeCount,
      elapsedHours: Math.round(idleMs / (60 * 60 * 1000)),
    });
  }

  /**
   * Send the timeout nudge if the message carries a webhook.
   *
   * Fire-and-forget with a swallowed rejection on purpose: the nudge is advisory, so
   * a failed delivery must not fail the turn that triggered it -- the user's actual
   * answer is already being processed. `nudgeCount` is incremented here, so a nudge
   * that could not be delivered still counts against the cap; without that, a broken
   * webhook would retry the same nudge on every subsequent message.
   */
  private sendNudge(state: InterviewState, sessionWebhook: string | undefined): void {
    const nudgeMsg = '您好，距离上次回复已过去较长时间。您的访谈还在进行中，请继续回答。';
    if (sessionWebhook) this.sendReply(sessionWebhook, nudgeMsg).catch(() => {});
    state.nudgeCount++;
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
