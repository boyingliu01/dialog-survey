import { error, info } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';

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

/** Every interview status, so a status with zero rows still appears in output. */
const ALL_STATUSES = ['PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;

/** Minutes between two instants, or null when either is missing. */
function minutesBetween(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt || !completedAt) return null;
  return (completedAt.getTime() - startedAt.getTime()) / (1000 * 60);
}

/**
 * Mean duration in whole minutes, rounded.
 *
 * Rows missing either timestamp are skipped rather than counted as 0, which would
 * silently drag the average down — the same reason the query filters for non-null
 * but the cast still has to be narrowed here.
 */
function averageMinutes(
  rows: readonly { startedAt: Date | null; completedAt: Date | null }[]
): number {
  let total = 0;
  let counted = 0;
  for (const row of rows) {
    const minutes = minutesBetween(row.startedAt, row.completedAt);
    if (minutes === null) continue;
    total += minutes;
    counted += 1;
  }
  return counted > 0 ? Math.round(total / counted) : 0;
}

/** Percentage of `part` in `whole`, rounded; 0 when `whole` is empty. */
function percentage(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Fill in any status the database did not return with an explicit zero. */
function withAllStatuses(counts: StatusDistribution): StatusDistribution {
  const result = { ...counts };
  for (const status of ALL_STATUSES) {
    if (!(status in result)) result[status] = 0;
  }
  return result;
}

/** ISO-ish week label, `YYYY-Www`, from a date. */
function weekKeyOf(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDays = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Seed the trend with the last 8 weeks at zero, oldest first.
 *
 * Pre-seeding is what makes the chart continuous: a week with no interviews must
 * appear as 0 rather than be missing from the series, otherwise the x-axis jumps
 * and a drop in volume looks like a flat line.
 */
function emptyWeekBuckets(now: Date, weeks: number): Map<string, number> {
  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    buckets.set(weekKeyOf(weekStart), 0);
  }
  return buckets;
}

/** Count each interview into its week bucket, ignoring undated rows. */
function countByWeek(
  rows: readonly { completedAt: Date | null }[],
  buckets: Map<string, number>
): void {
  for (const row of rows) {
    if (!row.completedAt) continue;
    const key = weekKeyOf(row.completedAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
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

      const averageDurationMinutes = averageMinutes(completedInterviews);
      const completionRate = percentage(completedCount, totalInterviews);

      const kpis = { totalInterviews, completionRate, averageDurationMinutes, totalReports };
      info('KPIs computed', kpis);
      return kpis;
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

      const counts: StatusDistribution = {};
      for (const group of groups) {
        counts[group.status] = group._count as number;
      }

      // Ensure all statuses are present (even with 0 count)
      const result = withAllStatuses(counts);

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

      // Group by week, seeding all 8 buckets so empty weeks still appear as 0.
      const weekMap = emptyWeekBuckets(now, 8);
      countByWeek(completedInterviews, weekMap);

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

  private computeStatusDistribution(interviews: Array<{ status: string }>): StatusDistribution {
    const counts: StatusDistribution = {};
    for (const interview of interviews) {
      counts[interview.status] = (counts[interview.status] ?? 0) + 1;
    }
    return withAllStatuses(counts);
  }

  private computeAverageDuration(
    interviews: Array<{ status: string; startedAt: Date | null; completedAt: Date | null }>
  ): number {
    // Only COMPLETED rows count. `averageMinutes` already skips rows missing a
    // timestamp, so the status filter is the only extra condition here.
    const completed = interviews.filter((i) => i.status === 'COMPLETED');
    return averageMinutes(completed);
  }

  private computeCompletionRate(total: number, completed: number): number {
    return percentage(completed, total);
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
      const completedCount = statusDistribution['COMPLETED'] ?? 0;
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
