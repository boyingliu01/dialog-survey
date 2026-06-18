import { SendStatus } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info } from '../utils/logger.js';
import type { InviteeData } from './interview-plan-base.service.js';
import { InterviewPlanSendService } from './interview-plan-send.service.js';

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

export class MemberNotFoundError extends Error {
  readonly code = 'MEMBER_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MemberNotFoundError';
  }
}

export class InvalidMemberInputError extends Error {
  readonly code = 'INVALID_MEMBER_INPUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMemberInputError';
  }
}

export class InvalidStateError extends Error {
  readonly code = 'INVALID_STATE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function normalizePhone(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If starts with 86 and has 13 digits (86 + 11-digit mobile), strip country code
  if (digits.startsWith('86') && digits.length === 13) {
    return digits.slice(2);
  }
  return digits;
}

export interface AddMemberInput {
  userId?: string;
  phone?: string;
  name?: string;
}

export class InterviewPlanService extends InterviewPlanSendService {
  private dingTalkClient: DingTalkClient;

  constructor(prisma?: PrismaClient, dingTalkClient?: DingTalkClient) {
    super(prisma);
    this.dingTalkClient = dingTalkClient ?? DingTalkClient.fromEnv();
  }

  async addMember(planId: string, input: AddMemberInput): Promise<{ interviewId: string }> {
    let { userId, name } = input;
    const { phone } = input;

    // Validate: at least one of userId or phone must be provided
    if (!userId && !phone) {
      throw new InvalidMemberInputError('Either userId or phone is required');
    }

    // If userId provided, ignore phone entirely - skip DingTalk call
    if (!userId && phone) {
      // Resolve userId from phone via DingTalk API
      const normalizedPhone = normalizePhone(phone);
      
      // Validate normalized phone is 11-digit Chinese mobile
      if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
        throw new InvalidMemberInputError(
          `Invalid phone number format. After normalization, got: ${normalizedPhone}. Expected: 11-digit Chinese mobile (e.g., 13800138000)`
        );
      }
      
      let lookupResult: Awaited<ReturnType<DingTalkClient['getUserIdByMobile']>>;
      try {
        lookupResult = await this.dingTalkClient.getUserIdByMobile(normalizedPhone);
      } catch {
        throw new MemberNotFoundError(
          `Phone number ${maskPhone(phone)} could not be resolved — DingTalk service unavailable`
        );
      }

      if (!lookupResult.found) {
        throw new MemberNotFoundError(`Phone number ${maskPhone(phone)} not found in DingTalk`);
      }

      userId = lookupResult.userId;
      // If name not provided by client, use name from DingTalk API response
      if (!name) {
        name = lookupResult.name;
      }
    }

    if (!userId) {
      throw new InvalidMemberInputError('userId is required after phone resolution');
    }

    const newInterviewId = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new PlanNotFoundError(planId);
      }

      // Check userId conflict first
      const existingByUserId = await tx.interview.findFirst({
        where: { planId, userId },
      });
      if (existingByUserId) {
        throw new MemberConflictError(`Member already exists in plan: ${userId}`);
      }

      // Phone mode: check phone conflict in inviteeData JSON
      if (phone) {
        const normalizedPhone = normalizePhone(phone);
        const existingInvitees = Array.isArray(plan.inviteeData)
          ? (plan.inviteeData as unknown as InviteeData[])
          : [];

        const existingByPhone = existingInvitees.find(
          (inv) => inv.phone && normalizePhone(inv.phone) === normalizedPhone
        );
        if (existingByPhone) {
          throw new MemberConflictError(
            `Member with phone ${maskPhone(phone)} already exists in plan`
          );
        }
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

      // Only save phone to inviteeData if we're in phone mode (not userId-only mode)
      const updatedInvitees = phone
        ? [...existingInvitees, { userId, name, phone: normalizePhone(phone) }]
        : [...existingInvitees, { userId, name }];

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
