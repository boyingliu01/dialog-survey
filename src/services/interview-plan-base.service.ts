import { PlanStatus, Prisma, PrismaClient } from '@prisma/client';
import type { DingTalkClient } from '../integrations/dingtalk/client.js';
import { info } from '../utils/logger.js';

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
  userId?: string;
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

/**
 * Parse invitee text input into InviteeData array.
 * Format: one user per line, "userId [name]" or "phone [name]"
 * Phone format: 11-digit starting with 1 (e.g. "13800138000 张三")
 * Lines starting with '#' are comments (ignored).
 */
export function parseInviteeText(text: string): InviteeData[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      const first = parts[0];
      const name = parts.length > 1 ? parts.slice(1).join(' ') : '';

      // Phone format: strip +86 prefix, then check 11-digit pattern
      // First strip all non-digit characters, then handle country code
      const digits = first.replace(/\D/g, '');
      const stripped = digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
      const isPhone = /^1[3-9]\d{9}$/.test(stripped);

      if (isPhone) {
        return { phone: stripped, name };
      }
      return { userId: first, name };
    });
}

export class InterviewPlanServiceBase {
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for InterviewPlanServiceBase');
    }
    this.prisma = prisma;
  }

  async createPlan(input: CreatePlanInput): Promise<string> {
    const plan = await this.prisma.interviewPlan.create({
      data: {
        name: input.name,
        ...(input.description != null ? { description: input.description } : {}),
        templateId: input.templateId,
        ...(input.targetDate != null ? { targetDate: input.targetDate } : {}),
        ...(input.schedule != null ? { schedule: input.schedule } : {}),
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
            sendStatus: true,
            sentAt: true,
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

  async updatePlan(
    planId: string,
    input: {
      name?: string;
      description?: string;
      targetDate?: string;
      schedule?: string;
      invitees?: string;
    },
    dingtalkClient?: DingTalkClient
  ): Promise<void> {
    const updateData: Record<string, unknown> = { updatedBy: 'admin' };
    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.targetDate !== undefined)
      updateData['targetDate'] = input.targetDate ? new Date(input.targetDate) : null;
    if (input.schedule !== undefined) updateData['schedule'] = input.schedule;

    if (input.invitees !== undefined) {
      const rawInvitees = parseInviteeText(input.invitees);

      // Resolve phone entries to userId via DingTalk API
      const resolvedInvitees: InviteeData[] = [];
      for (const inv of rawInvitees) {
        if (inv.phone && !inv.userId && dingtalkClient) {
          try {
            const lookup = await dingtalkClient.getUserIdByMobile(inv.phone);
            if (lookup.found) {
              resolvedInvitees.push({ userId: lookup.userId, name: inv.name || lookup.name });
            } else {
              resolvedInvitees.push(inv);
            }
          } catch {
            resolvedInvitees.push(inv);
          }
        } else {
          resolvedInvitees.push(inv);
        }
      }

      const uniqueInvitees = new Map<string, InviteeData>();
      for (const inv of resolvedInvitees) {
        const key = inv.userId ?? inv.phone ?? 'unknown';
        uniqueInvitees.set(key, inv);
      }
      const newInvitees = Array.from(uniqueInvitees.values());
      const newIds = new Set(uniqueInvitees.keys());

      const existing = await this.prisma.interview.findMany({
        where: { planId },
        select: { id: true, userId: true },
      });

      const toRemove = existing.filter((inv) => !newIds.has(inv.userId));

      const existingIds = new Set(existing.map((inv) => inv.userId));
      const toAdd = newInvitees.filter(
        (inv): inv is InviteeData & { userId: string } =>
          inv.userId !== undefined && !existingIds.has(inv.userId)
      );

      if (toRemove.length > 0) {
        await this.prisma.interview.deleteMany({
          where: { id: { in: toRemove.map((inv) => inv.id) } },
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

      updateData['inviteeData'] = newInvitees as unknown as Prisma.InputJsonValue;
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
          select: {
            id: true,
            userId: true,
            status: true,
            createdAt: true,
            completedAt: true,
            sendStatus: true,
            sentAt: true,
            sendError: true,
          },
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

  async deletePlanWithInterviews(id: string): Promise<{
    planName: string;
    interviewCount: number;
    batchReportCount: number;
  }> {
    const plan = await this.prisma.interviewPlan.findUnique({
      where: { id },
      include: { _count: { select: { interviews: true, batchReports: true } } },
    });

    if (!plan) {
      throw new Error(`Plan not found: ${id}`);
    }

    const interviewCount = plan._count.interviews;
    const batchReportCount = plan._count.batchReports;

    if (interviewCount > 0) {
      const interviewIds = (
        await this.prisma.interview.findMany({ where: { planId: id }, select: { id: true } })
      ).map((i) => i.id);

      await this.prisma.analysisReport.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await this.prisma.analysisFailure.deleteMany({
        where: { interviewId: { in: interviewIds } },
      });
      await this.prisma.message.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await this.prisma.response.deleteMany({ where: { interviewId: { in: interviewIds } } });
      await this.prisma.interview.deleteMany({ where: { planId: id } });
    }

    await this.prisma.batchAnalysisReport.deleteMany({ where: { planId: id } });
    await this.prisma.interviewPlan.delete({ where: { id } });

    info('Plan cascade deleted', {
      planId: id,
      planName: plan.name,
      interviewCount,
      batchReportCount,
    });

    return {
      planName: plan.name,
      interviewCount,
      batchReportCount,
    };
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
