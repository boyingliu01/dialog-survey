import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanStatus } from '../src/utils/prisma-client.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

/**
 * @test REQ-202-PLAN-COMPLETE
 * @intent 访谈完成后必须自动把所属 InterviewPlan 从 RUNNING 收敛为 COMPLETED（写 completedAt），
 *         解决 issue #202：计划只有 1 名成员、访谈已完成，计划却永远停在 RUNNING。
 * @covers 最后一场访谈完成才置 COMPLETED、仍有进行中访谈保持 RUNNING、全 CANCELLED（无 COMPLETED）
 *         不置 COMPLETED、CANCELLED/PAUSED 计划不被复活、账务异常只记日志不影响访谈回合结果
 *
 * `completedCount` 列已在 bffaf4a 移除（改为按 interviews 关系动态统计），本文件不涉及该列。
 * 这里用真实 PGlite（见 tests/helpers/create-test-prisma.ts）而不是 mock，因为语义完全依赖
 * 关系上的状态分布：一个「全部访谈都已终态」的判定只有在真实 count 查询上才有意义。
 */

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// graph.ts's sibling `scheduleAnalysis` hook still calls getDb() → the real
// factory, which throws when DATABASE_URL is absent; that throw happens inside
// a bare setImmediate and would surface as an uncaught exception (see
// tests/graph.test.ts, which stubs the URL for the same reason). Stub it so the
// only failure left to observe is the one this file is about.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');

let prisma: PrismaClient;

// File-unique identifiers: suites share the process-wide PGlite database shape
// but each file gets its own instance, so collisions would only come from
// re-running this file — the cleanup predicates below scope by templateId.
const SUITE_TAG = 'REQ-202-plan-completion';

interface Fixture {
  templateId: string;
  planId: string;
}

const createdPlans: string[] = [];
const createdTemplates: string[] = [];

async function createTemplate(prismaClient: PrismaClient): Promise<string> {
  const template = await prismaClient.template.create({
    data: {
      name: `${SUITE_TAG} template`,
      description: 'Fixture template for plan completion tests',
      content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q1', 'q2'] }),
      status: 'DRAFT',
      createdBy: 'admin',
      updatedBy: 'admin',
    },
  });
  createdTemplates.push(template.id);
  return template.id;
}

async function createPlan(
  prismaClient: PrismaClient,
  status: PlanStatus = 'RUNNING'
): Promise<Fixture> {
  const templateId = await createTemplate(prismaClient);
  const plan = await prismaClient.interviewPlan.create({
    data: {
      name: `${SUITE_TAG} plan`,
      templateId,
      status,
      createdBy: 'admin',
      updatedBy: 'admin',
      startedAt: status === 'PENDING' ? null : new Date(),
    },
  });
  createdPlans.push(plan.id);
  return { templateId, planId: plan.id };
}

async function createInterview(
  prismaClient: PrismaClient,
  fixture: Fixture,
  status: 'PENDING' | 'ACTIVE' | 'PROCESSING' | 'WAITING' | 'COMPLETED' | 'CANCELLED',
  userId: string
): Promise<string> {
  const interview = await prismaClient.interview.create({
    data: {
      userId,
      templateId: fixture.templateId,
      planId: fixture.planId,
      status,
      ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
    },
  });
  return interview.id;
}

async function reloadPlan(prismaClient: PrismaClient, planId: string) {
  const plan = await prismaClient.interviewPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error(`Expected plan ${planId} to exist`);
  return plan;
}

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
});

afterEach(async () => {
  // Interviews cascade on plan deletion, so clearing plans is enough; the
  // template FK still has to go second.
  if (createdPlans.length > 0) {
    await prisma.interview.deleteMany({ where: { planId: { in: [...createdPlans] } } });
    await prisma.interviewPlan.deleteMany({ where: { id: { in: [...createdPlans] } } });
    createdPlans.length = 0;
  }
  if (createdTemplates.length > 0) {
    await prisma.template.deleteMany({ where: { id: { in: [...createdTemplates] } } });
    createdTemplates.length = 0;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** The service is imported lazily so the logger mock is in place first. */
async function loadService() {
  const { PlanCompletionService } = await import('../src/services/plan-completion.service.js');
  return new PlanCompletionService(prisma);
}

describe('PlanCompletionService.reconcileAfterInterviewCompleted', () => {
  it('flips the plan to COMPLETED (with completedAt) when its last interview completes', async () => {
    // The exact issue #202 shape: one member, one interview, now COMPLETED.
    const fixture = await createPlan(prisma, 'RUNNING');
    const interviewId = await createInterview(prisma, fixture, 'COMPLETED', 'user-202-a');

    const service = await loadService();
    const outcome = await service.reconcileAfterInterviewCompleted(interviewId);

    expect(outcome).toBe('completed');
    const plan = await reloadPlan(prisma, fixture.planId);
    expect(plan.status).toBe('COMPLETED');
    expect(plan.completedAt).toBeInstanceOf(Date);
  });

  it('keeps the plan RUNNING while any interview is still in flight', async () => {
    const fixture = await createPlan(prisma, 'RUNNING');
    const interviewId = await createInterview(prisma, fixture, 'COMPLETED', 'user-202-b1');
    await createInterview(prisma, fixture, 'ACTIVE', 'user-202-b2');

    const service = await loadService();
    const outcome = await service.reconcileAfterInterviewCompleted(interviewId);

    expect(outcome).toBe('running');
    const plan = await reloadPlan(prisma, fixture.planId);
    expect(plan.status).toBe('RUNNING');
    expect(plan.completedAt).toBeNull();
  });

  it.each(['PENDING', 'PROCESSING', 'WAITING'] as const)(
    'keeps the plan RUNNING when another interview is %s',
    async (otherStatus) => {
      const fixture = await createPlan(prisma, 'RUNNING');
      const interviewId = await createInterview(prisma, fixture, 'COMPLETED', 'user-202-c1');
      await createInterview(prisma, fixture, otherStatus, `user-202-c2-${otherStatus}`);

      const service = await loadService();
      await service.reconcileAfterInterviewCompleted(interviewId);

      expect((await reloadPlan(prisma, fixture.planId)).status).toBe('RUNNING');
    }
  );

  it('completes the plan when the remaining interviews are CANCELLED', async () => {
    const fixture = await createPlan(prisma, 'RUNNING');
    const interviewId = await createInterview(prisma, fixture, 'COMPLETED', 'user-202-d1');
    await createInterview(prisma, fixture, 'CANCELLED', 'user-202-d2');

    const service = await loadService();
    const outcome = await service.reconcileAfterInterviewCompleted(interviewId);

    expect(outcome).toBe('completed');
    expect((await reloadPlan(prisma, fixture.planId)).status).toBe('COMPLETED');
  });

  it('does not flip an all-CANCELLED plan that has zero COMPLETED interviews', async () => {
    // Nothing was ever actually completed, so "收集完成" would be a lie: the
    // plan must stay RUNNING for an operator to notice and act.
    const fixture = await createPlan(prisma, 'RUNNING');
    await createInterview(prisma, fixture, 'CANCELLED', 'user-202-e1');
    const cancelledInterviewId = await createInterview(prisma, fixture, 'CANCELLED', 'user-202-e2');

    const service = await loadService();
    const outcome = await service.reconcileAfterInterviewCompleted(cancelledInterviewId);

    expect(outcome).toBe('running');
    const plan = await reloadPlan(prisma, fixture.planId);
    expect(plan.status).toBe('RUNNING');
    expect(plan.completedAt).toBeNull();
  });

  it.each(['CANCELLED', 'PAUSED', 'COMPLETED', 'READY', 'PENDING'] as const)(
    'does not resurrect a plan already in %s',
    async (planStatus) => {
      const fixture = await createPlan(prisma, planStatus);
      const interviewId = await createInterview(prisma, fixture, 'COMPLETED', 'user-202-f1');

      const service = await loadService();
      const outcome = await service.reconcileAfterInterviewCompleted(interviewId);

      expect(outcome).toBe('ignored');
      const plan = await reloadPlan(prisma, fixture.planId);
      expect(plan.status).toBe(planStatus);
      expect(plan.completedAt).toBeNull();
    }
  );

  it('ignores an interview that belongs to no plan', async () => {
    const templateId = await createTemplate(prisma);
    const standalone = await prisma.interview.create({
      data: {
        userId: 'user-202-standalone',
        templateId,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    try {
      const service = await loadService();
      expect(await service.reconcileAfterInterviewCompleted(standalone.id)).toBe('ignored');
    } finally {
      await prisma.interview.deleteMany({ where: { id: standalone.id } });
    }
  });

  it('ignores a missing interview instead of throwing', async () => {
    const service = await loadService();
    expect(await service.reconcileAfterInterviewCompleted('no-such-interview')).toBe('ignored');
  });
});

describe('runInterviewGraph plan completion hook', () => {
  async function loadGraphWithSpies() {
    vi.resetModules();
    const reconcile = vi.fn().mockResolvedValue('completed');
    vi.doMock('../src/services/analysis.service.js', () => ({
      AnalysisService: class {
        analyzeInterview(): Promise<void> {
          return Promise.resolve();
        }
      },
    }));
    vi.doMock('../src/services/plan-completion.service.js', () => ({
      PlanCompletionService: class {
        reconcileAfterInterviewCompleted(id: string): Promise<string> {
          return reconcile(id) as Promise<string>;
        }
      },
    }));
    vi.doMock('../src/core/nodes/planning.js', () => ({
      planningNode: vi.fn().mockResolvedValue({ response: '开场白', status: 'ACTIVE' }),
    }));
    const interviewingNode = vi.fn();
    vi.doMock('../src/core/nodes/interviewing.js', () => ({ interviewingNode }));
    const { runInterviewGraph } = await import('../src/core/graph.js');
    return { runInterviewGraph, reconcile, interviewingNode };
  }

  function activeState(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'u1',
      interviewId: 'iv-202-graph',
      templateId: 'tpl-1',
      status: 'ACTIVE' as const,
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: 2,
      responses: [],
      reportGenerated: false,
      version: 1,
      originalVersion: 1,
      pendingMessages: [],
      pendingResponses: [],
      nudgeCount: 0,
      ...overrides,
    };
  }

  afterEach(() => {
    vi.doUnmock('../src/services/analysis.service.js');
    vi.doUnmock('../src/services/plan-completion.service.js');
    vi.doUnmock('../src/core/nodes/planning.js');
    vi.doUnmock('../src/core/nodes/interviewing.js');
    vi.resetModules();
  });

  it('re-evaluates the plan when an interview completes', async () => {
    const { runInterviewGraph, reconcile, interviewingNode } = await loadGraphWithSpies();
    interviewingNode.mockResolvedValue({ response: '再见', shouldContinue: false });

    const result = await runInterviewGraph(activeState(), { userId: 'u1', content: 'end' });
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledWith('iv-202-graph'), {
      timeout: 2000,
      interval: 5,
    });

    expect(result.response).toBe('再见');
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('does not re-evaluate the plan while the interview continues', async () => {
    const { runInterviewGraph, reconcile, interviewingNode } = await loadGraphWithSpies();
    interviewingNode.mockResolvedValue({ response: '下一问', shouldContinue: true });

    await runInterviewGraph(activeState(), { userId: 'u1', content: 'answer' });
    await new Promise((r) => setImmediate(r));

    expect(reconcile).not.toHaveBeenCalled();
  });

  it('returns the graph result unchanged when plan bookkeeping throws', async () => {
    const { runInterviewGraph, reconcile, interviewingNode } = await loadGraphWithSpies();
    interviewingNode.mockResolvedValue({ response: '再见', shouldContinue: false });
    reconcile.mockRejectedValue(new Error('bookkeeping exploded'));

    const result = await runInterviewGraph(activeState(), { userId: 'u1', content: 'end' });
    // The interviewee's turn must never fail because a plan counter did.
    expect(result.response).toBe('再见');
    expect(result.nextState.status).toBe('ACTIVE');

    await vi.waitFor(() => expect(reconcile).toHaveBeenCalled(), { timeout: 2000, interval: 5 });
    const { error } = await import('../src/utils/logger.js');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Plan completion'),
      expect.objectContaining({ interviewId: 'iv-202-graph', error: 'bookkeeping exploded' })
    );
  });

  it('logs the synchronous construction failure without failing the turn', async () => {
    // getDb()/createPrismaClient() throws when DATABASE_URL is absent; the
    // fire-and-forget hook must swallow that too.
    vi.resetModules();
    const reconcile = vi.fn();
    vi.doMock('../src/services/analysis.service.js', () => ({
      AnalysisService: class {
        analyzeInterview(): Promise<void> {
          return Promise.resolve();
        }
      },
    }));
    vi.doMock('../src/services/plan-completion.service.js', () => ({
      PlanCompletionService: class {
        constructor() {
          throw new Error('DATABASE_URL is required to create a PrismaClient');
        }
        reconcileAfterInterviewCompleted(id: string): Promise<string> {
          return reconcile(id) as Promise<string>;
        }
      },
    }));
    vi.doMock('../src/core/nodes/interviewing.js', () => ({
      interviewingNode: vi.fn().mockResolvedValue({ response: '再见', shouldContinue: false }),
    }));
    const { runInterviewGraph } = await import('../src/core/graph.js');

    const result = await runInterviewGraph(activeState(), { userId: 'u1', content: 'end' });
    expect(result.response).toBe('再见');

    await vi.waitFor(
      async () => {
        const { error } = await import('../src/utils/logger.js');
        expect(error).toHaveBeenCalledWith(
          'Plan completion failed',
          expect.objectContaining({ interviewId: 'iv-202-graph' })
        );
      },
      { timeout: 2000, interval: 5 }
    );
  });
});
