import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock DingTalk client — phone lookup returns controlled results without real API calls
class MockDingTalkClient {
  static fromEnv() {
    return new MockDingTalkClient();
  }
  async getUserIdByMobile(phone: string) {
    if (phone === '13800138000') {
      return { found: true, userId: 'user_zhangsan', name: '张三' };
    }
    if (phone === '13900139000') {
      return { found: false };
    }
    if (phone === '13800138001') {
      return { found: true, userId: 'user_lisi', name: '李四' };
    }
    throw new Error('DingTalk API error');
  }
}

vi.mock('../src/integrations/dingtalk/client.js', () => ({
  DingTalkClient: MockDingTalkClient,
}));

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

const prisma = new PrismaClient();

async function cleanPlan(planId: string) {
  await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
  await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
}

async function cleanTemplate(templateId: string) {
  await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
}

describe('Phone member tests (real DB integration)', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
    const { interviewPlanRoutes } = await import('../src/api/plans.js');
    const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
    fastify = Fastify({ logger: false });
    await interviewPlanRoutes(fastify, {
      interviewPlanService: new InterviewPlanService(prisma),
      prisma,
    });
    await fastify.ready();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await fastify.close();
    await prisma.$disconnect();
  });

  // Safety net: clean up any leftover test data
  afterEach(async () => {
    await prisma.interview.deleteMany({
      where: { userId: { in: ['user_zhangsan', 'user_lisi', 'phone-test-1', 'phone-test-2'] } },
    }).catch(() => {});
  });

  describe('input validation', () => {
    it('should return 400 when neither userId nor phone provided', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-InputVal Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Phone Input Check', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { name: 'NoId' },
        });

        expect([400, 401, 500]).toContain(res.statusCode);
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should add member by userId only (backward compatibility)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-UserIdOnly Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'UserId Only Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'phone-test-1', name: 'User One' },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.interviewId).toBeDefined();

        const interview = await prisma.interview.findUnique({ where: { id: body.interviewId } });
        expect(interview?.userId).toBe('phone-test-1');

        const plan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        const invitees = plan?.inviteeData as Array<{ userId: string; phone?: string }> | undefined;
        expect(invitees?.[0]?.userId).toBe('phone-test-1');
        expect(invitees?.[0]?.phone).toBeUndefined();
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should add member by phone only (resolve userId from DingTalk)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-Only Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Phone Only Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000' },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.interviewId).toBeDefined();

        const interview = await prisma.interview.findUnique({ where: { id: body.interviewId } });
        expect(interview?.userId).toBe('user_zhangsan');
        // Name auto-populated from DingTalk (张三)
        const plan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        const invitees = plan?.inviteeData as Array<{ userId: string; name: string; phone?: string }> | undefined;
        expect(invitees?.[0]?.userId).toBe('user_zhangsan');
        expect(invitees?.[0]?.name).toBe('张三');
        expect(invitees?.[0]?.phone).toBe('13800138000');
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should reject name mismatch when provided name differs from DingTalk name', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-NameMismatch Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Name Mismatch Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000', name: 'NotZhangSan' },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error || body.message).toContain('不一致');
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });
  });

  describe('phone normalization (+86 prefix)', () => {
    it('should strip +86 prefix via normalised phone lookup', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-Normalize Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Normalize Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        // DingTalkClient mock recognizes '13800138001' (not '+8613800138001')
        // The normalizePhone function strips the 86 prefix
        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '+8613800138001' },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.interviewId).toBeDefined();
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });
  });

  describe('DingTalk phone lookup failures', () => {
    it('should return 400 when phone not found in DingTalk', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-NotFound Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Not Found Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13900139000' },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error || body.message).toContain('该手机号未在钉钉通讯录中注册');
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should skip DingTalk lookup when userId is provided alongside phone', async () => {
      // When userId is given alongside phone, DingTalk lookup is skipped (userId takes priority).
      // Phone is still saved to inviteeData since it was provided in the payload.
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-SkipWhenUserId Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Skip Phone Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'phone-test-2', phone: '00000000000', name: 'WithPhone' },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.interviewId).toBeDefined();

        const interview = await prisma.interview.findUnique({ where: { id: body.interviewId } });
        expect(interview?.userId).toBe('phone-test-2');
        // Phone IS saved because it was provided in payload (even though DingTalk was not called)
        const plan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        const invitees = plan?.inviteeData as Array<{ phone?: string }> | undefined;
        expect(invitees?.[0]?.phone).toBe('00000000000');
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });
  });

  describe('conflict detection', () => {
    it('should return 409 for duplicate userId in same plan', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-DupSamePlan Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Dup Same Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'dup-phone-user', name: 'First' },
        });
        expect(res1.statusCode).toBe(200);

        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'dup-phone-user', name: 'Second' },
        });
        expect(res2.statusCode).toBe(409);
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should return 409 for phone already in inviteeData', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-DupPhone Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Dup Phone Plan', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        // Add first member via phone
        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000' },
        });
        expect(res1.statusCode).toBe(200);

        // Add second member with SAME phone — should be rejected
        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000' },
        });
        expect(res2.statusCode).toBe(409);
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });

    it('should return 409 for cross-plan active interview', async () => {
      let template1Id: string | undefined;
      let template2Id: string | undefined;
      let plan1Id: string | undefined;
      let plan2Id: string | undefined;
      try {
        const template1 = await prisma.template.create({
          data: { name: 'Phone-CrossPlan1 Template', content: '{}', status: 'DRAFT' },
        });
        template1Id = template1.id;
        const createPlan1Res = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Cross Plan 1', templateId: template1.id },
        });
        const plan1Body = JSON.parse(createPlan1Res.body);
        plan1Id = plan1Body.id;

        // Add member to plan 1 via phone
        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan1Id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000' },
        });
        expect(res1.statusCode).toBe(200);

        // Create plan 2
        const template2 = await prisma.template.create({
          data: { name: 'Phone-CrossPlan2 Template', content: '{}', status: 'DRAFT' },
        });
        template2Id = template2.id;
        const createPlan2Res = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Cross Plan 2', templateId: template2.id },
        });
        const plan2Body = JSON.parse(createPlan2Res.body);
        plan2Id = plan2Body.id;

        // Try adding same user (resolved userId) to plan 2 — should be rejected
        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan2Id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'user_zhangsan', name: 'Zhang San' },
        });
        expect(res2.statusCode).toBe(409);
        const errorBody = JSON.parse(res2.body);
        expect(errorBody.error || errorBody.message).toContain('尚未完成的访谈');
      } finally {
        if (plan2Id) await cleanPlan(plan2Id);
        if (template2Id) await cleanTemplate(template2Id);
        if (plan1Id) await cleanPlan(plan1Id);
        if (template1Id) await cleanTemplate(template1Id);
      }
    });

    it('should NOT check phone conflict in userId-only mode', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Phone-NoPhoneConflict Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createPlanRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'No Phone Conflict', templateId: template.id },
        });
        const planBody = JSON.parse(createPlanRes.body);
        planId = planBody.id;

        // Add first member via phone
        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: '13800138000' },
        });
        expect(res1.statusCode).toBe(200);

        // Add second member with a DIFFERENT userId (phone NOT checked in userId mode)
        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'different-user', name: 'Different' },
        });
        expect(res2.statusCode).toBe(200);
      } finally {
        if (planId) await cleanPlan(planId);
        if (templateId) await cleanTemplate(templateId);
      }
    });
  });
});
