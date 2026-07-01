import { PlanStatus, SendStatus } from '@prisma/client';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info, warn } from '../utils/logger.js';
import { InterviewPlanServiceBase } from './interview-plan-base.service.js';

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

    let invitationPrompt = '';
    if (plan.template?.content) {
      try {
        const content = JSON.parse(plan.template.content) as { invitationPrompt?: string };
        invitationPrompt = content.invitationPrompt || '';
      } catch (err) {
        warn('Failed to parse template content', {
          templateId: plan.templateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let sent = 0;
    let failed = 0;

    for (const interview of plan.interviews) {
      try {
        await this.sendInvitation(interview.userId, plan.name, invitationPrompt);
        sent++;
        await this.prisma.interview.update({
          where: { id: interview.id },
          data: { sendStatus: SendStatus.SENT, sentAt: new Date() },
        });
      } catch (err) {
        failed++;
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
      }
    }

    let planSendStatus: SendStatus | undefined;
    if (failed > 0 && sent > 0) {
      planSendStatus = SendStatus.SENT;
    } else if (failed > 0 && sent === 0) {
      planSendStatus = SendStatus.FAILED;
    } else if (failed === 0 && sent > 0) {
      planSendStatus = SendStatus.SENT;
    }

    const planUpdateData: Record<string, unknown> = {
      status: PlanStatus.RUNNING,
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      startedAt: plan.startedAt || new Date(),
      updatedBy: 'admin',
    };
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

    let invitationPrompt = '';
    if (template?.content) {
      try {
        const content = JSON.parse(template.content) as { invitationPrompt?: string };
        invitationPrompt = content.invitationPrompt || '';
      } catch (err) {
        warn('Failed to parse template content', {
          templateId: interview.plan.templateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
    invitationPrompt: string
  ): Promise<void> {
    const message = invitationPrompt
      ? `${invitationPrompt}\n\n（来自「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息即可开始访谈。）`
      : `您被邀请参与「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息（如"你好"或"开始"）即可开始访谈。`;
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
