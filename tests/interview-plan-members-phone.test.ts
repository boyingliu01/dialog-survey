import { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DingTalkClient } from '../src/integrations/dingtalk/client.js';
import {
  InterviewPlanService,
  InvalidMemberInputError,
  MemberConflictError,
  MemberNotFoundError,
  PlanNotFoundError,
} from '../src/services/interview-plan-members.service.js';

// Mock Prisma
const mockPrisma = {
  interviewPlan: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  interview: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn((fn) => fn(mockPrisma)),
} as unknown as PrismaClient;

// Mock DingTalkClient
class MockDingTalkClient {
  async getUserIdByMobile(phone: string) {
    if (phone === '13800138000') {
      return { found: true, userId: 'user_zhangsan', name: '张三' } as const;
    }
    if (phone === '13900139000') {
      return { found: false } as const;
    }
    throw new Error('DingTalk API error');
  }
}

describe('InterviewPlanService.addMember with phone support', () => {
  let service: InterviewPlanService;
  let mockClient: MockDingTalkClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new MockDingTalkClient();
    // Create service with mock Prisma and mock DingTalkClient
    service = new InterviewPlanService(mockPrisma, mockClient as unknown as DingTalkClient);

    // Default plan mock
    (mockPrisma.interviewPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'plan-1',
      templateId: 'tpl-1',
      inviteeData: [],
    });
    (mockPrisma.interview.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'interview-1',
    });
    (mockPrisma.interview.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  describe('input validation', () => {
    it('should throw InvalidMemberInputError when neither userId nor phone is provided', async () => {
      await expect(service.addMember('plan-1', {})).rejects.toThrow(InvalidMemberInputError);
    });

    it('should work with userId only (backward compatibility)', async () => {
      await service.addMember('plan-1', { userId: 'user1', name: 'User One' });
      expect(mockPrisma.interview.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user1' }) })
      );
    });

    it('should work with phone only', async () => {
      await service.addMember('plan-1', { phone: '13800138000' });
      expect(mockPrisma.interview.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user_zhangsan' }) })
      );
    });

    it('should use name from client when provided even in phone mode', async () => {
      await service.addMember('plan-1', { phone: '13800138000', name: 'Custom Name' });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('DingTalk phone lookup', () => {
    it('should throw MemberNotFoundError when phone is not found in DingTalk', async () => {
      await expect(service.addMember('plan-1', { phone: '13900139000' })).rejects.toThrow(
        MemberNotFoundError
      );
    });

    it('should skip DingTalk lookup when userId is provided', async () => {
      const getUserIdSpy = vi.spyOn(mockClient, 'getUserIdByMobile');
      await service.addMember('plan-1', { userId: 'user1', name: 'User One' });
      expect(getUserIdSpy).not.toHaveBeenCalled();
    });
  });

  describe('conflict detection', () => {
    it('should throw MemberConflictError when userId already exists', async () => {
      (mockPrisma.interview.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-interview',
      });

      await expect(
        service.addMember('plan-1', { userId: 'user1', name: 'User One' })
      ).rejects.toThrow(MemberConflictError);
    });

    it('should throw MemberConflictError when phone already exists in inviteeData', async () => {
      (mockPrisma.interviewPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [{ userId: 'other-user', name: 'Other', phone: '13800138000' }],
      });

      await expect(service.addMember('plan-1', { phone: '13800138000' })).rejects.toThrow(
        'already exists'
      );
    });

    it('should not check phone conflict when userId only mode is used', async () => {
      // inviteeData has the same phone, but we're using userId mode - should not check
      (mockPrisma.interviewPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'plan-1',
        templateId: 'tpl-1',
        inviteeData: [{ userId: 'other-user', name: 'Other', phone: '13800138000' }],
      });

      // This should succeed - adding with different userId, phone conflict is not checked
      await expect(
        service.addMember('plan-1', { userId: 'new-user', name: 'New User' })
      ).resolves.toBeDefined();
    });
  });

  describe('inviteeData persistence', () => {
    it('should save phone to inviteeData when using phone mode', async () => {
      await service.addMember('plan-1', { phone: '13800138000' });

      const updateCall = (mockPrisma.interviewPlan.update as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId: string;
        name: string;
        phone?: string;
      }>;

      expect(inviteeData[0].phone).toBe('13800138000');
    });

    it('should NOT save phone to inviteeData when using userId only mode', async () => {
      await service.addMember('plan-1', { userId: 'user1', name: 'User One' });

      const updateCall = (mockPrisma.interviewPlan.update as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      const inviteeData = updateCall.data.inviteeData as Array<{
        userId: string;
        name: string;
        phone?: string;
      }>;

      expect(inviteeData[0].phone).toBeUndefined();
    });
  });

  describe('plan not found', () => {
    it('should throw PlanNotFoundError when plan does not exist', async () => {
      (mockPrisma.interviewPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.addMember('non-existent-plan', { userId: 'user1', name: 'User One' })
      ).rejects.toThrow(PlanNotFoundError);
    });
  });
});
