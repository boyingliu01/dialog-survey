import { SendStatus } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { DingTalkStreamClient } from '../integrations/dingtalk/stream-client.js';
import type { TokenManager } from '../integrations/dingtalk/token-manager.js';
import { error, info } from '../utils/logger.js';
import type { InviteeData } from './interview-plan-base.service.js';
import { InterviewPlanSendService } from './interview-plan-send.service.js';
import { verifyPhoneToName } from './member-verification.service.js';

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
  private streamClient?: DingTalkStreamClient | undefined;
  private tokenManager?: TokenManager | undefined;

  constructor(
    prisma: PrismaClient,
    dingTalkClient?: DingTalkClient,
    streamClient?: DingTalkStreamClient,
    tokenManager?: TokenManager
  ) {
    super(prisma);
    this.dingTalkClient = dingTalkClient ?? DingTalkClient.fromEnv();
    this.streamClient = streamClient;
    this.tokenManager = tokenManager;
  }

  async addMember(planId: string, input: AddMemberInput): Promise<{ interviewId: string }> {
    let { userId, name } = input;
    const { phone } = input;

    // Validate: at least one of userId or phone must be provided
    if (!userId && !phone) {
      throw new InvalidMemberInputError('请填写钉钉 ID 或手机号');
    }

    // If userId provided, ignore phone entirely - skip DingTalk call
    if (!userId && phone) {
      const result = await verifyPhoneToName(this.dingTalkClient, phone, name);

      if (!result.verified) {
        throw new InvalidMemberInputError(
          result.reason || `Failed to verify phone ${maskPhone(phone)}`
        );
      }

      userId = result.userId;
      name = result.name || name;
    }

    if (!userId) {
      throw new InvalidMemberInputError('手机号验证失败，未获取到用户身份');
    }

    const newInterviewId = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.interviewPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new PlanNotFoundError(planId);
      }

      // Check userId conflict: same user in same plan OR has active interview in another plan
      const existingByUserId = await tx.interview.findFirst({
        where: { planId, userId },
      });
      if (existingByUserId) {
        throw new MemberConflictError('该成员已在访谈计划中');
      }

      const activeInOtherPlan = await tx.interview.findFirst({
        where: {
          userId,
          planId: { not: planId },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        select: { planId: true },
      });
      if (activeInOtherPlan) {
        throw new MemberConflictError('该成员已有尚未完成的访谈');
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
        throw new InvalidStateError('该访谈记录不属于此计划');
      }
      if (interview.status === 'COMPLETED') {
        throw new InvalidStateError('无法删除已完成的访谈');
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

    const useSingleChat = !!(this.streamClient && this.tokenManager);
    let reminded = 0;
    let failed = 0;

    if (useSingleChat) {
      const client = this.streamClient as DingTalkStreamClient;
      const tokenMgr = this.tokenManager as TokenManager;
      const accessToken = await tokenMgr.getAccessToken();
      for (const target of targets) {
        const result = await client.sendSingleChatMarkdown(
          target.userId,
          '访谈提醒',
          `**访谈提醒**\n\n您参与的访谈 **"${plan.name}"** 尚未完成，请在本聊天中回复任意消息继续完成访谈。`,
          accessToken
        );
        if (result.success) {
          reminded++;
        } else {
          failed++;
          error('Reminder send failed (single chat)', {
            planId,
            userId: target.userId,
            error: result.error,
          });
        }
      }
    } else {
      const message = `【访谈提醒】您参与的访谈 "${plan.name}" 尚未完成，请抽空回复访谈邀约消息继续完成。`;
      const concurrency = 10;
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
    }

    info('Reminders sent', {
      planId,
      reminded,
      failed,
      channel: useSingleChat ? 'single-chat' : 'work-notification',
    });
    return { reminded, failed };
  }

  protected async sendInvitation(
    userId: string,
    planName: string,
    invitationPrompt: string
  ): Promise<void> {
    const client = this.streamClient;
    const tokenMgr = this.tokenManager;
    if (client && tokenMgr) {
      const token = await tokenMgr.getAccessToken();
      const title = '访谈邀请';
      const body = invitationPrompt
        ? `${invitationPrompt}\n\n> 来自「${planName}」访谈`
        : `您被邀请参与 **"${planName}"** 访谈。请在聊天中回复任意消息即可开始访谈。`;
      const result = await client.sendSingleChatMarkdown(userId, title, body, token);
      if (!result.success) {
        throw new Error(`DingTalk single chat failed: ${result.error || 'unknown'}`);
      }
      return;
    }

    return super.sendInvitation(userId, planName, invitationPrompt);
  }

  async updatePlan(
    planId: string,
    input: {
      name?: string;
      description?: string;
      targetDate?: string;
      schedule?: string;
    }
  ): Promise<void> {
    return super.updatePlan(planId, input);
  }
}
