import { PlanStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

describe('InterviewPlanService', () => {
  let service: InterviewPlanService;
  let mockPrisma: any;
  let mockDingtalkClient: any;

  beforeEach(() => {
    mockPrisma = {
      interviewPlan: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      interview: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      $disconnect: vi.fn(),
    };
    mockDingtalkClient = {
      getUserIdByMobile: vi.fn().mockResolvedValue(null),
    };
    service = new InterviewPlanService(
      mockPrisma as unknown as PrismaClient,
      mockDingtalkClient as any
    );
  });

  describe('createPlan', () => {
    it('should create a plan with correct data', async () => {
      mockPrisma.interviewPlan.create.mockResolvedValue({ id: 'plan-123' });

      const id = await service.createPlan({
        name: 'Q1 Interviews',
        description: 'First quarter interviews',
        templateId: 'template-456',
      });

      expect(id).toBe('plan-123');
      expect(mockPrisma.interviewPlan.create).toHaveBeenCalledWith({
        data: {
          name: 'Q1 Interviews',
          description: 'First quarter interviews',
          templateId: 'template-456',
          targetDate: undefined,
          schedule: undefined,
          status: PlanStatus.PENDING,
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
    });

    it('should include targetDate when provided', async () => {
      mockPrisma.interviewPlan.create.mockResolvedValue({ id: 'plan-123' });
      const targetDate = new Date('2026-06-01');

      await service.createPlan({
        name: 'Test Plan',
        templateId: 'template-456',
        targetDate,
      });

      expect(mockPrisma.interviewPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetDate,
          }),
        })
      );
    });
  });

  describe('getPlan', () => {
    it('should return null when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      const result = await service.getPlan('nonexistent');

      expect(result).toBeNull();
    });

    it('should return plan with relations', async () => {
      const mockPlan = {
        id: 'plan-1',
        name: 'Test Plan',
        templateId: 'template-1',
        interviews: [{ id: 'int-1', userId: 'user-1', status: 'PENDING' }],
      };
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.getPlan('plan-1');

      expect(result).toEqual(mockPlan);
      expect(mockPrisma.interviewPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        include: { template: true, interviews: expect.any(Object) },
      });
    });
  });

  describe('listPlans', () => {
    it('should return plans with pagination', async () => {
      const mockPlans = [{ id: 'plan-1' }, { id: 'plan-2' }];
      mockPrisma.interviewPlan.findMany.mockResolvedValue(mockPlans);
      mockPrisma.interviewPlan.count.mockResolvedValue(2);

      const result = await service.listPlans({ limit: 10, offset: 0 });

      expect(result.plans).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.count.mockResolvedValue(0);

      await service.listPlans({ status: PlanStatus.RUNNING });

      expect(mockPrisma.interviewPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PlanStatus.RUNNING },
        })
      );
    });
  });

  describe('pause/resume/cancel', () => {
    it('should pause plan', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.pausePlan('plan-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: PlanStatus.PAUSED, updatedBy: 'admin' },
      });
    });

    it('should resume plan', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.resumePlan('plan-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: PlanStatus.RUNNING, updatedBy: 'admin' },
      });
    });

    it('should cancel plan', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.cancelPlan('plan-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: PlanStatus.CANCELLED, updatedBy: 'admin' },
      });
    });
  });
});
