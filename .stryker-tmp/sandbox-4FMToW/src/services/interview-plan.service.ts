// @ts-nocheck
import { PlanStatus, Prisma, PrismaClient } from '@prisma/client';
import { messageSender } from '../integrations/dingtalk/message-sender.js';
import { error, info } from '../utils/logger.js';

export interface CreatePlanInput {
  name: string;
  description?: string;
  templateId: string;
  targetDate?: Date;
  schedule?: string;
}

export interface InviteeData {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export class InterviewPlanService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  async createPlan(input: CreatePlanInput): Promise<string> {
    const plan = await this.prisma.interviewPlan.create({
      data: {
        name: input.name,
        description: input.description,
        templateId: input.templateId,
        targetDate: input.targetDate,
        schedule: input.schedule,
        status: PlanStatus.PENDING,
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
    info('Interview plan created', { planId: plan.id, name: input.name });
    return plan.id;
  }

  async getPlan(planId: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id: planId },
      include: {
        template: true,
        interviews: {
          select: {
            id: true,
            userId: true,
            status: true,
            completedAt: true,
          },
        },
      },
    });
  }

  async listPlans(options?: {
    status?: PlanStatus;
    limit?: number;
    offset?: number;
  }) {
    const where = options?.status ? { status: options.status } : {};
    const [plans, total] = await Promise.all([
      this.prisma.interviewPlan.findMany({
        where,
        include: { template: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
      }),
      this.prisma.interviewPlan.count({ where }),
    ]);
    return { plans, total };
  }

  async importInvitees(planId: string, invitees: InviteeData[]): Promise<ImportResult> {
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const existingUserIds = new Set(
      (
        await this.prisma.interview.findMany({
          where: { planId },
          select: { userId: true },
        })
      ).map((i) => i.userId)
    );

    const interviews = [];
    for (const invitee of invitees) {
      if (existingUserIds.has(invitee.userId)) {
        result.failed++;
        result.errors.push(`User ${invitee.userId} already exists in plan`);
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
        inviteeData: invitees as unknown as Prisma.InputJsonValue,
        status: PlanStatus.READY,
        updatedBy: 'admin',
      },
    });

    info('Invitees imported', {
      planId,
      success: result.success,
      failed: result.failed,
    });
    return result;
  }

  async sendInvitations(planId: string): Promise<{ sent: number; failed: number }> {
    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id: planId },
      include: {
        interviews: {
          where: { status: 'PENDING' },
        },
      },
    });

    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    let sent = 0;
    let failed = 0;

    for (const interview of plan.interviews) {
      try {
        await this.sendInvitation(interview.userId, plan.name);
        sent++;
      } catch (err) {
        failed++;
        error('Failed to send invitation', {
          planId,
          userId: interview.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: {
        status: PlanStatus.RUNNING,
        sentCount: { increment: sent },
        failedCount: { increment: failed },
        startedAt: plan.startedAt || new Date(),
        updatedBy: 'admin',
      },
    });

    info('Invitations sent', { planId, sent, failed });
    return { sent, failed };
  }

  private async sendInvitation(userId: string, planName: string): Promise<void> {
    await messageSender.sendTextMessage(
      [userId],
      `您被邀请参与「${planName}」访谈。请直接在钉钉中回复 OpenClaw小钉 任意消息（如"你好"或"开始"）即可开始访谈。`
    );
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    const updateData: Record<string, unknown> = { status, updatedBy: 'admin' };
    if (status === PlanStatus.COMPLETED) {
      updateData.completedAt = new Date();
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
