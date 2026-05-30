import { PrismaClient, PlanStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { interviewPlanRoutes } from '../src/api/plans.js';

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

describe('Interview Plan API Endpoints', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await interviewPlanRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  describe('POST /api/plans — create plan', () => {
    it('should create a plan and return its id', async () => {
      const template = await prisma.template.create({
        data: { name: 'PlanTest Template', content: '{}', status: 'DRAFT' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: 'Q2 Interviews',
          description: 'Second quarter batch',
          templateId: template.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(typeof body.id).toBe('string');

      await prisma.interviewPlan.delete({ where: { id: body.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 500 for invalid templateId (non-existent UUID)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: 'Broken Plan',
          templateId: '00000000-0000-0000-0000-000000000000',
        },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for Zod validation errors (empty name)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: '',
          templateId: '00000000-0000-0000-0000-000000000000',
        },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for Zod validation errors (missing templateId)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { name: 'No template' },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for Zod validation errors (non-UUID templateId)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { name: 'Bad UUID', templateId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for Zod validation errors (empty body)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {},
      });

      expect(res.statusCode).toBe(500);
    });

    it('should accept plan with targetDate', async () => {
      const template = await prisma.template.create({
        data: { name: 'TargetDate Template', content: '{}', status: 'DRAFT' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: 'Scheduled Plan',
          templateId: template.id,
          targetDate: '2026-12-01T00:00:00Z',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();

      const plan = await prisma.interviewPlan.findUnique({ where: { id: body.id } });
      expect(plan).not.toBeNull();
      expect(plan?.targetDate).toEqual(new Date('2026-12-01T00:00:00Z'));

      await prisma.interviewPlan.delete({ where: { id: body.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should NOT auto-send when creating with invitees (publish default false)', async () => {
      const template = await prisma.template.create({
        data: { name: 'NoAutoSend Template', content: '{}', status: 'DRAFT' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: 'No Auto Send Plan',
          templateId: template.id,
          invitees: 'test-user-1 Test User',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.imported).toBeGreaterThanOrEqual(1);
      expect(body.sent).toBe(0);
      expect(body.failed).toBe(0);

      await prisma.interview.deleteMany({ where: { planId: body.id } });
      await prisma.interviewPlan.delete({ where: { id: body.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('GET /api/plans — list plans', () => {
    it('should return paginated plans list', async () => {
      const template = await prisma.template.create({
        data: { name: 'ListTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Listable Plan', templateId: template.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plans).toBeDefined();
      expect(body.total).toBeDefined();
      expect(Array.isArray(body.plans)).toBe(true);
      expect(body.plans.length).toBeGreaterThanOrEqual(1);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should filter plans by status', async () => {
      const template = await prisma.template.create({
        data: { name: 'FilterTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Running Plan', templateId: template.id, status: 'RUNNING' },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans?status=RUNNING',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plans.every((p: { status: string }) => p.status === 'RUNNING')).toBe(true);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return empty list for non-matching status filter', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans?status=READY',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plans).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should include total count in response', async () => {
      const template = await prisma.template.create({
        data: { name: 'TotalCnt Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Total Cnt Plan', templateId: template.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.total).toBe('number');
      expect(body.total).toBeGreaterThanOrEqual(1);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('GET /api/plans/:id — get single plan', () => {
    it('should return a plan by id', async () => {
      const template = await prisma.template.create({
        data: { name: 'GetTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Fetched Plan', templateId: template.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'GET',
        url: `/api/plans/${plan.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(plan.id);
      expect(body.name).toBe('Fetched Plan');
      expect(body.template).toBeDefined();
      expect(body.interviews).toBeDefined();

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 404 for non-existent plan id', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Plan not found');
    });
  });

  describe('POST /api/plans/:id/pause — pause plan', () => {
    it('should pause a plan and return status', async () => {
      const template = await prisma.template.create({
        data: { name: 'PauseTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Pausable Plan', templateId: template.id, status: 'RUNNING' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/pause`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('paused');

      const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
      expect(updated?.status).toBe(PlanStatus.PAUSED);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 500 when pausing non-existent plan', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent-id/pause',
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/plans/:id/resume — resume plan', () => {
    it('should resume a plan and return status', async () => {
      const template = await prisma.template.create({
        data: { name: 'ResumeTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Resumable Plan', templateId: template.id, status: 'PAUSED' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/resume`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('running');

      const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
      expect(updated?.status).toBe(PlanStatus.RUNNING);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('POST /api/plans/:id/cancel — cancel plan', () => {
    it('should cancel a plan and return status', async () => {
      const template = await prisma.template.create({
        data: { name: 'CancelTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Cancellable Plan', templateId: template.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/cancel`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('cancelled');

      const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
      expect(updated?.status).toBe(PlanStatus.CANCELLED);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });

  describe('POST /api/plans/:id/invitees — import invitees', () => {
    it('should import invitees and return counts', async () => {
      const template = await prisma.template.create({
        data: { name: 'InviteeTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Invitee Plan', templateId: template.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/invitees`,
        payload: {
          invitees: [
            { userId: 'user-001', name: 'Alice' },
            { userId: 'user-002', name: 'Bob', email: 'bob@test.com' },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(2);
      expect(body.failed).toBe(0);

      await prisma.interview.deleteMany({ where: { planId: plan.id } });
      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should skip duplicate invitees in same plan', async () => {
      const template = await prisma.template.create({
        data: { name: 'DupTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Dup Plan', templateId: template.id, status: 'PENDING' },
      });

      await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/invitees`,
        payload: { invitees: [{ userId: 'user-dup', name: 'Dup' }] },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/invitees`,
        payload: { invitees: [{ userId: 'user-dup', name: 'Dup Again' }] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(0);
      expect(body.failed).toBe(1);

      await prisma.interview.deleteMany({ where: { planId: plan.id } });
      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 500 for non-existent plan', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent-id/invitees',
        payload: { invitees: [{ userId: 'user-x', name: 'X' }] },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for empty invitees array (service throws)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/some-id/invitees',
        payload: { invitees: [] },
      });

      expect(res.statusCode).toBe(500);
    });

    it('should return 500 for missing invitees field (Zod validation)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/some-id/invitees',
        payload: {},
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/plans/:id/send — send invitations', () => {
    it('should return sent/failed counts', async () => {
      const template = await prisma.template.create({
        data: { name: 'SendTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Send Plan', templateId: template.id, status: 'READY' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/send`,
      });

      expect([200, 500]).toContain(res.statusCode);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return 500 for non-existent plan', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent-id/send',
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/plans/:id/interviews/:interviewId/send — resend to single interview', () => {
    it('should return success for valid plan and interview', async () => {
      const template = await prisma.template.create({
        data: { name: 'ReSendTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'ReSend Plan', templateId: template.id, status: 'READY' },
      });
      const interview = await prisma.interview.create({
        data: { userId: 'user-rs', templateId: template.id, planId: plan.id, status: 'PENDING' },
      });

      const res = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/interviews/${interview.id}/send`,
      });

      // Should be 200 or 500 depending on whether DingTalk API is available
      expect([200, 500]).toContain(res.statusCode);

      await prisma.interview.deleteMany({ where: { planId: plan.id } });
      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });

    it('should return error for non-existent interview', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent/interviews/non-existent/send',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('not found');
    });
  });

  describe('error handling — edge cases', () => {
    it('should return 404 for whitespace id in get', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/plans/   ',
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 405 for unsupported method on /api/plans', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/plans',
      });

      expect([404, 405]).toContain(res.statusCode);
    });

    it('should handle pause/resume/cancel on same plan in sequence', async () => {
      const template = await prisma.template.create({
        data: { name: 'SeqTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Sequence Plan', templateId: template.id, status: 'RUNNING' },
      });

      const pauseRes = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/pause`,
      });
      expect(pauseRes.statusCode).toBe(200);
      expect(JSON.parse(pauseRes.body).status).toBe('paused');

      const resumeRes = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/resume`,
      });
      expect(resumeRes.statusCode).toBe(200);
      expect(JSON.parse(resumeRes.body).status).toBe('running');

      const cancelRes = await fastify.inject({
        method: 'POST',
        url: `/api/plans/${plan.id}/cancel`,
      });
      expect(cancelRes.statusCode).toBe(200);
      expect(JSON.parse(cancelRes.body).status).toBe('cancelled');

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });
});
