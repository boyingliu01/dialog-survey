import type { PrismaClient } from '@prisma/client';

export class InterviewRepository {
  constructor(private prisma: PrismaClient) {}

  async countByStatusForTemplate(templateId: string): Promise<{
    counts: Record<string, number>;
    total: number;
  }> {
    const groups = await this.prisma.interview.groupBy({
      by: ['status'],
      where: { templateId },
      _count: true,
    });
    const counts = Object.fromEntries(groups.map((g) => [g.status, g._count as number]));
    const total = groups.reduce((sum, g) => sum + (g._count as number), 0);
    return { counts, total };
  }

  async findByPlanId(planId: string) {
    return this.prisma.interview.findMany({
      where: { planId },
      orderBy: { status: 'asc' },
      select: { id: true, userId: true, status: true, completedAt: true },
    });
  }

  async findByIdForReport(id: string) {
    return this.prisma.interview.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, createdAt: true, completedAt: true },
    });
  }

  async findByIdForReportPage(id: string) {
    return this.prisma.interview.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, createdAt: true },
    });
  }
}
