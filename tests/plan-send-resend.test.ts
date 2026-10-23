import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * @test REQ-155-PLAN-SEND
 * @intent 覆盖重发邀请 `resendToInterview` 的全部分支（归属校验、计数去重、成功/失败落库），提升变异分数
 * @covers 找不到 interview、interview 不属于该 plan、模板解析失败、成功路径的 sentCount、失败路径的 failedCount、已计过数时不重复累加
 *
 * Gate M had interview-plan-send.service.ts at 34.98% with 75 mutants never
 * executed at all — `resendToInterview` had no test whatsoever. It is the
 * recovery path an operator reaches for when an invitation did not arrive, so
 * the branch that decides whether to increment sentCount versus failedCount
 * (and whether to increment them twice for a re-resend) is worth pinning.
 */

const mockSendTextMessage = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();

vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
  messageSender: { sendTextMessage: (...a: unknown[]) => mockSendTextMessage(...a) },
}));

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  warn: (...a: unknown[]) => mockWarn(...a),
  error: (...a: unknown[]) => mockError(...a),
  debug: vi.fn(),
}));

interface MockPlan {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

interface MockInterview {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
}

interface MockTemplate {
  findUnique: ReturnType<typeof vi.fn>;
}

interface MockPrisma {
  interviewPlan: MockPlan;
  interview: MockInterview;
  template: MockTemplate;
  $disconnect: ReturnType<typeof vi.fn>;
}

const PLAN_ID = 'plan-1';
const INTERVIEW_ID = 'iv-1';

function interviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERVIEW_ID,
    userId: 'user-1',
    sendStatus: 'NOT_SENT',
    plan: { id: PLAN_ID, name: '质量效能访谈', templateId: 'tpl-1' },
    ...overrides,
  };
}

describe('resendToInterview', () => {
  let prisma: MockPrisma;
  let service: InterviewPlanService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTextMessage.mockResolvedValue({ taskId: 't', successCount: 1, failedUserIds: [] });
    prisma = {
      interviewPlan: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      interview: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      template: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ content: JSON.stringify({ invitationPrompt: '' }) }),
      },
      $disconnect: vi.fn(),
    };
    service = new InterviewPlanService(prisma as unknown as PrismaClient);
  });

  it('reports a missing interview without touching any table', async () => {
    prisma.interview.findUnique.mockResolvedValue(null);

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain(`Interview not found: ${INTERVIEW_ID}`);
    expect(prisma.interview.update).not.toHaveBeenCalled();
    expect(prisma.interviewPlan.update).not.toHaveBeenCalled();
  });

  it('refuses to resend for an interview belonging to another plan', async () => {
    prisma.interview.findUnique.mockResolvedValue(
      interviewFixture({ plan: { id: 'other-plan', name: 'x', templateId: 'tpl-1' } })
    );

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not belong to plan');
    // Guarding here matters: without it, a stale panel could send the wrong
    // plan's invitation and bump the wrong counters.
    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(prisma.interviewPlan.update).not.toHaveBeenCalled();
  });

  it('marks the interview sent and increments sentCount on success', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(true);
    expect(prisma.interview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INTERVIEW_ID },
        data: expect.objectContaining({ sendStatus: 'SENT', sendError: null }),
      })
    );
    expect(prisma.interviewPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { sentCount: { increment: 1 } },
    });
  });

  it('does not double-count an interview that was already SENT', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture({ sendStatus: 'SENT' }));

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(true);
    // The counter tracks distinct interviews, not attempts.
    expect(prisma.interviewPlan.update).not.toHaveBeenCalled();
  });

  it('does not double-count an interview that had already FAILED', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture({ sendStatus: 'FAILED' }));

    await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(prisma.interviewPlan.update).not.toHaveBeenCalled();
  });

  it('counts a previously FAILED interview on a successful resend', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture({ sendStatus: 'FAILED' }));

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(true);
    // FAILED was already tallied under failedCount, so a success must not touch
    // sentCount — but it also must not fail.
    expect(prisma.interview.update).toHaveBeenCalled();
  });

  it('records the failure and increments failedCount when sending fails', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());
    mockSendTextMessage.mockResolvedValue({
      taskId: 't',
      successCount: 0,
      failedUserIds: ['user-1'],
      errors: [{ userId: 'user-1', error: 'robot not found' }],
    });

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('robot not found');
    expect(prisma.interview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sendStatus: 'FAILED' }),
      })
    );
    expect(prisma.interviewPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { failedCount: { increment: 1 } },
    });
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resend invitation'),
      expect.objectContaining({ planId: PLAN_ID, interviewId: INTERVIEW_ID })
    );
  });

  it('does not increment failedCount twice for a previously failed interview', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture({ sendStatus: 'FAILED' }));
    mockSendTextMessage.mockResolvedValue({
      taskId: 't',
      successCount: 0,
      failedUserIds: ['user-1'],
    });

    await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(prisma.interviewPlan.update).not.toHaveBeenCalled();
  });

  it('surfaces a non-Error rejection as its string form', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());
    mockSendTextMessage.mockRejectedValue('plain failure');

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain('plain failure');
  });

  it('omits the template prompt when the template content is malformed', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());
    prisma.template.findUnique.mockResolvedValue({ content: 'not json' });

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse template content'),
      expect.objectContaining({ templateId: 'tpl-1' })
    );
    // Falls back to the generic invitation copy rather than blocking the resend.
    const message = mockSendTextMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('您被邀请参与');
  });

  it('uses the template prompt when the content parses', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());
    prisma.template.findUnique.mockResolvedValue({
      content: JSON.stringify({ invitationPrompt: '自定义开场白' }),
    });

    await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    const message = mockSendTextMessage.mock.calls[0]?.[1] as string;
    expect(message).toContain('自定义开场白');
  });

  it('still resends when the template row is missing', async () => {
    prisma.interview.findUnique.mockResolvedValue(interviewFixture());
    prisma.template.findUnique.mockResolvedValue(null);

    const result = await service.resendToInterview(PLAN_ID, INTERVIEW_ID);

    expect(result.success).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalled();
  });
});
