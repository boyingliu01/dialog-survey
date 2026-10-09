import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InterviewPlanRepository } from '../src/repositories/interview-plan.repository.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

let prisma: PrismaClient;
let repo: InterviewPlanRepository;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
  repo = new InterviewPlanRepository(prisma);
});

describe('InterviewPlanRepository', () => {
  let templateId: string;
  let planId: string;

  beforeAll(async () => {
    const template = await prisma.template.create({
      data: {
        name: 'Test InterviewPlanRepository Template',
        description: 'Template for InterviewPlanRepository tests',
        content: JSON.stringify({ questions: ['Q1'] }),
      },
    });
    templateId = template.id;

    const plan = await prisma.interviewPlan.create({
      data: {
        templateId,
        name: 'Test InterviewPlanRepository Plan',
        inviteeData: [{ userId: 'user-1', name: '张三' }],
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await prisma.interviewPlan.deleteMany({ where: { id: planId } });
    await prisma.template.deleteMany({ where: { id: templateId } });
    await prisma.$disconnect();
  });

  describe('findById', () => {
    it('returns the full plan row for an existing id', async () => {
      const plan = await repo.findById(planId);
      expect(plan).not.toBeNull();
      expect(plan?.id).toBe(planId);
      expect(plan?.name).toBe('Test InterviewPlanRepository Plan');
      expect(plan?.status).toBeDefined();
    });

    it('returns null for a missing id', async () => {
      expect(await repo.findById('no-such-plan-id')).toBeNull();
    });
  });

  describe('findInviteeData', () => {
    it('returns only the inviteeData field for an existing id', async () => {
      const plan = await repo.findInviteeData(planId);
      expect(plan).not.toBeNull();
      expect(plan?.inviteeData).toEqual([{ userId: 'user-1', name: '张三' }]);
      // select projection: no other columns leak onto the result
      expect(Object.keys(plan ?? {}).sort()).toEqual(['inviteeData']);
    });

    it('returns null for a missing id', async () => {
      expect(await repo.findInviteeData('no-such-plan-id')).toBeNull();
    });
  });
});
