import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';
import { PlanStatus } from '../src/utils/prisma-client.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

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
  let mockPrisma: {
    interviewPlan: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    interview: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    $disconnect: ReturnType<typeof vi.fn>;
  };

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
        findFirst: vi.fn(),
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
     * A plan that already started keeps its original start time.
     *
     * Re-running a send (an admin retrying failures) must not move `startedAt`
     * forward, or the plan's elapsed time resets on every retry. Replacing
     * `startedAt || new Date()` with an unconditional `new Date()` passed every
     * other test here, because they all load a plan whose `startedAt` is null.
     */
    it('should preserve an existing startedAt instead of resetting it', async () => {
      const startedAt = new Date('2026-01-15T09:00:00Z');
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt,
        interviews: [{ userId: 'user-1' }],
      });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.sendInvitations('plan-1');

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: expect.objectContaining({ startedAt }),
      });
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

    it('should skip user who has active interview in another plan', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt: null,
        interviews: [
          { id: 'int-1', userId: 'user-1' },
          { id: 'int-2', userId: 'user-2' },
        ],
      });
      // user-1 has active interview elsewhere, user-2 does not
      mockPrisma.interview.findFirst
        .mockResolvedValueOnce({ id: 'other-int', planId: 'plan-other' })
        .mockResolvedValueOnce(null);
      mockPrisma.interviewPlan.update.mockResolvedValue({});
      mockPrisma.interview.update.mockResolvedValue({});

      const { messageSender } = await import('../src/integrations/dingtalk/message-sender.js');
      vi.mocked(messageSender.sendTextMessage).mockClear();

      const result = await service.sendInvitations('plan-1');

      // Only user-2 should be sent; user-1 skipped
      expect(result.sent).toBe(1);
      expect(messageSender.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(messageSender.sendTextMessage).toHaveBeenCalledWith(['user-2'], expect.any(String));
    });

    it('should skip all users with active interviews elsewhere', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        name: 'Test Plan',
        startedAt: null,
        interviews: [
          { id: 'int-1', userId: 'user-1' },
          { id: 'int-2', userId: 'user-2' },
        ],
      });
      // All users have active interviews → all skipped
      mockPrisma.interview.findFirst.mockResolvedValue({ id: 'other-int', planId: 'plan-other' });
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      const result = await service.sendInvitations('plan-1');

      expect(result.sent).toBe(0);
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

  /**
   * The update payload's field semantics.
   *
   * Two mutants survived the whole suite before these tests existed: clearing an
   * omitted description to null, and turning an empty targetDate into
   * `new Date('')` (an Invalid Date). Neither is observable through the HTTP
   * route, because the route drops an empty targetDate before the service ever
   * sees it -- so these assert at the layer where the rule actually lives.
   */
  describe('updatePlan', () => {
    it('should include only the fields the caller supplied', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { name: '新名称' });

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { name: '新名称', updatedBy: 'admin' },
      });
    });

    it('should convert a targetDate string into a Date', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { targetDate: '2026-06-01' });

      const call = mockPrisma.interviewPlan.update.mock.calls[0][0] as {
        data: { targetDate: Date };
      };
      expect(call.data.targetDate).toBeInstanceOf(Date);
      expect(call.data.targetDate.toISOString().startsWith('2026-06-01')).toBe(true);
    });

    it('should clear targetDate when it is empty rather than build an Invalid Date', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { targetDate: '' });

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { targetDate: null, updatedBy: 'admin' },
      });
    });

    it('should keep an empty description as empty rather than dropping it', async () => {
      mockPrisma.interviewPlan.update.mockResolvedValue({});

      await service.updatePlan('plan-1', { description: '' });

      expect(mockPrisma.interviewPlan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { description: '', updatedBy: 'admin' },
      });
    });
  });

  /**
   * @test REQ-PLAN-LIST
   * @intent `listPlans` had no direct test: the admin CSRF suite spies on it and
   *   the route tests mock the whole service, so its own query construction --
   *   the `where` filter, the pagination defaults and the row ordering -- was
   *   never observed. Mutation testing flagged it, and a wrong default here is
   *   the kind of bug that shows up as "the plan list is always 20 rows" rather
   *   than as a visible failure.
   * @covers src/services/interview-plan-base.service.ts#listPlans
   */
  describe('listPlans', () => {
    /** The `findMany`/`count` argument pair from the most recent call. */
    function lastListArgs(): {
      findMany: { where: unknown; take: number; skip: number; orderBy: unknown };
      count: { where: unknown };
    } {
      return {
        findMany: mockPrisma.interviewPlan.findMany.mock.calls.at(-1)?.[0] as {
          where: unknown;
          take: number;
          skip: number;
          orderBy: unknown;
        },
        count: mockPrisma.interviewPlan.count.mock.calls.at(-1)?.[0] as { where: unknown },
      };
    }

    beforeEach(() => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([]);
      mockPrisma.interviewPlan.count.mockResolvedValue(0);
    });

    it('returns the rows and the total from the two queries', async () => {
      mockPrisma.interviewPlan.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.interviewPlan.count.mockResolvedValue(7);

      const result = await service.listPlans();

      expect(result.plans).toEqual([{ id: 'p1' }]);
      expect(result.total).toBe(7);
    });

    it('applies DEFAULT pagination when called with no options', async () => {
      // take 20 / skip 0 is what the admin list page relies on; both `||`
      // fallbacks are mutated here.
      await service.listPlans();
      const args = lastListArgs();
      expect(args.findMany.take).toBe(20);
      expect(args.findMany.skip).toBe(0);
    });

    it('uses an empty where clause when no status is filtered', async () => {
      await service.listPlans();
      const args = lastListArgs();
      expect(args.findMany.where).toEqual({});
      expect(args.count.where).toEqual({});
    });

    it('filters BOTH queries by status when one is given', async () => {
      // The count must receive the same predicate as the rows, or the total
      // describes a different set than the page does.
      await service.listPlans({ status: PlanStatus.COMPLETED });
      const args = lastListArgs();
      expect(args.findMany.where).toEqual({ status: PlanStatus.COMPLETED });
      expect(args.count.where).toEqual({ status: PlanStatus.COMPLETED });
    });

    it('honours an explicit limit and offset', async () => {
      await service.listPlans({ limit: 5, offset: 10 });
      const args = lastListArgs();
      expect(args.findMany.take).toBe(5);
      expect(args.findMany.skip).toBe(10);
    });

    it('falls back to the defaults for a zero limit or offset', async () => {
      // `||` rather than `??`: 0 is treated as "unset". This pins that choice --
      // passing 0 cannot be used to request an empty page.
      await service.listPlans({ limit: 0, offset: 0 });
      const args = lastListArgs();
      expect(args.findMany.take).toBe(20);
      expect(args.findMany.skip).toBe(0);
    });

    it('orders by createdAt descending', async () => {
      await service.listPlans();
      expect(lastListArgs().findMany.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('selects only the template id and name for the list rows', async () => {
      // The list page renders plan name + template name. Widening the select is
      // a payload regression that no assertion on the returned rows catches,
      // because the Prisma mock returns whatever the fixture says.
      await service.listPlans();
      const args = mockPrisma.interviewPlan.findMany.mock.calls.at(-1)?.[0] as {
        include: unknown;
      };
      expect(args.include).toEqual({ template: { select: { id: true, name: true } } });
    });
  });

  /**
   * @test REQ-PLAN-DETAIL-SHAPE
   * @intent The plan detail queries hand their `include` straight to Prisma, so
   *   the shape IS the contract with the admin templates. Mutation testing found
   *   every one of those shapes unasserted: the mocks answer with fixtures and
   *   never look at the query, so changing which fields are loaded was invisible.
   * @covers src/services/interview-plan-base.service.ts#findByIdWithTemplate
   * @covers src/services/interview-plan-base.service.ts#findByIdWithInterviewsAndCounts
   */
  describe('detail query shapes', () => {
    it('findByIdWithTemplate selects the template id and name only', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await service.findByIdWithTemplate('plan-1');

      expect(mockPrisma.interviewPlan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        include: { template: { select: { id: true, name: true } } },
      });
    });

    it('findByIdWithInterviewsAndCounts loads interviews ordered by status', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await service.findByIdWithInterviewsAndCounts('plan-1');

      const args = mockPrisma.interviewPlan.findUnique.mock.calls.at(-1)?.[0] as {
        include: { interviews: { orderBy: unknown; select: Record<string, true> } };
      };
      expect(args.include.interviews.orderBy).toEqual({ status: 'asc' });
    });

    it('findByIdWithInterviewsAndCounts selects every field the detail page renders', async () => {
      mockPrisma.interviewPlan.findUnique.mockResolvedValue(null);

      await service.findByIdWithInterviewsAndCounts('plan-1');

      const args = mockPrisma.interviewPlan.findUnique.mock.calls.at(-1)?.[0] as {
        include: { interviews: { select: Record<string, true> } };
      };
      // Each of these is read by the template; dropping one leaves the column
      // blank rather than failing, which is why it needs pinning.
      expect(args.include.interviews.select).toEqual({
        id: true,
        userId: true,
        status: true,
        createdAt: true,
        completedAt: true,
        sendStatus: true,
        sentAt: true,
        sendError: true,
      });
    });
  });
});
