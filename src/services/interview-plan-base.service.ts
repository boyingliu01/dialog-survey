import { PlanStatus, type PrismaClient } from '@prisma/client';
import { info } from '../utils/logger.js';

export interface CreatePlanInput {
  name: string;
  description?: string;
  templateId: string;
  targetDate?: Date;
  schedule?: string;
}

export interface InviteeData {
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
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
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = { updatedBy: 'admin' };
    // biome-ignore lint/complexity/useLiteralKeys: Record<string,unknown> requires bracket notation per TS4111
    if (input.name !== undefined) updateData['name'] = input.name;
    // biome-ignore lint/complexity/useLiteralKeys: Record<string,unknown> requires bracket notation per TS4111
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.targetDate !== undefined)
      // biome-ignore lint/complexity/useLiteralKeys: Record<string,unknown> requires bracket notation per TS4111
      updateData['targetDate'] = input.targetDate ? new Date(input.targetDate) : null;
    // biome-ignore lint/complexity/useLiteralKeys: Record<string,unknown> requires bracket notation per TS4111
    if (input.schedule !== undefined) updateData['schedule'] = input.schedule;

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: updateData,
    });

    info('Interview plan updated', { planId });
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
