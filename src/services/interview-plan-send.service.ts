import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info, warn } from '../utils/logger.js';
import { PlanStatus, SendStatus } from '../utils/prisma-client.js';
import { InterviewPlanServiceBase } from './interview-plan-base.service.js';

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
  async sendInvitations(planId: string): Promise<{ sent: number; failed: number }> {
    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id: planId },
      include: {
        template: { select: { content: true } },
        interviews: {
          where: { status: 'PENDING' },
        },
      },
    });

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const invitationPrompt = parseInvitationPrompt(plan.template?.content, plan.templateId);

    let sent = 0;
    let failed = 0;

    for (const interview of plan.interviews) {
      // Skip if user already has an active interview in another plan
      if (await this.hasActiveInterviewElsewhere(interview.userId, planId)) continue;

      if (await this.deliverInvitation(interview, plan.name, invitationPrompt, planId)) {
        sent++;
      } else {
        failed++;
      }
    }

    const planUpdateData: Record<string, unknown> = {
      status: PlanStatus.RUNNING,
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      startedAt: plan.startedAt || new Date(),
      updatedBy: 'admin',
    };
    const planSendStatus = resolvePlanSendStatus(sent, failed);
    if (planSendStatus !== undefined) {
      planUpdateData['sendStatus'] = planSendStatus;
    }

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: planUpdateData,
    });

    info('Invitations sent', { planId, sent, failed });
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

  async resendToInterview(
    planId: string,
    interviewId: string
  ): Promise<{ success: boolean; error?: string }> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: {
        id: true,
        userId: true,
        sendStatus: true,
        plan: { select: { id: true, name: true, templateId: true } },
      },
    });

    if (!interview) {
      return { success: false, error: `Interview not found: ${interviewId}` };
    }

    if (interview.plan?.id !== planId) {
      return {
        success: false,
        error: `Interview ${interviewId} does not belong to plan ${planId}`,
      };
    }

    const template = await this.prisma.template.findUnique({
      where: { id: interview.plan.templateId },
      select: { content: true },
    });

    const invitationPrompt = parseInvitationPrompt(template?.content, interview.plan.templateId);

    const wasAlreadyCounted =
      interview.sendStatus === SendStatus.SENT || interview.sendStatus === SendStatus.FAILED;

    try {
      await this.sendInvitation(interview.userId, interview.plan.name, invitationPrompt);
      await this.prisma.interview.update({
        where: { id: interviewId },
        data: { sendStatus: SendStatus.SENT, sentAt: new Date(), sendError: null },
      });
      if (!wasAlreadyCounted) {
        await this.prisma.interviewPlan.update({
          where: { id: planId },
          data: { sentCount: { increment: 1 } },
        });
      }
      info('Resent invitation', { planId, interviewId, userId: interview.userId });
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.prisma.interview.update({
        where: { id: interviewId },
        data: { sendStatus: SendStatus.FAILED, sendError: errorMsg },
      });
      if (!wasAlreadyCounted) {
        await this.prisma.interviewPlan.update({
          where: { id: planId },
          data: { failedCount: { increment: 1 } },
        });
      }
      error('Failed to resend invitation', {
        planId,
        interviewId,
        userId: interview.userId,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
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

  async pausePlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.PAUSED);
  }

  async resumePlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.RUNNING);
  }

  async cancelPlan(planId: string): Promise<void> {
    await this.updatePlanStatus(planId, PlanStatus.CANCELLED);
  }
}
