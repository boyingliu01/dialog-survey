import type { InterviewState } from '../core/types/index.js';
import type { InterviewStateRepository } from '../repositories/interview-state.repository.js';
import { error, info } from '../utils/logger.js';

/** Default idle window before an interview counts as stalled, in hours. */
const DEFAULT_TIMEOUT_HOURS = 1;

/** Default number of nudges before the interview is closed, per interview. */
const DEFAULT_MAX_NUDGES = 3;

/** What the sweep needs from the outside world. */
export interface TimeoutDeps {
  repo: InterviewStateRepository;
  /** Deliver a bot message to a user. Injecting it keeps this unit-testable. */
  send: (userId: string, content: string) => Promise<void>;
  /** Question count for the template, for the progress copy. */
  totalQuestions: (templateId: string | undefined) => Promise<number>;
  now?: () => Date;
}

/** What one sweep did, for the cron log line and for the tests. */
export interface SweepResult {
  scanned: number;
  nudged: number;
  interrupted: number;
  skipped: number;
}

/**
 * Milliseconds since the bot last spoke, or null when a nudge cannot apply.
 *
 * Mirrors `stream-message.service.ts#idleSinceLastPrompt`, deliberately: the two paths
 * must agree on what "the interviewee owes a reply" means, or the inline check and
 * this job would disagree about whether an interview is even waiting. Returns null
 * when there is no timestamped assistant message — nothing has gone quiet yet.
 */
function idleMsSinceLastPrompt(state: InterviewState, now: Date): number | null {
  if (state.status !== 'ACTIVE' && state.status !== 'WAITING') return null;
  const lastBotMsg = [...state.messages].reverse().find((m) => m.role === 'assistant');
  if (!lastBotMsg?.timestamp) return null;
  return now.getTime() - new Date(lastBotMsg.timestamp).getTime();
}

/**
 * The nudge copy, carrying the progress the interviewee stalled at (#228, #232).
 *
 * The previous text — "您的访谈还在进行中，请继续回答" — told a stalled interviewee
 * nothing about whether this ends soon, which is the exact reason they stalled.
 * Progress is 1-based and capped at the total, so the last question reads
 * "第 14/14 题" and never "第 15/14 题". The escape hatch is offered explicitly
 * because a reply of "结束" is handled by the graph, whereas silence is not.
 */
export function nudgeMessage(currentQuestion: number, totalQuestions: number): string {
  if (totalQuestions <= 0) {
    return '您好，距离上次回复已过去较长时间。您的访谈还在进行中，请继续回答。';
  }
  const position = Math.min(currentQuestion + 1, totalQuestions);
  const remaining = Math.max(totalQuestions - position, 0);
  const tail = remaining > 0 ? `，还剩 ${remaining} 题；` : '，这是最后一题；';
  const escapeHint = '如果暂时不方便继续，也可以直接回复"结束"，我们先把已经聊到的内容整理成报告。';
  return `您好，距离上次回复已过去较长时间。您进行到第 ${position}/${totalQuestions} 题${tail}${escapeHint}`;
}

/** Env int, falling back when absent or nonsense. */
function envInt(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Message from an unknown thrown value, for the log line. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Close stalled interviews, and remind those that still have nudges left (#232).
 *
 * The root cause is worth stating plainly: `checkTimeoutNudge` existed and worked, but
 * it was only reachable from `processMessageInternal` — the handler for an INBOUND
 * message. Abandonment is defined by no message arriving, so the check could never run
 * on the case it was written for, and `INTERVIEW_TIMEOUT_HOURS` /
 * `INTERVIEW_TIMEOUT_MAX_NUDGES` were dead configuration. Measured in production: all
 * three stalled interviews still had `nudgeCount = 0` after 18, 41 and 48 minutes.
 *
 * A sweep is safe to run concurrently with live traffic: the write is guarded by the
 * interview's version, so a reply that lands mid-decision wins.
 */
export class InterviewTimeoutService {
  private readonly deps: TimeoutDeps;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly maxNudges: number;

  constructor(deps: TimeoutDeps, options: { timeoutHours?: number; maxNudges?: number } = {}) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
    this.timeoutMs =
      (options.timeoutHours ?? envInt('INTERVIEW_TIMEOUT_HOURS', DEFAULT_TIMEOUT_HOURS)) *
      60 *
      60 *
      1000;
    this.maxNudges =
      options.maxNudges ?? envInt('INTERVIEW_TIMEOUT_MAX_NUDGES', DEFAULT_MAX_NUDGES);
  }

  /** One sweep over every interview that owes a reply. Never throws. */
  async sweep(): Promise<SweepResult> {
    const now = this.now();
    const ids = await this.listStalled(now);
    const result: SweepResult = { scanned: ids.length, nudged: 0, interrupted: 0, skipped: 0 };

    for (const interviewId of ids) {
      const outcome = await this.handleOne(interviewId, now);
      if (outcome !== 'skipped') result[outcome] += 1;
      else result.skipped += 1;
    }

    if (result.scanned > 0) info('Timeout sweep finished', { ...result });
    return result;
  }

  /**
   * Ids of interviews whose last write predates the idle window.
   *
   * A failure here is logged and reported as an empty sweep rather than thrown: this
   * runs from a cron job, and an unhandled rejection there would kill the timer for
   * every subsequent hour.
   */
  private async listStalled(now: Date): Promise<string[]> {
    const cutoff = new Date(now.getTime() - this.timeoutMs);
    try {
      return await this.deps.repo.findStalledInterviewIds(cutoff);
    } catch (err) {
      error('Timeout sweep could not list stalled interviews', { error: describe(err) });
      return [];
    }
  }

  /**
   * Act on one interview.
   *
   * A single interview's failure must not abort the sweep — one bad row would
   * otherwise block every other stalled conversation behind it, every hour, forever.
   */
  private async handleOne(
    interviewId: string,
    now: Date
  ): Promise<'nudged' | 'interrupted' | 'skipped'> {
    try {
      const state = await this.deps.repo.findStateById(interviewId);
      if (!state || !this.isQuiet(state, now)) return 'skipped';
      if (state.nudgeCount >= this.maxNudges) return await this.interrupt(interviewId, state);
      await this.nudge(interviewId, state);
      return 'nudged';
    } catch (err) {
      error('Timeout sweep failed for one interview', { interviewId, error: describe(err) });
      return 'skipped';
    }
  }

  /**
   * Whether the conversation has actually gone quiet.
   *
   * `updatedAt` said this row was old, but the transcript can disagree: the last bot
   * message may be recent, or the interview may no longer be in a state that owes a
   * reply at all. The transcript is the authority, not the row timestamp.
   */
  private isQuiet(state: InterviewState, now: Date): boolean {
    const idleMs = idleMsSinceLastPrompt(state, now);
    return idleMs !== null && idleMs >= this.timeoutMs;
  }

  /**
   * Close the interview instead of "skipping to the next question".
   *
   * The previous code logged "will skip to next question" and did nothing at all — a
   * promise never kept. Advancing the pointer was the alternative and is worse: it
   * fabricates an answer the interviewee never gave, and the report would then claim
   * coverage of a question nobody answered. INTERRUPTED is the honest end state.
   */
  private async interrupt(interviewId: string, state: InterviewState): Promise<'interrupted'> {
    const closed = await this.deps.repo.markInterrupted(interviewId, state.version);
    if (!closed) {
      // The interviewee replied while this sweep was deciding. Their turn wins.
      info('Interview resumed before it could be interrupted', { interviewId });
      return 'interrupted';
    }
    info('Interview interrupted after nudges exhausted', {
      interviewId,
      currentQuestion: state.currentQuestion,
      nudgeCount: state.nudgeCount,
    });
    return 'interrupted';
  }

  /** Send the reminder and record it, so the cap is a real cap. */
  private async nudge(interviewId: string, state: InterviewState): Promise<void> {
    const total = await this.deps.totalQuestions(state.templateId);
    await this.deps.send(state.userId, nudgeMessage(state.currentQuestion, total));
    state.nudgeCount += 1;
    await this.deps.repo.saveState({ interviewId, state, version: state.originalVersion });
  }
}
