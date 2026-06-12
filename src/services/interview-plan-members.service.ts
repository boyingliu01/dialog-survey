import { Prisma, SendStatus } from '@prisma/client';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info } from '../utils/logger.js';
import { InterviewPlanSendService } from './interview-plan-send.service.js';
import type { InviteeData } from './interview-plan-base.service.js';

export class PlanNotFoundError extends Error {
  readonly code = 'PLAN_NOT_FOUND' as const;
  constructor(planId: string) {
    super(`Plan not found: ${planId}`);
    this.name = 'PlanNotFoundError';
  }
}

export class InterviewNotFoundError extends Error {
  readonly code = 'INTERVIEW_NOT_FOUND' as const;
  constructor(interviewId: string) {
    super(`Interview not found: ${interviewId}`);
    this.name = 'InterviewNotFoundError';
  }
}

export class MemberConflictError extends Error {
  readonly code = 'MEMBER_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MemberConflictError';
  }
}

export class InvalidStateError extends Error {
  readonly code = 'INVALID_STATE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

export class InterviewPlanService extends InterviewPlanSendService {
  async addMember(planId: string, userId: string, name: string): Promise<{ interviewId: string }> {
    const newInterviewId = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new PlanNotFoundError(planId);
      }

      const existing = await tx.interview.findFirst({
        where: { planId, userId },
      });
      if (existing) {
        throw new MemberConflictError(`Member already exists in plan: ${userId}`);
      }

      const interview = await tx.interview.create({
        data: {
          userId,
          templateId: plan.templateId,
          planId,
          status: 'PENDING' as const,
        },
      });

      const existingInvitees = Array.isArray(plan.inviteeData)
        ? (plan.inviteeData as unknown as InviteeData[])
        : [];
      const updatedInvitees = [...existingInvitees, { userId, name }];

      await tx.interviewPlan.update({
        where: { id: planId },
        data: {
          inviteeData: updatedInvitees as unknown as Prisma.InputJsonValue,
          updatedBy: 'admin',
        },
      });

      return interview.id;
    });

    info('Member added to plan', { planId, userId, interviewId: newInterviewId });
    return { interviewId: newInterviewId };
  }

  async removeMember(planId: string, interviewId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.findUnique({ where: { id: interviewId } });
      if (!interview) {
        throw new InterviewNotFoundError(interviewId);
      }
      if (interview.planId !== planId) {
        throw new InvalidStateError(`Interview does not belong to plan: ${interviewId}`);
      }
      if (interview.status === 'COMPLETED') {
        throw new InvalidStateError(`Cannot remove completed interview: ${interviewId}`);
      }

      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new PlanNotFoundError(planId);
      }

      const wasCounted =
        interview.sendStatus === SendStatus.SENT || interview.sendStatus === SendStatus.FAILED;
      const wasFailed = interview.sendStatus === SendStatus.FAILED;

      await tx.interview.delete({ where: { id: interviewId } });

      const existingInvitees = Array.isArray(plan.inviteeData)
        ? (plan.inviteeData as unknown as InviteeData[])
        : [];
      const updatedInvitees = existingInvitees.filter((inv) => inv.userId !== interview.userId);

      const planUpdate: Prisma.InterviewPlanUpdateInput = {
        inviteeData: updatedInvitees as unknown as Prisma.InputJsonValue,
        updatedBy: 'admin',
      };
      if (wasCounted) {
        planUpdate.sentCount = { decrement: 1 };
      }
      if (wasFailed) {
        planUpdate.failedCount = { decrement: 1 };
      }

      await tx.interviewPlan.update({
        where: { id: planId },
        data: planUpdate,
      });

      info('Member removed from plan', {
        planId,
        interviewId,
        userId: interview.userId,
        wasCounted,
        wasFailed,
      });
    });
  }

  async sendReminder(
    planId: string,
    interviewId?: string
  ): Promise<{ reminded: number; failed: number }> {
    const plan = await this.prisma.interviewPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new PlanNotFoundError(planId);
    }

    let targets: Array<{ id: string; userId: string }>;
    if (interviewId) {
      const interview = await this.prisma.interview.findUnique({ where: { id: interviewId } });
      if (!interview || interview.planId !== planId) {
        throw new InterviewNotFoundError(interviewId);
      }
      if (interview.status === 'COMPLETED' || interview.status === 'CANCELLED') {
        return { reminded: 0, failed: 0 };
      }
      targets = [{ id: interview.id, userId: interview.userId }];
    } else {
      targets = await this.prisma.interview.findMany({
        where: {
          planId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        select: { id: true, userId: true },
      });
    }

    if (targets.length === 0) {
      return { reminded: 0, failed: 0 };
    }

    const message = `【访谈提醒】您参与的访谈 "${plan.name}" 尚未完成，请抽空回复访谈邀约消息继续完成。`;
    const concurrency = 10;
    let reminded = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((target) => messageSender.sendTextMessage([target.userId], message))
      );
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          reminded++;
        } else {
          failed++;
          const errMsg = result.reason instanceof Error ? result.reason.message : 'send failed';
          error('Reminder send failed', {
            planId,
            userId: batch[j].userId,
            error: errMsg,
          });
        }
      }
    }

    info('Reminders sent', { planId, reminded, failed });
    return { reminded, failed };
  }
}
