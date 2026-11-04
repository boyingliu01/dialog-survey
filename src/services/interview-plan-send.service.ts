import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info, warn } from '../utils/logger.js';
import { PlanStatus, SendStatus } from '../utils/prisma-client.js';
import { InterviewPlanServiceBase } from './interview-plan-base.service.js';

/** How many invitations went out and how many did not. */
interface SendTally {
  sent: number;
  failed: number;
}

/**
 * The plan-level write that records a batch send.
 *
 * `startedAt` is only stamped on the FIRST send: re-running a send for a plan that
 * already started must not move its start time forward, or the plan's elapsed time
 * (and any duration metric built on it) would reset on every retry.
 */
function planSendUpdate(tally: SendTally, startedAt: Date | null): Record<string, unknown> {
  const data: Record<string, unknown> = {
    status: PlanStatus.RUNNING,
    sentCount: { increment: tally.sent },
    failedCount: { increment: tally.failed },
    startedAt: startedAt || new Date(),
    updatedBy: 'admin',
  };
  const sendStatus = resolvePlanSendStatus(tally.sent, tally.failed);
  if (sendStatus !== undefined) data['sendStatus'] = sendStatus;
  return data;
}

/** The interview a resend is aimed at, plus the invitation text to send. */
interface ResendTarget {
  interview: {
    id: string;
    userId: string;
    sendStatus: SendStatus;
    plan: { id: string; name: string; templateId: string };
  };
  invitationPrompt: string;
}

/**
 * Whether this interview has already been counted against the plan's totals.
 *
 * A FAILED send was counted too, so retrying it must not increment again --
 * otherwise a flaky network inflates failedCount far past the number of interviews.
 */
function countsAsSent(sendStatus: SendStatus): boolean {
  return sendStatus === SendStatus.SENT || sendStatus === SendStatus.FAILED;
}

/**
 * Name of the DingTalk bot to tell invitees to reply to.
 *
 * The invitation text used to hardcode a single deployment's bot name, so every
 * other deployment told invitees to message a robot that did not exist there.
 * `DINGTALK_BOT_NAME` configures it; when unset the copy stays generic ("this
 * robot") rather than guessing, because a wrong name is worse than a vague one.
 */
function resolveBotName(env: NodeJS.ProcessEnv = process.env): string | null {
  const name = env['DINGTALK_BOT_NAME']?.trim();
  return name ? name : null;
}

/**
 * Extract the invitation prompt from a template's stored JSON content.
 *
 * A malformed template must not abort the whole send run, so a parse failure is
 * logged and the prompt falls back to empty.
 */
function parseInvitationPrompt(
  content: string | null | undefined,
  templateId: string | null | undefined
): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content) as { invitationPrompt?: string };
    return parsed.invitationPrompt || '';
  } catch (err) {
    warn('Failed to parse template content', {
      templateId,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/**
 * Overall send status for a plan, from its per-invitation tallies.
 *
 * Undefined means "do not change it": nothing was attempted, so the previous
 * status still describes the plan.
 */
function resolvePlanSendStatus(sent: number, failed: number): SendStatus | undefined {
  if (sent > 0) return SendStatus.SENT;
  if (failed > 0) return SendStatus.FAILED;
  return undefined;
}

export class InterviewPlanSendService extends InterviewPlanServiceBase {
  // archlint-disable-next-line
  async sendInvitations(planId: string): Promise<{ sent: number; failed: number }> {
    const plan = await this.loadSendablePlan(planId);
    const tally = await this.deliverAll(plan, planId);

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: planSendUpdate(tally, plan.startedAt),
    });

    info('Invitations sent', { planId, ...tally });
    return tally;
  }

  /** The plan plus its PENDING interviews, or a throw when it does not exist. */
  private async loadSendablePlan(planId: string) {
    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id: planId },
      include: {
        template: { select: { content: true } },
        interviews: { where: { status: 'PENDING' } },
      },
    });
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return plan;
  }

  /** Send every invitation for the plan, tallying the outcomes. */
  private async deliverAll(
    plan: Awaited<ReturnType<InterviewPlanSendService['loadSendablePlan']>>,
    planId: string
  ): Promise<SendTally> {
    const invitationPrompt = parseInvitationPrompt(plan.template?.content, plan.templateId);
    let sent = 0;
    let failed = 0;

    for (const interview of plan.interviews) {
      // Skip if user already has an active interview in another plan
      if (await this.hasActiveInterviewElsewhere(interview.userId, planId)) continue;
      if (await this.deliverInvitation(interview, plan.name, invitationPrompt, planId)) sent++;
      else failed++;
    }
    return { sent, failed };
  }

  /**
   * True when the user is already mid-interview in a different plan, in which
   * case inviting them again would fork one person across two conversations.
   */
  private async hasActiveInterviewElsewhere(userId: string, planId: string): Promise<boolean> {
    const activeInOtherPlan = await this.prisma.interview.findFirst({
      where: {
        userId,
        planId: { not: planId },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: { id: true },
    });
    if (!activeInOtherPlan) return false;

    warn('Skipping invitation - user has active interview in another plan', {
      planId,
      userId,
      otherInterviewId: activeInOtherPlan.id,
    });
    return true;
  }

  /**
   * Send one invitation and record the outcome on the interview row.
   *
   * Returns whether the send succeeded. The send-status write is part of the
   * contract: a successful send that cannot be recorded would be retried on the
   * next run, so a failure to persist the success is reported as a failure.
   */
  private async deliverInvitation(
    interview: { id: string; userId: string },
    planName: string,
    invitationPrompt: string,
    planId: string
  ): Promise<boolean> {
    try {
      await this.sendInvitation(interview.userId, planName, invitationPrompt);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      error('Failed to send invitation', {
        planId,
        userId: interview.userId,
        error: errorMsg,
      });
      await this.prisma.interview.update({
        where: { id: interview.id },
        data: { sendStatus: SendStatus.FAILED, sendError: errorMsg },
      });
      return false;
    }

    await this.prisma.interview.update({
      where: { id: interview.id },
      data: { sendStatus: SendStatus.SENT, sentAt: new Date() },
    });
    return true;
  }

  // archlint-disable-next-line
  async resendToInterview(
    planId: string,
    interviewId: string
  ): Promise<{ success: boolean; error?: string }> {
    const found = await this.findResendTarget(planId, interviewId);
    if ('error' in found) return { success: false, error: found.error };

    const { interview, invitationPrompt } = found;
    const wasAlreadyCounted = countsAsSent(interview.sendStatus);

    try {
      await this.sendInvitation(interview.userId, interview.plan.name, invitationPrompt);
      await this.recordResendSuccess(planId, interviewId, wasAlreadyCounted);
      info('Resent invitation', { planId, interviewId, userId: interview.userId });
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.recordResendFailure(planId, interviewId, errorMsg, wasAlreadyCounted);
      error('Failed to resend invitation', {
        planId,
        interviewId,
        userId: interview.userId,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  /** The interview to resend to and its invitation text, or an error message. */
  private async findResendTarget(
    planId: string,
    interviewId: string
  ): Promise<ResendTarget | { error: string }> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        userId: true,
        sendStatus: true,
        plan: { select: { id: true, name: true, templateId: true } },
      },
    });

    if (!interview) return { error: `Interview not found: ${interviewId}` };
    // The plan id comes from the URL, so this is a real authorization check: it
    // stops a resend addressed to one plan from reaching another plan's interview.
    if (interview.plan?.id !== planId) {
      return { error: `Interview ${interviewId} does not belong to plan ${planId}` };
    }

    const template = await this.prisma.template.findUnique({
      where: { id: interview.plan.templateId },
      select: { content: true },
    });
    const invitationPrompt = parseInvitationPrompt(template?.content, interview.plan.templateId);
    // Safe: the guard above returned early unless `plan` was present and matched.
    return { interview: { ...interview, plan: interview.plan }, invitationPrompt };
  }

  /** Mark the interview sent and bump the plan counter only on a first send. */
  private async recordResendSuccess(
    planId: string,
    interviewId: string,
    wasAlreadyCounted: boolean
  ): Promise<void> {
    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { sendStatus: SendStatus.SENT, sentAt: new Date(), sendError: null },
    });
    if (!wasAlreadyCounted) await this.bumpPlanCounter(planId, 'sentCount');
  }

  /** Mark the interview failed and bump the failure counter only on a first send. */
  private async recordResendFailure(
    planId: string,
    interviewId: string,
    errorMsg: string,
    wasAlreadyCounted: boolean
  ): Promise<void> {
    await this.prisma.interview.update({
      where: { id: interviewId },
      data: { sendStatus: SendStatus.FAILED, sendError: errorMsg },
    });
    if (!wasAlreadyCounted) await this.bumpPlanCounter(planId, 'failedCount');
  }

  /**
   * Increment one of the plan's send counters.
   *
   * Called only when the interview was NOT already SENT or FAILED -- otherwise a
   * resend would inflate the plan's totals every time an admin retried, and the
   * dashboard's success rate would drift away from the real one.
   */
  private async bumpPlanCounter(planId: string, field: 'sentCount' | 'failedCount'): Promise<void> {
    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: { [field]: { increment: 1 } },
    });
  }

  protected async sendInvitation(
    userId: string,
    planName: string,
    invitationPrompt: string,
    botName: string | null = resolveBotName()
  ): Promise<void> {
    // "Reply to <X> in DingTalk": name the bot when configured, stay generic
    // otherwise. Never name a bot this deployment does not run — an invitee
    // following a wrong name ends up messaging nothing and assumes the
    // invitation is broken.
    const replyTarget = botName ? `回复 ${botName} 任意消息` : '直接回复本机器人任意消息';
    const message = invitationPrompt
      ? `${invitationPrompt}\n\n（来自「${planName}」访谈。请直接在钉钉中${replyTarget}即可开始访谈。）`
      : `您被邀请参与「${planName}」访谈。请直接在钉钉中${replyTarget}（如"你好"或"开始"）即可开始访谈。`;
    const result = await messageSender.sendTextMessage([userId], message);
    if (result.failedUserIds.length > 0) {
      const errors =
        result.errors?.map((e) => `${e.userId}: ${e.error}`).join('; ') || 'unknown error';
      throw new Error(`DingTalk send failed: ${errors}`);
    }
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    const updateData: Record<string, unknown> = { status, updatedBy: 'admin' };
    if (status === PlanStatus.COMPLETED) {
      updateData['completedAt'] = new Date();
    }

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: updateData,
    });
  }

  // archlint-disable-next-line
  async pausePlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.PAUSED);
  }

  // archlint-disable-next-line
  async resumePlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.RUNNING);
  }

  // archlint-disable-next-line
  async cancelPlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.CANCELLED);
  }
}
