// @no-test-required: covered by tests/plan-completion.test.ts
import { error, info } from '../utils/logger.js';
import type { PlanStatus, PrismaClient } from '../utils/prisma-client.js';

/**
 * Interview states that count as finished. A plan is done when every interview
 * it owns has reached one of these — an in-flight interview (PENDING, ACTIVE,
 * PROCESSING, WAITING) means more answers may still arrive.
 */
const TERMINAL_INTERVIEW_STATUSES = ['COMPLETED', 'CANCELLED'] as const;

/**
 * Plan states the automatic completion may act on. Deliberately narrow: the
 * completion path is a bookkeeping correction for a plan that was running, and
 * must not resurrect a CANCELLED plan or un-pause a PAUSED one behind an
 * operator's back.
 */
const COMPLETABLE_PLAN_STATUS = 'RUNNING';

/**
 * Result of one re-evaluation.
 *
 * - `completed`: the plan was flipped to COMPLETED by this call;
 * - `running`: at least one interview is still in flight, nothing written;
 * - `ignored`: the interview has no plan, or the plan is in a state this hook
 *   does not own (see COMPLETABLE_PLAN_STATUS).
 */
export type PlanCompletionOutcome = 'completed' | 'running' | 'ignored';

/**
 * Settle an InterviewPlan once its interviews finish (issue #202).
 *
 * Nothing used to move a plan from RUNNING to COMPLETED: a plan with a single
 * member stayed RUNNING forever after that member's interview completed, and
 * the admin list could not tell "still collecting" from "collection done".
 *
 * The count is always derived from the `interviews` relation — the old stored
 * `completedCount` column was removed (bffaf4a) precisely because two sources
 * of truth drifted apart.
 */
export class PlanCompletionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Re-evaluate the plan owning `interviewId` after that interview reached a
   * terminal state.
   *
   * Never throws: this runs fire-and-forget from the interview turn, and an
   * interviewee's completed conversation must not fail because plan bookkeeping
   * did. Failures are logged and returned as `ignored`.
   */
  async reconcileAfterInterviewCompleted(interviewId: string): Promise<PlanCompletionOutcome> {
    try {
      return await this.evaluate(interviewId);
    } catch (err) {
      error('Plan completion failed', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'ignored';
    }
  }

  private async evaluate(interviewId: string): Promise<PlanCompletionOutcome> {
    const planId = await this.findPlanId(interviewId);
    if (!planId) return 'ignored';

    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id: planId },
      select: { status: true },
    });
    if (!plan || plan.status !== COMPLETABLE_PLAN_STATUS) {
      info('Plan completion skipped', {
        interviewId,
        planId,
        planStatus: plan?.status ?? 'MISSING',
      });
      return 'ignored';
    }

    const [total, stillRunning, completed] = await Promise.all([
      this.prisma.interview.count({ where: { planId } }),
      this.prisma.interview.count({
        where: { planId, status: { notIn: [...TERMINAL_INTERVIEW_STATUSES] } },
      }),
      this.prisma.interview.count({ where: { planId, status: 'COMPLETED' } }),
    ]);

    // Guarded update, not a plain write: a concurrent turn may have changed the
    // plan (cancel/pause) between the read above and this write. Matching on
    // status makes the transition atomic — a stale RUNNING read cannot clobber
    // a CANCELLED plan.
    if (stillRunning === 0 && completed > 0) {
      return this.markCompleted(interviewId, planId, total, completed);
    }

    info('Plan still running', {
      interviewId,
      planId,
      total,
      stillRunning,
      completed,
    });
    return 'running';
  }

  private async findPlanId(interviewId: string): Promise<string | null> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { planId: true },
    });
    return interview?.planId ?? null;
  }

  private async markCompleted(
    interviewId: string,
    planId: string,
    total: number,
    completed: number
  ): Promise<PlanCompletionOutcome> {
    const completedAt = new Date();
    const { count } = await this.prisma.interviewPlan.updateMany({
      where: { id: planId, status: COMPLETABLE_PLAN_STATUS as PlanStatus },
      data: { status: 'COMPLETED', completedAt, updatedBy: 'system' },
    });

    if (count === 0) {
      // Lost the race with a concurrent manual status change; the operator's
      // intent wins.
      info('Plan completion skipped: status changed concurrently', { interviewId, planId });
      return 'ignored';
    }

    info('Interview plan completed automatically', {
      interviewId,
      planId,
      total,
      completed,
      completedAt: completedAt.toISOString(),
    });
    return 'completed';
  }
}
