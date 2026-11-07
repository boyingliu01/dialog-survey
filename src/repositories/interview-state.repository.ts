import { DEFAULT_MAX_FOLLOWUPS, type InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import { mapInterviewToInterviewState } from './interview-state-mapper.js';

/**
 * When an interview actually finished, for the cooldown check (#200, #233).
 *
 * `completedAt` is preferred now that #233 writes it. The `updatedAt` fallback is
 * deliberate: interviews completed before that fix have no `completedAt`, and
 * returning null for them would silently disable the cooldown on every existing row.
 */
function completionInstant(interview: { completedAt: Date | null; updatedAt: Date }): Date {
  return interview.completedAt ?? interview.updatedAt;
}

export class StatePersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: 'VERSION_CONFLICT' | 'TRANSACTION_ERROR' | 'NOT_FOUND',
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'StatePersistenceError';
  }
}

export interface SaveStateOptions {
  interviewId: string;
  state: InterviewState;
  version: number;
}

export interface LoadStateOptions {
  interviewId: string;
  userId: string;
}

const MAX_RETRIES = 3;

/** Terminal statuses: no further conversation, so the end time is meaningful. */
const ENDED_STATUSES = new Set<InterviewState['status']>(['COMPLETED', 'CANCELLED']);

/**
 * `startedAt` / `completedAt` for an interview write, or an empty patch (issue #233).
 *
 * Neither column was ever written by ANY code path: of 19 COMPLETED interviews in
 * production, 0 had a `completedAt`. Two consequences. The admin page's "average
 * interview duration" was permanently 0 — the one number that would answer "are
 * these interviews too long". And `findCompletedInterview` had to substitute
 * `updatedAt`, which stops equalling the completion time as soon as a message
 * arrives afterwards (in interview 18811eb7 the conversation continued at 18:14
 * after finishing), so the cooldown window #200 computes and the "wait 29 minutes"
 * notice #132 shows were both derived from the wrong instant.
 *
 * Both values are WRITE-ONCE: a resend or a later save must not move them, because
 * the first ACTIVITY is what defines when the interview actually began. `startedAt`
 * is also set on a terminal write, so an interview that is cancelled before its
 * first answer still records when it was opened.
 */
function lifecycleTimestamps(
  existing: { startedAt: Date | null; completedAt: Date | null } | null,
  state: InterviewState
): { startedAt?: Date; completedAt?: Date } {
  // A missing row is `assertVersionMatches`' NOT_FOUND, raised before this is called;
  // accepting null here only keeps the type honest rather than asserting past it.
  if (!existing) return {};
  const now = new Date();
  return {
    ...(existing.startedAt === null ? { startedAt: now } : {}),
    ...(existing.completedAt === null && ENDED_STATUSES.has(state.status)
      ? { completedAt: now }
      : {}),
  };
}

/**
 * Optimistic-locking precondition shared by `saveState` and `saveFullState`:
 * inside the transaction, the interview must exist and still sit at the version
 * the caller loaded. Throwing `StatePersistenceError` here keeps both write paths
 * reporting identical NOT_FOUND / VERSION_CONFLICT semantics.
 */
function assertVersionMatches(
  interviewId: string,
  interview: { version: number } | null,
  expectedVersion: number
): void {
  if (!interview) {
    throw new StatePersistenceError(`Interview not found: ${interviewId}`, 'NOT_FOUND', false);
  }
  if (interview.version !== expectedVersion) {
    throw new StatePersistenceError(
      `Version conflict: expected ${expectedVersion}, got ${interview.version}`,
      'VERSION_CONFLICT',
      true
    );
  }
}

/** A persistence error the caller has declared worth retrying. */
function isRetryablePersistenceError(err: unknown): err is StatePersistenceError {
  return err instanceof StatePersistenceError && err.retryable;
}

/**
 * Pass a persistence error through, wrapping anything else.
 *
 * The wrapping is what gives a caller a single error type to handle while still
 * preserving an already-classified error's own code and retryability.
 */
function asPersistenceError(err: unknown, message: string): StatePersistenceError {
  if (err instanceof StatePersistenceError) return err;
  return new StatePersistenceError(message, 'TRANSACTION_ERROR', false);
}

/**
 * An optimistic-lock conflict, which is NOT retried.
 *
 * A conflict means another writer committed first, so the state this call holds
 * is already stale -- retrying would overwrite the newer version with older data.
 * It is surfaced to the caller to re-read and decide.
 */
function isVersionConflict(err: unknown): err is StatePersistenceError {
  return err instanceof StatePersistenceError && err.code === 'VERSION_CONFLICT';
}

export class InterviewStateRepository {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for InterviewStateRepository');
    }
    this.prisma = prisma;
  }

  async saveState(options: SaveStateOptions, retryCount = 0): Promise<void> {
    const { interviewId, state, version } = options;

    try {
      await this.prisma.$transaction(async (tx) => {
        const interview = await tx.interview.findUnique({
          where: { id: interviewId },
        });

        assertVersionMatches(interviewId, interview, version);
        await tx.interview.update({
          where: { id: interviewId, version },
          data: {
            status: state.status,
            currentQuestion: state.currentQuestion,
            followupCount: state.followupCount,
            maxFollowups: state.maxFollowups,
            version: { increment: 1 },
            messages: {
              deleteMany: { interviewId },
              create: state.messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
            },
            responses: {
              deleteMany: { interviewId },
              create: state.responses.map((r) => ({
                questionId: r.questionId,
                content: r.content,
                isFollowup: r.isFollowup,
              })),
            },
          },
        });
      });

      info('State saved successfully', { interviewId, version });
    } catch (err) {
      return this.handleSaveFailure(err, options, retryCount);
    }
  }

  /**
   * Decide what a failed save means: retry, surface the conflict, or give up.
   *
   * The three outcomes are exclusive and their ORDER is the rule. A retryable
   * error is retried until the budget runs out and only THEN reported. A version
   * conflict is never retried, because the state in hand is stale. Everything
   * else is wrapped, so a caller always sees one error type.
   */
  private handleSaveFailure(
    err: unknown,
    options: SaveStateOptions,
    retryCount: number
  ): Promise<void> {
    const { interviewId, version } = options;
    if (isRetryablePersistenceError(err) && retryCount < MAX_RETRIES) {
      info('Retrying state save', { interviewId, retryCount: retryCount + 1 });
      return this.saveState(options, retryCount + 1);
    }
    if (isVersionConflict(err)) {
      error('Optimistic lock conflict', { interviewId, version });
      throw err;
    }
    error('Failed to save state', {
      interviewId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new StatePersistenceError('Failed to save state', 'TRANSACTION_ERROR', false);
  }

  /**
   * Persist a full state snapshot, retrying the SAME way `saveState` does.
   *
   * Kept as a separate entry point because it takes an id rather than an options
   * bag; the retry/conflict handling must stay identical, so it delegates to the
   * shared tail instead of duplicating it.
   */

  async loadState(options: LoadStateOptions): Promise<InterviewState | null> {
    const { interviewId, userId } = options;
    return this._loadStateWithMessages(interviewId, userId, 'Failed to load state');
  }

  async loadFullState(interviewId: string, userId: string): Promise<InterviewState | null> {
    return this._loadStateWithMessages(interviewId, userId, 'Failed to load full state');
  }

  /** Shared logic for loading state with messages (DRY) */
  private async _loadStateWithMessages(
    interviewId: string,
    userId: string,
    errorMsg: string
  ): Promise<InterviewState | null> {
    try {
      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          responses: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!interview || interview.userId !== userId) {
        return null;
      }

      return mapInterviewToInterviewState(interview);
    } catch (err) {
      error(errorMsg, {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async saveFullState(
    interviewId: string,
    state: InterviewState,
    retryCount = 0
  ): Promise<{ success: boolean; newVersion: number }> {
    try {
      const updatedInterview = await this.prisma.$transaction(async (tx) => {
        const interview = await tx.interview.findUnique({
          where: { id: interviewId },
        });

        assertVersionMatches(interviewId, interview, state.originalVersion);

        if (state.pendingMessages.length > 0) {
          await tx.message.createMany({
            data: state.pendingMessages.map((m) => ({
              interviewId,
              role: m.role,
              content: m.content,
            })),
          });
        }

        if (state.pendingResponses.length > 0) {
          await tx.response.createMany({
            data: state.pendingResponses.map((r) => ({
              interviewId,
              questionId: r.questionId,
              content: r.content,
              isFollowup: r.isFollowup,
              // Issue #233: the field was in `InterviewState` and documented, but the
              // payload stopped at `isFollowup`, so `@default(0)` silently wrote 0 for
              // every follow-up. Measured: all 3 real follow-ups in interview
              // 7837c84b have depth=0, and no row in the database had ever been 1.
              // Nothing failed — the column merely stayed at its default forever.
              // `?? 0` rather than the raw optional: states persisted before the field
              // existed have no key, and an answer to the question itself is round 0.
              followupDepth: r.followupDepth ?? 0,
            })),
          });
        }

        const updated = await tx.interview.update({
          where: { id: interviewId, version: state.originalVersion },
          data: {
            status: state.status,
            currentQuestion: state.currentQuestion,
            followupCount: state.followupCount,
            maxFollowups: state.maxFollowups,
            nudgeCount: state.nudgeCount,
            ...lifecycleTimestamps(interview, state),
            version: { increment: 1 },
          },
        });

        return updated;
      });

      state.version = updatedInterview.version;
      state.originalVersion = updatedInterview.version;
      state.pendingMessages = [];
      state.pendingResponses = [];

      info('Full state saved successfully', {
        interviewId,
        version: updatedInterview.version,
      });

      return { success: true, newVersion: updatedInterview.version };
    } catch (err) {
      return this.handleFullSaveFailure(err, interviewId, state, retryCount);
    }
  }

  /**
   * The failure tail of `saveFullState`.
   *
   * Deliberately NOT shared with `handleSaveFailure`: this entry point takes
   * pending deltas, so its caller already holds the authoritative version and a
   * VERSION_CONFLICT carries no special meaning here. Every `StatePersistenceError`
   * is therefore re-thrown as-is, preserving its own code and retryability rather
   * than being flattened into a transaction error.
   */
  private handleFullSaveFailure(
    err: unknown,
    interviewId: string,
    state: InterviewState,
    retryCount: number
  ): Promise<{ success: boolean; newVersion: number }> {
    if (isRetryablePersistenceError(err) && retryCount < MAX_RETRIES) {
      info('Retrying full state save', { interviewId, retryCount: retryCount + 1 });
      return this.saveFullState(interviewId, state, retryCount + 1);
    }
    if (err instanceof StatePersistenceError) {
      error('State persistence error', { interviewId, code: err.code, message: err.message });
    } else {
      error('Failed to save full state', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw asPersistenceError(err, 'Failed to save full state');
  }

  async createInterview(userId: string, templateId: string): Promise<string> {
    const interview = await this.prisma.interview.create({
      data: {
        userId,
        templateId,
        status: 'PENDING',
        maxFollowups: DEFAULT_MAX_FOLLOWUPS,
        version: 1,
      },
    });
    return interview.id;
  }

  async getVersion(interviewId: string): Promise<number> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { version: true },
    });
    return interview?.version || 0;
  }

  /**
   * Load a full state by interview id alone, with no owner check (#232).
   *
   * Every other loader takes a `userId` because it serves a request from that user.
   * The timeout job is not acting on behalf of anyone — it is the system noticing that
   * an interview stopped — so there is no owner to check against. Kept as its own
   * method rather than a flag on `loadFullState`, so the owner check cannot be switched
   * off accidentally by an ordinary caller.
   */
  async findStateById(interviewId: string): Promise<InterviewState | null> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' } },
      },
    });
    return interview ? mapInterviewToInterviewState(interview) : null;
  }

  /**
   * Interviews that owe a reply and have not moved since `idleSince` (#232).
   *
   * Returns ids only: the caller decides one at a time what to do, and loading the
   * full message history for every stalled interview at once would pull the whole
   * conversation table into memory on the first run after a deployment.
   */
  async findStalledInterviewIds(idleSince: Date): Promise<string[]> {
    const rows = await this.prisma.interview.findMany({
      where: {
        status: { in: ['ACTIVE', 'WAITING'] },
        updatedAt: { lt: idleSince },
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Close a stalled interview as INTERRUPTED (#232), guarded by its current version.
   *
   * Returns false when the version moved — the interviewee answered while the job was
   * deciding — and the caller must leave it alone. The version check is what keeps the
   * timeout job from overwriting a live turn; without it, a reply that lands between
   * the scan and the write would close a conversation that had just resumed.
   */
  async markInterrupted(interviewId: string, expectedVersion: number): Promise<boolean> {
    const { count } = await this.prisma.interview.updateMany({
      where: { id: interviewId, version: expectedVersion, status: { in: ['ACTIVE', 'WAITING'] } },
      data: { status: 'INTERRUPTED', completedAt: new Date(), version: { increment: 1 } },
    });
    return count === 1;
  }

  async findActiveInterview(userId: string): Promise<InterviewState | null> {
    const interview = await this.prisma.interview.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PROCESSING', 'WAITING', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!interview) {
      return null;
    }

    return mapInterviewToInterviewState(interview);
  }

  /**
   * The most recently completed interview for a user, for the cooldown check (#200).
   *
   * `completedAt` is preferred now that #233 actually writes it. The `updatedAt`
   * fallback is kept deliberately: interviews completed before that fix have no
   * `completedAt`, and returning null for them would silently disable the cooldown
   * on every existing row. For a correctly-written row the two differ, and the
   * difference is the bug — in interview 18811eb7 the conversation continued at
   * 18:14 after the interview finished, so `updatedAt` was a later instant than the
   * real completion and the cooldown had already expired when it should not have.
   */
  async findCompletedInterview(
    userId: string
  ): Promise<{ completedAt: Date; templateId: string } | null> {
    const interview = await this.prisma.interview.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, completedAt: true, templateId: true },
    });
    if (!interview) return null;
    return {
      completedAt: completionInstant(interview),
      templateId: interview.templateId,
    };
  }
}
