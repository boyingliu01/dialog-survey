import { type PrismaClient, type Template, TemplateStatus } from '../utils/prisma-client.js';

/** Interview counts per template usage report. */
export interface InterviewUsage {
  active: number;
  pending: number;
  waiting: number;
  completed: number;
  cancelled: number;
  total: number;
}

/** Plan counts per template usage report. */
export interface PlanUsage {
  running: number;
  pending: number;
  ready: number;
  paused: number;
  completed: number;
  total: number;
}

/**
 * Map each Prisma status onto the bucket it tallies into.
 *
 * A lookup table replaces the two `switch` blocks this method used to carry: the
 * statuses are data, and stating them declaratively keeps an unknown status from
 * silently widening a branch that returns nothing.
 */
const INTERVIEW_STATUS_BUCKET: Record<string, keyof Omit<InterviewUsage, 'total'>> = {
  ACTIVE: 'active',
  PENDING: 'pending',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const PLAN_STATUS_BUCKET: Record<string, keyof Omit<PlanUsage, 'total'>> = {
  RUNNING: 'running',
  PENDING: 'pending',
  READY: 'ready',
  PAUSED: 'paused',
  COMPLETED: 'completed',
};

/** Count interview statuses into the usage report shape. */
export function tallyInterviewStatuses(
  groups: Array<{ status: string; _count: number }>
): InterviewUsage {
  const usage: InterviewUsage = {
    active: 0,
    pending: 0,
    waiting: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };
  for (const group of groups) {
    const bucket = INTERVIEW_STATUS_BUCKET[group.status];
    if (bucket) usage[bucket] = group._count;
  }
  usage.total = totalInterviewUsage(usage);
  return usage;
}

/** Count plan statuses into the usage report shape. */
export function tallyPlanStatuses(groups: Array<{ status: string; _count: number }>): PlanUsage {
  const usage: PlanUsage = {
    running: 0,
    pending: 0,
    ready: 0,
    paused: 0,
    completed: 0,
    total: 0,
  };
  for (const group of groups) {
    const bucket = PLAN_STATUS_BUCKET[group.status];
    if (bucket) usage[bucket] = group._count;
  }
  usage.total = usage.running + usage.pending + usage.ready + usage.paused + usage.completed;
  return usage;
}

/** Total interviews of every status. */
export function totalInterviewUsage(usage: InterviewUsage): number {
  return usage.active + usage.pending + usage.waiting + usage.completed + usage.cancelled;
}

/**
 * Interviews that are still in flight.
 *
 * Finished and cancelled interviews do not block deleting their template, which
 * is why this is distinct from `totalInterviewUsage`: deletion is about live
 * conversations, not historical records.
 */
export function totalActiveInterviewUsage(usage: InterviewUsage): number {
  return usage.active + usage.pending + usage.waiting;
}

/** Plans that would block deleting a template (completed ones do not). */
export function totalActivePlanUsage(usage: PlanUsage): number {
  return usage.running + usage.pending + usage.ready + usage.paused;
}

export class TemplateRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for TemplateRepository');
    }
    this.prisma = prisma;
  }

  /** Build Prisma update data object from partial template data (DRY) */
  private _buildUpdateData(
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status: TemplateStatus;
    }>,
    options?: { incrementVersion?: boolean }
  ): Parameters<typeof this.prisma.template.update>[0]['data'] {
    const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
    if (data.name) updateData.name = data.name;
    if (data.description) updateData.description = data.description;
    if (data.content) updateData.content = JSON.stringify(data.content);
    if (data.status) updateData.status = data.status as TemplateStatus;
    if (options?.incrementVersion) {
      updateData.version = { increment: 1 };
    }
    updateData.updatedBy = 'admin';
    return updateData;
  }

  async create(data: {
    name: string;
    content: Record<string, unknown>;
    description?: string;
  }): Promise<Template> {
    return this.prisma.template.create({
      data: {
        name: data.name,
        ...(data.description != null ? { description: data.description } : {}),
        content: JSON.stringify(data.content),
        version: 1,
        status: TemplateStatus.DRAFT,
        createdBy: 'admin',
        updatedBy: 'admin',
      },
    });
  }

  async findAll(): Promise<Template[]> {
    return this.prisma.template.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Template | null> {
    return this.prisma.template.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status: TemplateStatus;
    }>
  ): Promise<Template> {
    const updateData = this._buildUpdateData(data);

    return this.prisma.template.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.template.delete({
      where: { id },
    });
    return true;
  }

  async findByStatus(status: TemplateStatus): Promise<Template[]> {
    return this.prisma.template.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementVersion(id: string): Promise<Template> {
    const template = await this.findById(id);
    if (!template) throw new Error('Template not found');

    return this.prisma.template.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }

  async getVersion(id: string): Promise<{ id: string; version: number } | null> {
    const template = await this.findById(id);
    if (!template) return null;
    return { id: template.id, version: template.version };
  }

  async getVersionHistory(
    id: string
  ): Promise<Array<{ id: string; version: number; createdAt: Date }>> {
    const template = await this.findById(id);
    if (!template) throw new Error('Template not found');

    return [
      {
        id: template.id,
        version: template.version,
        createdAt: template.createdAt,
      },
    ];
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status?: string;
    }>
  ): Promise<Template> {
    const updateData = this._buildUpdateData(data as Record<string, unknown>, {
      incrementVersion: true,
    });

    return this.prisma.template.update({
      where: { id, version: expectedVersion },
      data: updateData,
    });
  }

  async findAllForAdminTree() {
    return this.prisma.template.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        version: true,
        createdAt: true,
        _count: { select: { interviewPlans: true, interviews: true } },
        interviewPlans: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            completedCount: true,
            sentCount: true,
            createdAt: true,
            _count: { select: { interviews: true } },
            interviews: {
              orderBy: { createdAt: 'desc' },
              take: 15,
              select: { id: true, userId: true, status: true, completedAt: true },
            },
          },
        },
      },
    });
  }

  async findAllForSelect(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.template.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async findByIdWithCounts(id: string) {
    return this.prisma.template.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        content: true,
        _count: { select: { interviewPlans: true, interviews: true } },
      },
    });
  }

  async publish(id: string): Promise<Template> {
    return this.prisma.template.update({
      where: { id },
      data: { status: TemplateStatus.PUBLISHED, updatedAt: new Date() },
    });
  }

  async deleteAndVerify(id: string): Promise<boolean> {
    await this.prisma.template.delete({ where: { id } });
    const verify = await this.prisma.template.findUnique({ where: { id } });
    return verify === null;
  }

  async findAllPaginated(
    page: number,
    limit: number
  ): Promise<{ items: Template[]; total: number; page: number; limit: number }> {
    const [items, total] = await Promise.all([
      this.prisma.template.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.template.count(),
    ]);

    return { items, total, page, limit };
  }

  async getUsageStats(templateId: string): Promise<{
    templateId: string;
    templateName: string;
    interviews: {
      active: number;
      pending: number;
      waiting: number;
      completed: number;
      cancelled: number;
      total: number;
    };
    plans: {
      running: number;
      pending: number;
      ready: number;
      paused: number;
      completed: number;
      total: number;
    };
    reportCount: number;
    safeToDelete: boolean;
  }> {
    const [template, interviewGroups, planGroups, reportCount] = await Promise.all([
      this.prisma.template.findUnique({
        where: { id: templateId },
        select: { name: true },
      }),
      this.prisma.interview.groupBy({
        by: ['status'],
        where: { templateId },
        _count: true,
      }),
      this.prisma.interviewPlan.groupBy({
        by: ['status'],
        where: { templateId },
        _count: true,
      }),
      this.prisma.batchAnalysisReport.count({ where: { templateId } }),
    ]);

    if (!template) {
      throw new Error('Template not found');
    }

    const interviews = tallyInterviewStatuses(interviewGroups);
    const plans = tallyPlanStatuses(planGroups);

    return {
      templateId,
      templateName: template.name,
      interviews,
      plans,
      reportCount,
      safeToDelete:
        totalActiveInterviewUsage(interviews) === 0 && totalActivePlanUsage(plans) === 0,
    };
  }
}
