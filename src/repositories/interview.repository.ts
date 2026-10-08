import type { PrismaClient } from '../utils/prisma-client.js';

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

  // ---- Readers migrated verbatim from src/api/admin-templates.ts (REQ-181) ----

  /** GET /admin/content/reports/:interviewId — full detail with template content, messages and responses. */
  findByIdForReportDetail(id: string) {
    return this.prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        planId: true,
        createdAt: true,
        completedAt: true,
        template: { select: { content: true } },
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
        responses: {
          select: { questionId: true, content: true, isFollowup: true, followupDepth: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /** GET /admin/api/reports/:interviewId/download — transcript projection for the Markdown export. */
  findByIdForReportExport(id: string) {
    return this.prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        planId: true,
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /** GET reports/:interviewId — analysis view with createdAt and messages. */
  findByIdForAnalysisView(id: string) {
    return this.prisma.interview.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        planId: true,
        createdAt: true,
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /** Members of other plans with an unfinished interview for any of the given users (import-commit guard). */
  findActiveInOtherPlans(userIds: string[], excludingPlanId: string) {
    return this.prisma.interview.findMany({
      where: {
        userId: { in: userIds },
        planId: { not: excludingPlanId },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: { userId: true, planId: true },
    });
  }

  /** Users among the given ones that already have an interview in the plan. */
  findUserIdsInPlan(planId: string, userIds: string[]) {
    return this.prisma.interview.findMany({
      where: { planId, userId: { in: userIds } },
      select: { userId: true },
    });
  }
}
