import { summarizeStatusGroups } from '../repositories/status-counts.js';
import { info } from '../utils/logger.js';
import { PlanStatus, type PrismaClient } from '../utils/prisma-client.js';

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

/** The editable fields of a plan, as the update endpoint accepts them. */
interface PlanUpdateInput {
  name?: string;
  description?: string;
  targetDate?: string;
  schedule?: string;
}

/**
 * The Prisma update payload for a plan edit.
 *
 * Only the keys the caller actually sent are included -- `undefined` means "leave
 * this alone", not "clear it", so an edit form that submits one field cannot blank
 * the rest. Clearing is expressed by sending an empty value, which is why
 * `targetDate` maps `''` to null instead of being dropped.
 */
function planUpdateData(input: PlanUpdateInput): Record<string, unknown> {
  const data: Record<string, unknown> = { updatedBy: 'admin' };
  if (input.name !== undefined) data['name'] = input.name;
  if (input.description !== undefined) data['description'] = input.description;
  if (input.targetDate !== undefined) data['targetDate'] = parseTargetDate(input.targetDate);
  if (input.schedule !== undefined) data['schedule'] = input.schedule;
  return data;
}

/**
 * A target date as a Date, or null to clear it.
 *
 * `''` means the admin emptied the field, and null is how a nullable column is
 * cleared. A non-empty but unparseable value still produces an Invalid Date here;
 * validation happens at the route, so this stays a straight conversion rather than
 * silently substituting today.
 */
function parseTargetDate(value: string): Date | null {
  return value ? new Date(value) : null;
}

export class InterviewPlanServiceBase {
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for InterviewPlanServiceBase');
    }
    this.prisma = prisma;
  }

  // archlint-disable-next-line
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

  // archlint-disable-next-line
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

  // archlint-disable-next-line
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

  async updatePlan(planId: string, input: PlanUpdateInput): Promise<void> {
    const updateData = planUpdateData(input);

    await this.prisma.interviewPlan.update({
      where: { id: planId },
      data: updateData,
    });

    info('Interview plan updated', { planId });
  }

  // archlint-disable-next-line
  async findByIdWithTemplate(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true } } },
    });
  }

  // archlint-disable-next-line
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

  // archlint-disable-next-line
  async findByIdWithDeleteChecks(id: string) {
    return this.prisma.interviewPlan.findUnique({
      where: { id },
      include: { _count: { select: { interviews: true, batchReports: true } } },
    });
  }

  // archlint-disable-next-line
  async findAllForSelect(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.interviewPlan.findMany({
      select: { id: true, name: true },
    });
  }

  // archlint-disable-next-line
  async deletePlan(id: string): Promise<void> {
    await this.prisma.interviewPlan.delete({ where: { id } });
  }

  // archlint-disable-next-line
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

  // archlint-disable-next-line
  async countByStatusForTemplate(templateId: string): Promise<{
    counts: Record<string, number>;
    total: number;
  }> {
    const groups = await this.prisma.interviewPlan.groupBy({
      by: ['status'],
      where: { templateId },
      _count: true,
    });
    return summarizeStatusGroups(groups);
  }
}
