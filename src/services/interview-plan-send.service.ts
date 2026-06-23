import { PlanStatus, Prisma, SendStatus } from '@prisma/client';
import type { DingTalkClient } from '../integrations/dingtalk/client.js';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info, warn } from '../utils/logger.js';
import { InterviewPlanServiceBase } from './interview-plan-base.service.js';
import type {
  CreateAndPublishInput,
  ImportResult,
  InviteeData,
} from './interview-plan-base.service.js';
import { parseInviteeText } from './interview-plan-base.service.js';

export class InterviewPlanSendService extends InterviewPlanServiceBase {
  async importInvitees(
    planId: string,
    invitees: InviteeData[],
    dingtalkClient?: DingTalkClient
  ): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };
    const plan = await this.prisma.interviewPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const existingUserIds = new Set(
      (await this.prisma.interview.findMany({ where: { planId }, select: { userId: true } })).map(
        (i) => i.userId
      )
    );

    // Resolve phone entries to userId via DingTalk API
    const resolvedInvitees: InviteeData[] = [];
    for (const inv of invitees) {
      if (inv.phone && !inv.userId) {
        if (!dingtalkClient) {
          result.failed++;
          result.errors.push(`Phone ${inv.phone} requires DingTalk client for resolution`);
          continue;
        }
        try {
          const lookup = await dingtalkClient.getUserIdByMobile(inv.phone);
          if (!lookup.found) {
            result.failed++;
            result.errors.push(`Phone ${inv.phone} not found in DingTalk`);
            continue;
          }
          resolvedInvitees.push({ userId: lookup.userId, name: inv.name || lookup.name });
        } catch (err) {
          result.failed++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Failed to resolve phone ${inv.phone}: ${errorMsg}`);
        }
      } else {
        resolvedInvitees.push(inv);
      }
    }

    const uniqueInvitees = new Map<string, InviteeData>();
    for (const inv of resolvedInvitees) {
      const key = inv.userId ?? 'unknown';
      uniqueInvitees.set(key, inv);
    }
    const interviews = [];
    for (const invitee of uniqueInvitees.values()) {
      if (!invitee.userId || existingUserIds.has(invitee.userId)) {
        if (invitee.userId) {
          result.failed++;
          result.errors.push(`User ${invitee.userId} already exists in plan`);
        }
        continue;
      }
      interviews.push({
        userId: invitee.userId,
        templateId: plan.templateId,
        planId: planId,
        status: 'PENDING' as const,
      });
    }
    if (interviews.length > 0) {
      await this.prisma.interview.createMany({ data: interviews });
      result.success = interviews.length;
    }
    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: {
        inviteeData: Array.from(uniqueInvitees.values()) as unknown as Prisma.InputJsonValue,
        status: PlanStatus.READY,
        updatedBy: 'admin',
      },
    });
    info('Invitees imported', { planId, success: result.success, failed: result.failed });
    return result;
  }

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

  private async sendInvitation(
    userId: string,
    planName: string,
    invitationPrompt: string
  ): Promise<void> {
    const message = invitationPrompt
      ? `${invitationPrompt}\n\n（来自「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息即可开始访谈。）`
      : `您被邀请参与「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息（如"你好"或"开始"）即可开始访谈。`;
    await messageSender.sendTextMessage([userId], message);
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

  async createAndPublish(input: CreateAndPublishInput): Promise<{
    planId: string;
    imported: number;
    sent: number;
    failed: number;
    errors: string[];
  }> {
    const planId = await this.createPlan({
      name: input.name,
      ...(input.description != null ? { description: input.description } : {}),
      templateId: input.templateId,
      ...(input.targetDate != null ? { targetDate: new Date(input.targetDate) } : {}),
      ...(input.schedule != null ? { schedule: input.schedule } : {}),
    });

    const invitees = parseInviteeText(input.invitees);
    if (invitees.length === 0) {
      return { planId, imported: 0, sent: 0, failed: 0, errors: ['未提供有效的受访人员'] };
    }

    const importResult = await this.importInvitees(planId, invitees);

    let sent = 0;
    let failed = 0;
    if (input.publish === true) {
      const sendResult = await this.sendInvitations(planId);
      sent = sendResult.sent;
      failed = sendResult.failed;
    }

    return {
      planId,
      imported: importResult.success,
      sent,
      failed,
      errors: importResult.errors,
    };
  }
}
