import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterviewPlanService,
  MemberConflictError,
  PlanNotFoundError,
} from '../src/services/interview-plan.service.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

// REQ-181: the member-import DB logic moves verbatim from the
// /api/plans/:id/import-commit route into InterviewPlanService.importMembers.
// These tests pin the behavior contract (queries, order, error strings).
let prisma: PrismaClient;
let service: InterviewPlanService;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
  service = new InterviewPlanService(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('InterviewPlanService.importMembers', () => {
  let templateId: string;
  let planId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  beforeAll(async () => {
    const template = await prisma.template.create({
      data: {
        name: 'Test ImportMembers Template',
        description: 'fixture',
        content: JSON.stringify({ questions: ['Q1'] }),
      },
    });
    templateId = template.id;

    const plan = await prisma.interviewPlan.create({
      data: {
        templateId,
        name: 'Test ImportMembers Plan',
        status: 'PENDING',
        inviteeData: [],
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    const interviews = await prisma.interview.findMany({ where: { planId } });
    await prisma.response.deleteMany({
      where: { interviewId: { in: interviews.map((i) => i.id) } },
    });
    await prisma.message.deleteMany({
      where: { interviewId: { in: interviews.map((i) => i.id) } },
    });
    await prisma.interview.deleteMany({ where: { planId } });
    await prisma.auditLog.deleteMany({ where: { entityType: 'InterviewPlan', entityId: planId } });
    await prisma.interviewPlan.deleteMany({ where: { id: planId } });
    await prisma.template.deleteMany({ where: { id: templateId } });
  });

  it('throws PlanNotFoundError for a missing plan', async () => {
    await expect(service.importMembers('no-such-plan', [{ userId: 'u1' }])).rejects.toBeInstanceOf(
      PlanNotFoundError
    );
  });

  it('throws InvalidStateError when the plan is not PENDING/READY', async () => {
    await prisma.interviewPlan.update({ where: { id: planId }, data: { status: 'COMPLETED' } });
    try {
      await expect(service.importMembers(planId, [{ userId: 'u1' }])).rejects.toMatchObject({
        code: 'INVALID_STATE',
        message: '计划当前状态不允许导入成员',
      });
    } finally {
      await prisma.interviewPlan.update({ where: { id: planId }, data: { status: 'PENDING' } });
    }
  });

  it('throws MemberConflictError listing cross-plan active interviews', async () => {
    // Seed an active interview in ANOTHER plan for u-conflict.
    const otherPlan = await prisma.interviewPlan.create({
      data: { templateId, name: 'Other Plan' },
    });
    await prisma.interview.create({
      data: { userId: 'u-conflict', templateId, planId: otherPlan.id, status: 'ACTIVE' },
    });
    try {
      await expect(
        service.importMembers(planId, [{ userId: 'u-conflict' }])
      ).rejects.toBeInstanceOf(MemberConflictError);
      await expect(service.importMembers(planId, [{ userId: 'u-conflict' }])).rejects.toThrow(
        '以下成员已有尚未完成的访谈：userId=u-conflict 在计划'
      );
    } finally {
      await prisma.interview.deleteMany({ where: { planId: otherPlan.id } });
      await prisma.interviewPlan.deleteMany({ where: { id: otherPlan.id } });
    }
  });

  it('returns imported=0 with skipped when all users already exist in the plan', async () => {
    await prisma.interview.create({
      data: { userId: 'u-existing', templateId, planId, status: 'PENDING' },
    });
    const result = await service.importMembers(planId, [{ userId: 'u-existing' }]);
    expect(result).toEqual({ imported: 0, skipped: 1, interviewIds: [] });
  });

  it('creates interviews, appends inviteeData and writes a BATCH_IMPORT audit log', async () => {
    const result = await service.importMembers(planId, [
      { userId: 'u-new-1', inputName: '张三', dingtalkName: '张三三' },
      { userId: 'u-new-2' },
    ]);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.interviewIds).toHaveLength(2);

    const created = await prisma.interview.findMany({
      where: { planId, userId: { in: ['u-new-1', 'u-new-2'] } },
    });
    expect(created).toHaveLength(2);
    for (const interview of created) {
      expect(interview.status).toBe('PENDING');
      expect(interview.templateId).toBe(templateId);
    }

    const plan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
    const invitees = plan?.inviteeData as Array<{ userId: string; name: string }>;
    expect(invitees).toContainEqual({ userId: 'u-new-1', name: '张三三' });
    expect(invitees).toContainEqual({ userId: 'u-new-2', name: '' });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'InterviewPlan', entityId: planId, action: 'BATCH_IMPORT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit?.details ?? '{}')).toMatchObject({
      imported: 2,
      skipped: 0,
      totalRows: 2,
    });
  });

  it('rethrows transaction failures for the route to map onto a 500', async () => {
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('boom from tx'));
    try {
      await expect(
        service.importMembers(planId, [{ userId: `u-tx-fail-${Date.now()}` }])
      ).rejects.toThrow('boom from tx');
    } finally {
      spy.mockRestore();
    }
  });
});
