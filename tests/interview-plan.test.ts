import { PlanStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

describe('InterviewPlanService', () => {
  let service: InterviewPlanService;
  let mockPrisma: any;

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
        createMany: vi.fn(),
      },
      $disconnect: vi.fn(),
    };
    service = new InterviewPlanService(mockPrisma as unknown as PrismaClient);
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

  describe('importInvitees', () => {
    it('should throw error when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.importInvitees('invalid', [{ userId: 'user-1', name: 'John' }])
      ).rejects.toThrow('Plan not found');
    });

    it('should import new invitees', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
        inviteeData: null,
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.importInvitees('plan-1', [
        { userId: 'user-1', name: 'John' },
        { userId: 'user-2', name: 'Jane' },
      ]);

      expect(result.success).toBe(2);
      expect(mockPrisma.interview.createMany).toHaveBeenCalled();
    });

    it('should skip duplicate userIds', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([{ userId: 'user-1' }]);
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.importInvitees('plan-1', [
        { userId: 'user-1', name: 'John' },
        { userId: 'user-2', name: 'Jane' },
      ]);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toContain('User user-1 already exists in plan');
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
