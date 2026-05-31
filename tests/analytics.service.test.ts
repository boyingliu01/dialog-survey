import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from '../src/services/analytics.service.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockPrisma: {
    interview: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    analysisReport: {
      count: ReturnType<typeof vi.fn>;
    };
    interviewPlan: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      interview: {
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      analysisReport: {
        count: vi.fn(),
      },
      interviewPlan: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    service = new AnalyticsService(mockPrisma as unknown as PrismaClient);
    vi.clearAllMocks();
  });

  describe('getKPIs', () => {
    it('should return zeros when no data exists', async () => {
      mockPrisma.interview.count.mockResolvedValue(0);
      mockPrisma.analysisReport.count.mockResolvedValue(0);
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const result = await service.getKPIs();

      expect(result).toEqual({
        totalInterviews: 0,
        completionRate: 0,
        averageDurationMinutes: 0,
        totalReports: 0,
      });
    });

    it('should compute KPIs with data', async () => {
      mockPrisma.interview.count.mockImplementation(
        async (args?: { where?: { status?: string } }) => {
          if (args?.where?.status === 'COMPLETED') return 30;
          return 100;
        }
      );
      mockPrisma.analysisReport.count.mockResolvedValue(50);
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const result = await service.getKPIs();

      expect(result.totalInterviews).toBe(100);
      expect(result.completionRate).toBe(30);
      expect(result.averageDurationMinutes).toBe(0);
      expect(result.totalReports).toBe(50);
    });

    it('should compute average duration from startedAt/completedAt', async () => {
      mockPrisma.interview.count.mockImplementation(
        async (args?: { where?: { status?: string } }) => {
          if (args?.where?.status === 'COMPLETED') return 2;
          return 2;
        }
      );
      mockPrisma.analysisReport.count.mockResolvedValue(1);
      const startDate = new Date('2026-05-24T10:00:00Z');
      const endDate1 = new Date('2026-05-24T10:30:00Z');
      const endDate2 = new Date('2026-05-24T11:00:00Z');
      mockPrisma.interview.findMany.mockResolvedValue([
        { startedAt: startDate, completedAt: endDate1 },
        { startedAt: startDate, completedAt: endDate2 },
      ]);

      const result = await service.getKPIs();

      expect(result.averageDurationMinutes).toBe(45);
      expect(result.completionRate).toBe(100);
    });

    it('should handle completed interviews with null dates', async () => {
      mockPrisma.interview.count.mockImplementation(
        async (args?: { where?: { status?: string } }) => {
          if (args?.where?.status === 'COMPLETED') return 2;
          return 5;
        }
      );
      mockPrisma.analysisReport.count.mockResolvedValue(3);
      mockPrisma.interview.findMany.mockResolvedValue([
        { startedAt: null, completedAt: new Date() },
        { startedAt: new Date(), completedAt: null },
        { startedAt: new Date(), completedAt: new Date() },
      ]);

      const result = await service.getKPIs();

      expect(result.totalInterviews).toBe(5);
      expect(result.completionRate).toBe(40);
    });
  });

  describe('getStatusDistribution', () => {
    it('should return zeros for all 5 statuses when empty', async () => {
      mockPrisma.interview.groupBy.mockResolvedValue([]);

      const result = await service.getStatusDistribution();

      expect(result).toEqual({
        PENDING: 0,
        ACTIVE: 0,
        WAITING: 0,
        COMPLETED: 0,
        CANCELLED: 0,
      });
    });

    it('should return correct counts for mixed statuses', async () => {
      mockPrisma.interview.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: 5 },
        { status: 'COMPLETED', _count: 10 },
        { status: 'ACTIVE', _count: 3 },
      ]);

      const result = await service.getStatusDistribution();

      expect(result.PENDING).toBe(5);
      expect(result.COMPLETED).toBe(10);
      expect(result.ACTIVE).toBe(3);
      expect(result.WAITING).toBe(0);
      expect(result.CANCELLED).toBe(0);
    });

    it('should include all statuses even when some are missing from DB results', async () => {
      mockPrisma.interview.groupBy.mockResolvedValue([{ status: 'CANCELLED', _count: 2 }]);

      const result = await service.getStatusDistribution();

      expect(Object.keys(result)).toHaveLength(5);
      expect(result.CANCELLED).toBe(2);
      expect(result.PENDING).toBe(0);
    });
  });

  describe('getPlanCompletionRates', () => {
    it('should return empty array when no plans exist', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([]);

      const result = await service.getPlanCompletionRates();

      expect(result).toEqual([]);
    });

    it('should compute completion rates for plans with interviews', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          name: 'Q2 Survey',
          _count: { interviews: 4 },
          interviews: [
            { status: 'COMPLETED' },
            { status: 'COMPLETED' },
            { status: 'ACTIVE' },
            { status: 'PENDING' },
          ],
        },
        {
          id: 'plan-2',
          name: 'Q1 Survey',
          _count: { interviews: 2 },
          interviews: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
        },
      ]);

      const result = await service.getPlanCompletionRates();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        planId: 'plan-1',
        planName: 'Q2 Survey',
        totalInterviews: 4,
        completedCount: 2,
        completionRate: 50,
      });
      expect(result[1]).toEqual({
        planId: 'plan-2',
        planName: 'Q1 Survey',
        totalInterviews: 2,
        completedCount: 2,
        completionRate: 100,
      });
    });

    it('should handle plans without interviews', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([
        {
          id: 'plan-empty',
          name: 'Empty Plan',
          _count: { interviews: 0 },
          interviews: [],
        },
      ]);

      const result = await service.getPlanCompletionRates();

      expect(result).toHaveLength(1);
      expect(result[0].completionRate).toBe(0);
      expect(result[0].totalInterviews).toBe(0);
      expect(result[0].completedCount).toBe(0);
    });

    it('should handle plan with mixed completed and non-completed interviews', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([
        {
          id: 'plan-3',
          name: 'Research',
          _count: { interviews: 3 },
          interviews: [{ status: 'COMPLETED' }, { status: 'WAITING' }, { status: 'CANCELLED' }],
        },
      ]);

      const result = await service.getPlanCompletionRates();

      expect(result[0].completedCount).toBe(1);
      expect(result[0].completionRate).toBe(33);
    });
  });

  describe('getWeeklyTrend', () => {
    it('should return 8 weeks with zero counts when no completed interviews', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const result = await service.getWeeklyTrend();

      expect(result).toHaveLength(8);
      for (const entry of result) {
        expect(entry.count).toBe(0);
        expect(entry.week).toMatch(/\d{4}-W\d{2}/);
      }
    });

    it('should group completed interviews by week', async () => {
      const now = new Date();
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      mockPrisma.interview.findMany.mockResolvedValue([
        { completedAt: oneWeekAgo },
        { completedAt: oneWeekAgo },
        { completedAt: twoWeeksAgo },
      ]);

      const result = await service.getWeeklyTrend();

      expect(result).toHaveLength(8);
      const totalCompleted = result.reduce((sum, entry) => sum + entry.count, 0);
      expect(totalCompleted).toBe(3);
    });

    it('should handle interviews with null completedAt', async () => {
      mockPrisma.interview.findMany.mockResolvedValue([
        { completedAt: new Date() },
        { completedAt: null },
      ]);

      const result = await service.getWeeklyTrend();

      expect(result).toHaveLength(8);
      const totalCompleted = result.reduce((sum, entry) => sum + entry.count, 0);
      expect(totalCompleted).toBe(1);
    });
  });

  describe('getPlanStats', () => {
    it('should return null when plan does not exist', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      const result = await service.getPlanStats('nonexistent-plan');

      expect(result).toBeNull();
    });

    it('should return zeros for plan with no interviews', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Empty Plan',
        interviews: [],
      });

      const result = await service.getPlanStats('plan-1');

      expect(result).toEqual({
        planId: 'plan-1',
        planName: 'Empty Plan',
        totalInterviews: 0,
        completedCount: 0,
        completionRate: 0,
        averageDurationMinutes: 0,
        statusDistribution: {
          PENDING: 0,
          ACTIVE: 0,
          WAITING: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        },
      });
    });

    it('should compute per-plan stats with mixed statuses', async () => {
      const start = new Date('2026-05-24T10:00:00Z');
      const end1 = new Date('2026-05-24T10:20:00Z');
      const end2 = new Date('2026-05-24T11:00:00Z');
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-2',
        name: 'Q2 Survey',
        interviews: [
          { status: 'COMPLETED', startedAt: start, completedAt: end1 },
          { status: 'COMPLETED', startedAt: start, completedAt: end2 },
          { status: 'ACTIVE', startedAt: null, completedAt: null },
          { status: 'PENDING', startedAt: null, completedAt: null },
          { status: 'CANCELLED', startedAt: null, completedAt: null },
        ],
      });

      const result = await service.getPlanStats('plan-2');

      expect(result).not.toBeNull();
      expect(result?.planId).toBe('plan-2');
      expect(result?.planName).toBe('Q2 Survey');
      expect(result?.totalInterviews).toBe(5);
      expect(result?.completedCount).toBe(2);
      expect(result?.completionRate).toBe(40);
      expect(result?.averageDurationMinutes).toBe(40); // (20 + 60)/2
      expect(result?.statusDistribution).toEqual({
        PENDING: 1,
        ACTIVE: 1,
        WAITING: 0,
        COMPLETED: 2,
        CANCELLED: 1,
      });
    });

    it('should ignore completed interviews with null timestamps for duration', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-3',
        name: 'Partial Data',
        interviews: [
          { status: 'COMPLETED', startedAt: null, completedAt: new Date() },
          { status: 'COMPLETED', startedAt: new Date(), completedAt: null },
        ],
      });

      const result = await service.getPlanStats('plan-3');

      expect(result?.averageDurationMinutes).toBe(0);
      expect(result?.completedCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw and log error when getKPIs fails', async () => {
      mockPrisma.interview.count.mockRejectedValue(new Error('DB connection failed'));

      await expect(service.getKPIs()).rejects.toThrow('DB connection failed');
    });

    it('should throw and log error when getStatusDistribution fails', async () => {
      mockPrisma.interview.groupBy.mockRejectedValue(new Error('groupBy failed'));

      await expect(service.getStatusDistribution()).rejects.toThrow('groupBy failed');
    });

    it('should throw and log error when getPlanCompletionRates fails', async () => {
      mockPrisma.interviewPlan.findMany.mockRejectedValue(new Error('Plans query failed'));

      await expect(service.getPlanCompletionRates()).rejects.toThrow('Plans query failed');
    });

    it('should throw and log error when getWeeklyTrend fails', async () => {
      mockPrisma.interview.findMany.mockRejectedValue(new Error('Trend query failed'));

      await expect(service.getWeeklyTrend()).rejects.toThrow('Trend query failed');
    });

    it('should handle non-Error rejection in getKPIs catch', async () => {
      mockPrisma.interview.count.mockRejectedValue('String error');

      await expect(service.getKPIs()).rejects.toBe('String error');
    });

    it('should handle non-Error rejection in getStatusDistribution catch', async () => {
      mockPrisma.interview.groupBy.mockRejectedValue({ code: 500 });

      await expect(service.getStatusDistribution()).rejects.toEqual({ code: 500 });
    });

    it('should handle non-Error rejection in getPlanCompletionRates catch', async () => {
      mockPrisma.interviewPlan.findMany.mockRejectedValue(null);

      await expect(service.getPlanCompletionRates()).rejects.toBe(null);
    });

    it('should handle non-Error rejection in getWeeklyTrend catch', async () => {
      mockPrisma.interview.findMany.mockRejectedValue('Network error');

      await expect(service.getWeeklyTrend()).rejects.toBe('Network error');
    });
  });
});
