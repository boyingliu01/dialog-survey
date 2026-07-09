import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
  messageSender: {
    sendTextMessage: vi.fn().mockResolvedValue({
      taskId: 'mock-task',
      successCount: 1,
      failedUserIds: [],
    }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

describe('InterviewPlanService - Member Management (Issue #10)', () => {
  let service: InterviewPlanService;

  let mockPrisma: {
    interviewPlan: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    interview: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $disconnect: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      interviewPlan: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      interview: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      $disconnect: vi.fn(),
      $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
    };
    service = new InterviewPlanService(mockPrisma as unknown as PrismaClient);
  });

  describe('addMember', () => {
    it('should throw when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember('missing', { userId: 'user-1', name: 'Alice' })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw when member already exists in plan', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });
      mockPrisma.interview.findFirst.mockResolvedValue({ id: 'int-1', userId: 'user-1' });

      await expect(
        service.addMember('plan-1', { userId: 'user-1', name: 'Alice' })
      ).rejects.toThrow('该成员已在访谈计划中');
    });

    it('should create interview and append to inviteeData', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      mockPrisma.interview.create.mockResolvedValue({
        id: 'int-new',
        userId: 'user-2',
        planId: 'plan-1',
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.addMember('plan-1', { userId: 'user-2', name: 'Bob' });

      expect(result.interviewId).toBe('int-new');
      expect(mockPrisma.interview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-2',
          templateId: 'tpl-1',
          planId: 'plan-1',
          status: 'PENDING',
        }),
      });
      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          inviteeData: expect.arrayContaining([
            { userId: 'user-1', name: 'Alice' },
            { userId: 'user-2', name: 'Bob' },
          ]),
        }),
      });
    });

    it('should handle empty inviteeData when adding first member', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: null,
      });
      mockPrisma.interview.findFirst.mockResolvedValue(null);
      mockPrisma.interview.create.mockResolvedValue({ id: 'int-new', userId: 'user-1' });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.addMember('plan-1', { userId: 'user-1', name: 'Alice' });

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          inviteeData: [{ userId: 'user-1', name: 'Alice' }],
        }),
      });
    });
  });

  describe('removeMember', () => {
    it('should throw when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('plan-1', 'missing-int')).rejects.toThrow(
        'Interview not found'
      );
    });

    it('should throw when interview does not belong to plan', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'other-plan',
        userId: 'user-1',
        status: 'PENDING',
      });

      await expect(service.removeMember('plan-1', 'int-1')).rejects.toThrow(
        '该访谈记录不属于此计划'
      );
    });

    it('should delete interview and remove from inviteeData', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'PENDING',
      });
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        inviteeData: [
          { userId: 'user-1', name: 'Alice' },
          { userId: 'user-2', name: 'Bob' },
        ],
      });
      mockPrisma.interview.delete.mockResolvedValue({});
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.removeMember('plan-1', 'int-1');

      expect(mockPrisma.interview.delete).toHaveBeenCalledWith({ where: { id: 'int-1' } });
      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          inviteeData: [{ userId: 'user-2', name: 'Bob' }],
        }),
      });
    });

    it('should refuse to remove COMPLETED interview', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });

      await expect(service.removeMember('plan-1', 'int-1')).rejects.toThrow('无法删除已完成的访谈');
    });

    it('should decrement sentCount when removing a SENT interview', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'PENDING',
        sendStatus: 'SENT',
      });
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });

      await service.removeMember('plan-1', 'int-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          sentCount: { decrement: 1 },
        }),
      });
    });

    it('should decrement sentCount and failedCount when removing a FAILED interview', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'PENDING',
        sendStatus: 'FAILED',
      });
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });

      await service.removeMember('plan-1', 'int-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          sentCount: { decrement: 1 },
          failedCount: { decrement: 1 },
        }),
      });
    });

    it('should NOT decrement counters when removing a NOT_SENT interview', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'PENDING',
        sendStatus: 'NOT_SENT',
      });
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });

      await service.removeMember('plan-1', 'int-1');

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      expect(updateCall.data.sentCount).toBeUndefined();
      expect(updateCall.data.failedCount).toBeUndefined();
    });
  });

  describe('sendReminder', () => {
    it('should throw when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(service.sendReminder('missing')).rejects.toThrow('Plan not found');
    });

    it('should return zero counts when no incomplete members', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);

      const result = await service.sendReminder('plan-1');

      expect(result).toEqual({ reminded: 0, failed: 0 });
    });

    it('should send reminder only to non-COMPLETED, non-CANCELLED members', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Q2 Survey',
      });
      mockPrisma.interview.findMany.mockResolvedValue([
        { id: 'int-1', userId: 'user-1' },
        { id: 'int-2', userId: 'user-2' },
        { id: 'int-3', userId: 'user-3' },
      ]);

      const result = await service.sendReminder('plan-1');

      const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
      expect(messageSender.sendTextMessage).toHaveBeenCalledTimes(3);
      expect(mockPrisma.interview.findMany).toHaveBeenCalledWith({
        where: {
          planId: 'plan-1',
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        select: { id: true, userId: true },
      });
      expect(result.reminded).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should target a single member when interviewId provided', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'PENDING',
      });
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
      });

      const result = await service.sendReminder('plan-1', 'int-1');

      const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
      expect(messageSender.sendTextMessage).toHaveBeenLastCalledWith(
        ['user-1'],
        expect.any(String)
      );
      expect(result.reminded).toBe(1);
    });

    it('should count partial failures correctly', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test',
      });
      mockPrisma.interview.findMany.mockResolvedValue([
        { id: 'int-1', userId: 'user-1' },
        { id: 'int-2', userId: 'user-2' },
        { id: 'int-3', userId: 'user-3' },
      ]);

      const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
      (messageSender.sendTextMessage as ReturnType<typeof vi.fn>).mockReset();
      (messageSender.sendTextMessage as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ taskId: 't1', successCount: 1, failedUserIds: [] })
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ taskId: 't3', successCount: 1, failedUserIds: [] });

      const result = await service.sendReminder('plan-1');

      expect(result.reminded).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('typed errors', () => {
    it('addMember should throw PlanNotFoundError for missing plan', async () => {
      const { PlanNotFoundError } = await import('../src/services/interview-plan.service.js');
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);
      await expect(service.addMember('missing', { userId: 'u', name: 'n' })).rejects.toBeInstanceOf(
        PlanNotFoundError
      );
    });

    it('addMember should throw MemberConflictError for duplicate', async () => {
      const { MemberConflictError } = await import('../src/services/interview-plan.service.js');
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [],
      });
      mockPrisma.interview.findFirst.mockResolvedValue({ id: 'int-1', userId: 'user-1' });
      await expect(
        service.addMember('plan-1', { userId: 'user-1', name: 'Alice' })
      ).rejects.toBeInstanceOf(MemberConflictError);
    });

    it('addMember should throw MemberConflictError for cross-plan active interview', async () => {
      const { MemberConflictError } = await import('../src/services/interview-plan.service.js');
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-2',
        templateId: 'tpl-1',
        inviteeData: [],
      });
      // Same-plan check: no duplicate
      mockPrisma.interview.findFirst.mockResolvedValueOnce(null);
      // Cross-plan check: user has active interview in different plan
      mockPrisma.interview.findFirst.mockResolvedValueOnce({ planId: 'plan-1' });
      await expect(
        service.addMember('plan-2', { userId: 'user-1', name: 'Alice' })
      ).rejects.toBeInstanceOf(MemberConflictError);
    });

    it('removeMember should throw InterviewNotFoundError when missing', async () => {
      const { InterviewNotFoundError } = await import('../src/services/interview-plan.service.js');
      mockPrisma.interview.findUnique.mockResolvedValue(null);
      await expect(service.removeMember('plan-1', 'missing')).rejects.toBeInstanceOf(
        InterviewNotFoundError
      );
    });

    it('removeMember should throw InvalidStateError for COMPLETED interview', async () => {
      const { InvalidStateError } = await import('../src/services/interview-plan.service.js');
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'int-1',
        planId: 'plan-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });
      await expect(service.removeMember('plan-1', 'int-1')).rejects.toBeInstanceOf(
        InvalidStateError
      );
    });
  });
});
