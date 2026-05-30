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

export interface CreateAndPublishInput {
  name: string;
  description?: string;
  templateId: string;
  targetDate?: string;
  schedule?: string;
  invitees: string;
  publish?: boolean;
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

    // Deduplicate input invitees by userId
    const uniqueInvitees = new Map<string, InviteeData>();
    for (const inv of invitees) {
      uniqueInvitees.set(inv.userId, inv);
    }

    const interviews = [];
    for (const invitee of uniqueInvitees.values()) {
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
        inviteeData: Array.from(uniqueInvitees.values()) as unknown as Prisma.InputJsonValue,
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
      } catch {}
    }

    let sent = 0;
    let failed = 0;

    for (const interview of plan.interviews) {
      try {
        await this.sendInvitation(interview.userId, plan.name, invitationPrompt);
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

  /**
   * Create a plan, import invitees, and optionally send invitations in one step.
   */
  async createAndPublish(input: CreateAndPublishInput): Promise<{
    planId: string;
    imported: number;
    sent: number;
    failed: number;
    errors: string[];
  }> {
    const planId = await this.createPlan({
      name: input.name,
      description: input.description,
      templateId: input.templateId,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      schedule: input.schedule,
    });

    const invitees = parseInviteeText(input.invitees);
    if (invitees.length === 0) {
      return { planId, imported: 0, sent: 0, failed: 0, errors: ['未提供有效的受访人员'] };
    }

    const importResult = await this.importInvitees(planId, invitees);

    let sent = 0;
    let failed = 0;
    if (input.publish !== false) {
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

  async updatePlan(
    planId: string,
    input: {
      name?: string;
      description?: string;
      targetDate?: string;
      schedule?: string;
      invitees?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = { updatedBy: 'admin' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.targetDate !== undefined)
      updateData.targetDate = input.targetDate ? new Date(input.targetDate) : null;
    if (input.schedule !== undefined) updateData.schedule = input.schedule;

    if (input.invitees !== undefined) {
      const rawInvitees = parseInviteeText(input.invitees);

      // Deduplicate by userId to prevent duplicates from form input
      const uniqueInvitees = new Map<string, InviteeData>();
      for (const inv of rawInvitees) {
        uniqueInvitees.set(inv.userId, inv);
      }
      const newInvitees = Array.from(uniqueInvitees.values());
      const newIds = new Set(uniqueInvitees.keys());

      // Sync interviews: remove those no longer in the list, add new ones
      const existing = await this.prisma.interview.findMany({
        where: { planId },
        select: { id: true, userId: true },
      });

      // Find interviews to remove (exist in DB but not in new list)
      const toRemove = existing.filter((inv) => !newIds.has(inv.userId));

      // Find users to add (in new list but not in DB)
      const existingIds = new Set(existing.map((inv) => inv.userId));
      const toAdd = newInvitees.filter((inv) => !existingIds.has(inv.userId));

      if (toRemove.length > 0) {
        await this.prisma.interview.deleteMany({
          where: {
            id: { in: toRemove.map((inv) => inv.id) },
          },
        });
      }

      if (toAdd.length > 0) {
        const plan = await this.prisma.interviewPlan.findUnique({
          where: { id: planId },
          select: { templateId: true },
        });
        if (!plan) throw new Error(`Plan not found: ${planId}`);

        await this.prisma.interview.createMany({
          data: toAdd.map((inv) => ({
            userId: inv.userId,
            templateId: plan.templateId,
            planId,
            status: 'PENDING' as const,
          })),
        });
      }

      updateData.inviteeData = newInvitees as unknown as Prisma.InputJsonValue;
    }

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: updateData,
    });

    info('Interview plan updated', { planId });
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async findByIdWithTemplate(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true } } },
    });
  }

  async findByIdWithInterviewsAndCounts(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      include: {
        template: { select: { id: true, name: true } },
        interviews: {
          orderBy: { status: 'asc' },
          select: { id: true, userId: true, status: true, createdAt: true, completedAt: true },
        },
        _count: { select: { interviews: true } },
      },
    });
  }

  async findByIdWithDeleteChecks(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      include: { _count: { select: { interviews: true, batchReports: true } } },
    });
  }

  async findAllForSelect(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.interviewPlan.findMany({
      select: { id: true, name: true },
    });
  }

  async deletePlan(id: string): Promise<void> {
    await this.prisma.interviewPlan.delete({ where: { id } });
  }

  async countByStatusForTemplate(templateId: string): Promise<{
    counts: Record<string, number>;
    total: number;
  }> {
    const groups = await this.prisma.interviewPlan.groupBy({
      by: ['status'],
      where: { templateId },
      _count: true,
    });
    const counts = Object.fromEntries(groups.map((g) => [g.status, g._count as number]));
    const total = groups.reduce((sum, g) => sum + (g._count as number), 0);
    return { counts, total };
  }
}

/**
 * Parse invitee text input into InviteeData array.
 * Format: one user per line, "userId [name]"
 * Lines starting with '#' are comments (ignored).
 * Empty lines are skipped.
 */
export function parseInviteeText(text: string): InviteeData[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      const userId = parts[0];
      const name = parts.length > 1 ? parts.slice(1).join(' ') : '';
      return { userId, name };
    });
}
