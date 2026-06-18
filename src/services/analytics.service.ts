import type { PrismaClient } from '@prisma/client';
import { error, info } from '../utils/logger.js';

export interface AnalyticsKPIs {
  totalInterviews: number;
  completionRate: number;
  averageDurationMinutes: number;
  totalReports: number;
}

export interface StatusDistribution {
  [status: string]: number;
}

export interface PlanCompletionRate {
  planId: string;
  planName: string;
  totalInterviews: number;
  completedCount: number;
  completionRate: number;
}

export interface WeeklyTrendEntry {
  week: string;
  count: number;
}

export interface DashboardPlanProgress {
  planId: string;
  planName: string;
  templateName: string;
  total: number;
  completed: number;
  inProgress: number;
  waiting: number;
  notStarted: number;
  cancelled: number;
  progressPercentage: number;
}

export interface PlanStats {
  planId: string;
  planName: string;
  totalInterviews: number;
  completedCount: number;
  completionRate: number;
  averageDurationMinutes: number;
  statusDistribution: StatusDistribution;
}

export class AnalyticsService {
  constructor(private prisma: PrismaClient) {}

  async getKPIs(): Promise<AnalyticsKPIs> {
    try {
      const [totalInterviews, completedCount, totalReports] = await Promise.all([
        this.prisma.interview.count(),
        this.prisma.interview.count({ where: { status: 'COMPLETED' } }),
        this.prisma.analysisReport.count(),
      ]);

      // Compute average duration from startedAt -> completedAt for completed interviews
      const completedInterviews = await this.prisma.interview.findMany({
        where: { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
      });

      let totalMinutes = 0;
      let durationCount = 0;
      for (const interview of completedInterviews) {
        if (interview.startedAt && interview.completedAt) {
          const diffMs = interview.completedAt.getTime() - interview.startedAt.getTime();
          totalMinutes += diffMs / (1000 * 60);
          durationCount++;
        }
      }

      const averageDurationMinutes =
        durationCount > 0 ? Math.round(totalMinutes / durationCount) : 0;
      const completionRate =
        totalInterviews > 0 ? Math.round((completedCount / totalInterviews) * 100) : 0;

      info('KPIs computed', {
        totalInterviews,
        completionRate,
        averageDurationMinutes,
        totalReports,
      });

      return {
        totalInterviews,
        completionRate,
        averageDurationMinutes,
        totalReports,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to compute KPIs';
      error('Failed to compute analytics KPIs', { error: errMsg });
      throw e;
    }
  }

  async getStatusDistribution(): Promise<StatusDistribution> {
    try {
      const groups = await this.prisma.interview.groupBy({
        by: ['status'],
        _count: true,
      });

      const result: StatusDistribution = {};
      for (const group of groups) {
        result[group.status] = group._count as number;
      }

      // Ensure all statuses are present (even with 0 count)
      const allStatuses = ['PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED'];
      for (const status of allStatuses) {
        if (!(status in result)) {
          result[status] = 0;
        }
      }

      return result;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to compute status distribution';
      error('Failed to compute status distribution', { error: errMsg });
      throw e;
    }
  }

  async getPlanCompletionRates(): Promise<PlanCompletionRate[]> {
    try {
      const plans = await this.prisma.interviewPlan.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { interviews: true } },
          interviews: {
            select: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const result: PlanCompletionRate[] = plans.map((plan) => {
        const totalInterviews = plan._count.interviews;
        const completedCount = plan.interviews.filter((i) => i.status === 'COMPLETED').length;
        const completionRate =
          totalInterviews > 0 ? Math.round((completedCount / totalInterviews) * 100) : 0;

        return {
          planId: plan.id,
          planName: plan.name,
          totalInterviews,
          completedCount,
          completionRate,
        };
      });

      return result;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to compute plan completion rates';
      error('Failed to compute plan completion rates', { error: errMsg });
      throw e;
    }
  }

  async getDashboardPlanProgress(): Promise<DashboardPlanProgress[]> {
    try {
      const plans = await this.prisma.interviewPlan.findMany({
        select: {
          id: true,
          name: true,
          template: {
            select: { name: true },
          },
          interviews: {
            select: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return plans.map((plan) => {
        const total = plan.interviews.length;
        const completed = plan.interviews.filter((i) => i.status === 'COMPLETED').length;
        const inProgress = plan.interviews.filter((i) => i.status === 'ACTIVE').length;
        const waiting = plan.interviews.filter((i) => i.status === 'WAITING').length;
        const notStarted = plan.interviews.filter((i) => i.status === 'PENDING').length;
        const cancelled = plan.interviews.filter((i) => i.status === 'CANCELLED').length;
        const progressPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          planId: plan.id,
          planName: plan.name,
          templateName: plan.template?.name ?? '-',
          total,
          completed,
          inProgress,
          waiting,
          notStarted,
          cancelled,
          progressPercentage,
        };
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to get dashboard plan progress';
      error('Failed to get dashboard plan progress', { error: errMsg });
      throw e;
    }
  }

  async getWeeklyTrend(): Promise<WeeklyTrendEntry[]> {
    try {
      const now = new Date();
      const eightWeeksAgo = new Date(now);
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 8 * 7);

      const completedInterviews = await this.prisma.interview.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: eightWeeksAgo,
          },
        },
        select: { completedAt: true },
        orderBy: { completedAt: 'asc' },
      });

      // Group by week
      const weekMap = new Map<string, number>();

      // Initialize all 8 weeks
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - i * 7);
        const weekKey = this.getWeekKey(weekStart);
        weekMap.set(weekKey, 0);
      }

      for (const interview of completedInterviews) {
        if (interview.completedAt) {
          const weekKey = this.getWeekKey(interview.completedAt);
          weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1);
        }
      }

      const result: WeeklyTrendEntry[] = [];
      for (const [week, count] of weekMap.entries()) {
        result.push({ week, count });
      }

      return result;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to compute weekly trend';
      error('Failed to compute weekly trend', { error: errMsg });
      throw e;
    }
  }

  private getWeekKey(date: Date): string {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  private computeStatusDistribution(interviews: Array<{ status: string }>): StatusDistribution {
    const allStatuses = ['PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
    const statusDistribution: StatusDistribution = {};
    for (const status of allStatuses) {
      statusDistribution[status] = 0;
    }
    for (const interview of interviews) {
      statusDistribution[interview.status] = (statusDistribution[interview.status] ?? 0) + 1;
    }
    return statusDistribution;
  }

  private computeAverageDuration(
    interviews: Array<{ status: string; startedAt: Date | null; completedAt: Date | null }>
  ): number {
    let totalMinutes = 0;
    let durationCount = 0;
    for (const interview of interviews) {
      if (interview.status === 'COMPLETED' && interview.startedAt && interview.completedAt) {
        const diffMs = interview.completedAt.getTime() - interview.startedAt.getTime();
        totalMinutes += diffMs / (1000 * 60);
        durationCount++;
      }
    }
    return durationCount > 0 ? Math.round(totalMinutes / durationCount) : 0;
  }

  private computeCompletionRate(total: number, completed: number): number {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  async getPlanStats(planId: string): Promise<PlanStats | null> {
    try {
      const plan = await this.prisma.interviewPlan.findUnique({
        where: { id: planId },
        select: {
          id: true,
          name: true,
          interviews: {
            select: {
              status: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      });

      if (!plan) {
        return null;
      }

      const statusDistribution = this.computeStatusDistribution(plan.interviews);
      const averageDurationMinutes = this.computeAverageDuration(plan.interviews);
      const totalInterviews = plan.interviews.length;
      const completedCount = statusDistribution.COMPLETED ?? 0;
      const completionRate = this.computeCompletionRate(totalInterviews, completedCount);

      return {
        planId: plan.id,
        planName: plan.name,
        totalInterviews,
        completedCount,
        completionRate,
        averageDurationMinutes,
        statusDistribution,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to compute plan stats';
      error('Failed to compute plan stats', { planId, error: errMsg });
      throw e;
    }
  }
}
