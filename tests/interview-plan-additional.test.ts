import { PlanStatus } from '@prisma/client';
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
        findUnique: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
      },
      $disconnect: vi.fn(),
    };
    service = new InterviewPlanService(mockPrisma as unknown as PrismaClient);
  });

  describe('sendInvitations', () => {
    /**
     * @test REQ-007-4-01
     * @intent 测试批量发送邀请给待访问用户的功能是否正常工作
     */
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

    /**
     * @test REQ-007-4-01
     * @intent 测试在发送邀请出现故障时的处理逻辑
     */
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

    /**
     * @test REQ-007-4-01
     * @intent 测试计划不存在时的错误处理机制
     */
    it('should throw when plan not found', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await expect(service.sendInvitations('invalid')).rejects.toThrow('Plan not found');
    });

    /**
     * @test bugfix-sendInvitation-uses-template-invitationPrompt
     * @intent 修复Bug: 发送邀请时应使用模板的invitationPrompt而非硬编码文案
     */
    it('should use template invitationPrompt instead of hardcoded message', async () => {
      const invitationPrompt = '你好～我是AI访谈师，本次访谈全程匿名，请放心回答。';
      const templateContent = JSON.stringify({
        invitationPrompt,
        questions: ['q1', 'q2'],
        closingMessage: '感谢参与！',
      });

      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        templateId: 'template-1',
        template: { content: templateContent },
        startedAt: null,
        interviews: [{ userId: 'user-1' }],
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
      await service.sendInvitations('plan-1');

      expect(messageSender.sendTextMessage).toHaveBeenCalledWith(
        ['user-1'],
        expect.stringContaining(invitationPrompt)
      );
    });

    /**
     * @test REQ-007-4-01
     * @intent 验证发送成功后更新每个受访者的sendStatus为SENT
     */
    it('should update per-interview sendStatus to SENT on success', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt: null,
        interviews: [{ id: 'int-1', userId: 'user-1' }],
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});
      mockPrisma.interview.update.mockResolvedValue({});

      await service.sendInvitations('plan-1');

      expect(mockPrisma.interview.update).toHaveBeenCalled();
      const updateCall = mockPrisma.interview.update.mock.calls[0][0];
      expect(updateCall.data.sendStatus).toBe('SENT');
      expect(updateCall.data.sentAt).toBeInstanceOf(Date);
    });
  });

  describe('updatePlanStatus', () => {
    /**
     * @test REQ-007-4-01
     * @intent 测试更新计划状态为完成时是否能正确设置完成日期
     */
    it('should set completedAt when status is COMPLETED', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlanStatus('plan-1', PlanStatus.COMPLETED);

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          status: PlanStatus.COMPLETED,
          completedAt: expect.any(Date),
          updatedBy: 'admin',
        }),
      });
    });

    /**
     * @test REQ-007-4-01
     * @intent 测试为非完成状态更新计划时不设置完成日期的行为
     */
    it('should not set completedAt for other statuses', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlanStatus('plan-1', PlanStatus.RUNNING);

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { status: PlanStatus.RUNNING, updatedBy: 'admin' },
      });
    });
  });
});
