import { PlanStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
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

    it('should resolve phone to userId via DingTalk API and import', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
        inviteeData: null,
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({
          found: true,
          userId: 'resolved-user-123',
          name: '张三',
        }),
      };

      const result = await service.importInvitees(
        'plan-1',
        [{ phone: '13800138000', name: '张三' }],
        mockDingtalkClient
      );

      expect(result.success).toBe(1);
      expect(mockDingtalkClient.getUserIdByMobile).toHaveBeenCalledWith('13800138000');
      expect(mockPrisma.interview.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'resolved-user-123',
            templateId: 'template-1',
            planId: 'plan-1',
            status: 'PENDING',
          },
        ],
      });
    });

    it('should record error and skip when DingTalk API fails to find user', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
        inviteeData: null,
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({ found: false }),
      };

      const result = await service.importInvitees(
        'plan-1',
        [{ phone: '13800138000', name: '张三' }],
        mockDingtalkClient
      );

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toContain('Phone number not found in DingTalk');
    });

    it('should handle mixed phone and userId invitees', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
        inviteeData: null,
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({
          found: true,
          userId: 'resolved-user-456',
          name: '李四',
        }),
      };

      const result = await service.importInvitees(
        'plan-1',
        [
          { userId: 'user-1', name: 'John' },
          { phone: '13900139000', name: '李四' },
        ],
        mockDingtalkClient
      );

      expect(result.success).toBe(2);
      expect(mockDingtalkClient.getUserIdByMobile).toHaveBeenCalledWith('13900139000');
      expect(mockPrisma.interview.createMany).toHaveBeenCalled();
    });
  });

  describe('parseInviteeText', () => {
    it('should parse phone number format: 13800138000 张三', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: '13800138000 张三' });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId?: string;
        phone?: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].phone).toBe('13800138000');
      expect(inviteeData[0].name).toBe('张三');
    });

    it('should parse userId format: user123 李四', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: 'user123 李四' });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId?: string;
        phone?: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].userId).toBe('user123');
      expect(inviteeData[0].name).toBe('李四');
    });

    it('should strip +86 prefix from phone number', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: '+8613800138000 王五' });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId?: string;
        phone?: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].phone).toBe('13800138000');
      expect(inviteeData[0].name).toBe('王五');
    });

    it('should handle mixed formats in multi-line input', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', {
        invitees: '13800138000 张三\nuser123 李四',
      });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId?: string;
        phone?: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(2);
      expect(inviteeData[0].phone).toBe('13800138000');
      expect(inviteeData[0].name).toBe('张三');
      expect(inviteeData[1].userId).toBe('user123');
      expect(inviteeData[1].name).toBe('李四');
    });
  });

  describe('updatePlan', () => {
    it('should parse invitee with only userId and NOT duplicate the userId as name', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: 'user-123' });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].userId).toBe('user-123');
      expect(inviteeData[0].name).toBe('');
    });

    it('should parse invitee with userId and name correctly', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: 'user-123 张三' });

      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId: string;
        name: string;
      }>;

      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].userId).toBe('user-123');
      expect(inviteeData[0].name).toBe('张三');
    });

    it('should remove interviews for users no longer in the list', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([{ id: 'int-1', userId: 'old-user' }]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { invitees: 'new-user 新人' });

      expect(mockPrisma.interview.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['int-1'] } },
      });
    });

    it('should resolve phone entries via DingTalk and create interviews', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({
          found: true,
          userId: 'resolved-zs',
          name: '张三',
        }),
      };

      await service.updatePlan('plan-1', { invitees: '13800138000 张三' }, mockDingtalkClient);

      expect(mockDingtalkClient.getUserIdByMobile).toHaveBeenCalledWith('13800138000');
      expect(mockPrisma.interview.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'resolved-zs',
            templateId: 'template-1',
            planId: 'plan-1',
            status: 'PENDING',
          },
        ],
      });
    });

    it('should skip phone entries when DingTalk lookup fails', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({ found: false }),
      };

      await service.updatePlan('plan-1', { invitees: '13800138000 张三' }, mockDingtalkClient);

      expect(mockPrisma.interview.createMany).not.toHaveBeenCalled();
      const updateCall = mockPrisma.interviewPlan.update.mock.calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId?: string;
        phone?: string;
        name: string;
      }>;
      expect(inviteeData).toHaveLength(1);
      expect(inviteeData[0].phone).toBe('13800138000');
    });

    it('should handle mixed phone and userId invitees in updatePlan', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        templateId: 'template-1',
      });
      mockPrisma.interview.findMany.mockResolvedValue([]);
      mockPrisma.interview.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.interview.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const mockDingtalkClient = {
        getUserIdByMobile: vi.fn().mockResolvedValue({
          found: true,
          userId: 'resolved-ls',
          name: '李四',
        }),
      };

      await service.updatePlan(
        'plan-1',
        { invitees: 'user-1 张三\n13900139000 李四' },
        mockDingtalkClient
      );

      expect(mockDingtalkClient.getUserIdByMobile).toHaveBeenCalledWith('13900139000');
      expect(mockPrisma.interview.createMany).toHaveBeenCalled();
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
