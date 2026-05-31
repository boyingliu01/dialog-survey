import { PrismaClient } from '@prisma/client';
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
  // biome-ignore lint/suspicious/noExplicitAny: mock prisma per test pattern
  let mockPrisma: any;

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
    };
    service = new InterviewPlanService(mockPrisma as unknown as PrismaClient);
  });

  describe('addMember', () => {
    it('should throw when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(service.addMember('missing', 'user-1', 'Alice')).rejects.toThrow(
        'Plan not found'
      );
    });

    it('should throw when member already exists in plan', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [{ userId: 'user-1', name: 'Alice' }],
      });
      mockPrisma.interview.findFirst.mockResolvedValue({ id: 'int-1', userId: 'user-1' });

      await expect(service.addMember('plan-1', 'user-1', 'Alice')).rejects.toThrow(
        'Member already exists'
      );
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

      const result = await service.addMember('plan-1', 'user-2', 'Bob');

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

      await service.addMember('plan-1', 'user-1', 'Alice');

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
        'Interview does not belong to plan'
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

      await expect(service.removeMember('plan-1', 'int-1')).rejects.toThrow(
        'Cannot remove completed interview'
      );
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
        interviews: [],
      });

      const result = await service.sendReminder('plan-1');

      expect(result).toEqual({ reminded: 0, failed: 0 });
    });

    it('should send reminder only to non-COMPLETED, non-CANCELLED members', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Q2 Survey',
        interviews: [
          { id: 'int-1', userId: 'user-1', status: 'PENDING' },
          { id: 'int-2', userId: 'user-2', status: 'ACTIVE' },
          { id: 'int-3', userId: 'user-3', status: 'WAITING' },
          { id: 'int-4', userId: 'user-4', status: 'COMPLETED' },
          { id: 'int-5', userId: 'user-5', status: 'CANCELLED' },
        ],
      });

      const result = await service.sendReminder('plan-1');

      const { messageSender } = await import(
        '../src/integrations/dingtalk/message-sender.js'
      );
      expect(messageSender.sendTextMessage).toHaveBeenCalledTimes(3);
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

      const { messageSender } = await import(
        '../src/integrations/dingtalk/message-sender.js'
      );
      expect(messageSender.sendTextMessage).toHaveBeenLastCalledWith(
        ['user-1'],
        expect.any(String)
      );
      expect(result.reminded).toBe(1);
    });
  });
});
