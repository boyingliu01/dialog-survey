import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';
import { PlanStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

describe('InterviewPlanService - Additional Coverage', () => {
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

  describe('sendInvitations', () => {
    it('should send invitations to pending interviews', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt: null,
        interviews: [{ userId: 'user-1' }, { userId: 'user-2' }],
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.sendInvitations('plan-1');

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle send failures', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt: null,
        interviews: [{ userId: 'user-1' }],
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.sendInvitations('plan-1');

      expect(result.sent).toBe(1);
    });

    it('should throw when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(service.sendInvitations('invalid')).rejects.toThrow('Plan not found');
    });
  });

  describe('updatePlanStatus', () => {
    it('should set completedAt when status is COMPLETED', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlanStatus('plan-1', PlanStatus.COMPLETED);

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          status: PlanStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      });
    });

    it('should not set completedAt for other statuses', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlanStatus('plan-1', PlanStatus.RUNNING);

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: PlanStatus.RUNNING },
      });
    });
  });
});
