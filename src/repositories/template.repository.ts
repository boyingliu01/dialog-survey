import { PrismaClient, Template, TemplateStatus } from '@prisma/client';

export class TemplateRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async create(data: {
    name: string;
    content: Record<string, unknown>;
    description?: string;
  }): Promise<Template> {
    return this.prisma.template.create({
      data: {
        name: data.name,
        description: data.description,
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
    const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
    if (data.name) updateData.name = data.name;
    if (data.description) updateData.description = data.description;
    if (data.content) updateData.content = JSON.stringify(data.content);
    if (data.status) updateData.status = data.status;
    updateData.updatedBy = 'admin';

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
    const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
    if (data.name) updateData.name = data.name;
    if (data.description) updateData.description = data.description;
    if (data.content) updateData.content = JSON.stringify(data.content);
    if (data.status) updateData.status = data.status as TemplateStatus;
    updateData.version = { increment: 1 };
    updateData.updatedBy = 'admin';

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

    const interviews = {
      active: 0,
      pending: 0,
      waiting: 0,
      completed: 0,
      cancelled: 0,
      total: 0,
    };

    for (const group of interviewGroups) {
      const count = group._count;
      switch (group.status) {
        case 'ACTIVE':
          interviews.active = count;
          break;
        case 'PENDING':
          interviews.pending = count;
          break;
        case 'WAITING':
          interviews.waiting = count;
          break;
        case 'COMPLETED':
          interviews.completed = count;
          break;
        case 'CANCELLED':
          interviews.cancelled = count;
          break;
      }
    }
    interviews.total =
      interviews.active +
      interviews.pending +
      interviews.waiting +
      interviews.completed +
      interviews.cancelled;

    const plans = {
      running: 0,
      pending: 0,
      ready: 0,
      paused: 0,
      completed: 0,
      total: 0,
    };

    for (const group of planGroups) {
      const count = group._count;
      switch (group.status) {
        case 'RUNNING':
          plans.running = count;
          break;
        case 'PENDING':
          plans.pending = count;
          break;
        case 'READY':
          plans.ready = count;
          break;
        case 'PAUSED':
          plans.paused = count;
          break;
        case 'COMPLETED':
          plans.completed = count;
          break;
      }
    }
    plans.total = plans.running + plans.pending + plans.ready + plans.paused + plans.completed;

    const safeToDelete =
      interviews.active === 0 &&
      interviews.pending === 0 &&
      interviews.waiting === 0 &&
      plans.running === 0 &&
      plans.pending === 0 &&
      plans.ready === 0 &&
      plans.paused === 0;

    return {
      templateId,
      templateName: template.name,
      interviews,
      plans,
      reportCount,
      safeToDelete,
    };
  }
}
