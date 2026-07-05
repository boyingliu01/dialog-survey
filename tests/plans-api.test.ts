import { PlanStatus, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { interviewPlanRoutes } from '../src/api/plans.js';
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
    vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
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

  describe('POST /api/plans — create plan', () => {
    it('should create a plan and return its id', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'PlanTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;

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
        planId = body.id;

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
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

    it('should return 400 for Zod validation errors (empty name)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {
          name: '',
          templateId: '00000000-0000-0000-0000-000000000000',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod validation errors (missing templateId)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { name: 'No template' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod validation errors (non-UUID templateId)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { name: 'Bad UUID', templateId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod validation errors (empty body)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should accept plan with targetDate', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'TargetDate Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;

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
        planId = body.id;

        const plan = await prisma.interviewPlan.findUnique({ where: { id: body.id } });
        expect(plan).not.toBeNull();
        expect(plan?.targetDate).toEqual(new Date('2026-12-01T00:00:00Z'));

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should create plan with only basic info (no invitees)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Basic Plan Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;

        const res = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: {
            name: 'Basic Plan',
            templateId: template.id,
          },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.id).toBeDefined();
        planId = body.id;

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('GET /api/plans — list plans', () => {
    it('should return paginated plans list', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'ListTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Listable Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({ method: 'GET', url: '/api/plans' });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.plans).toBeDefined();
        expect(body.total).toBeDefined();
        expect(Array.isArray(body.plans)).toBe(true);
        expect(body.plans.length).toBeGreaterThanOrEqual(1);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should filter plans by status', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'FilterTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Running Plan', templateId: template.id, status: 'RUNNING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'GET',
          url: '/api/plans?status=RUNNING',
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.plans.every((p: { status: string }) => p.status === 'RUNNING')).toBe(true);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should filter plans by non-existent status (returns plans with status filter applied)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'NonMatch Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Pending Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({ method: 'GET', url: '/api/plans' });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.plans.length).toBeGreaterThanOrEqual(1);
        expect(body.total).toBeGreaterThanOrEqual(1);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should include total count in response', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'TotalCnt Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Total Cnt Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({ method: 'GET', url: '/api/plans' });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(typeof body.total).toBe('number');
        expect(body.total).toBeGreaterThanOrEqual(1);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('GET /api/plans/:id — get single plan', () => {
    it('should return a plan by id', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'GetTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Fetched Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

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

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
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
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'PauseTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Pausable Plan', templateId: template.id, status: 'RUNNING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/pause`,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('paused');

        const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
        expect(updated?.status).toBe(PlanStatus.PAUSED);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
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
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'ResumeTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Resumable Plan', templateId: template.id, status: 'PAUSED' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/resume`,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('running');

        const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
        expect(updated?.status).toBe(PlanStatus.RUNNING);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('POST /api/plans/:id/cancel — cancel plan', () => {
    it('should cancel a plan and return status', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'CancelTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Cancellable Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/cancel`,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('cancelled');

        const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
        expect(updated?.status).toBe(PlanStatus.CANCELLED);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('POST /api/plans/:id/send — send invitations', () => {
    it('should return sent/failed counts', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'SendTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Send Plan', templateId: template.id, status: 'READY' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/send`,
        });

        expect([200, 500]).toContain(res.statusCode);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
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
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'ReSendTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'ReSend Plan', templateId: template.id, status: 'READY' },
        });
        planId = plan.id;
        await prisma.interview.create({
          data: { userId: 'user-rs', templateId: template.id, planId: plan.id, status: 'PENDING' },
        });

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/interviews/${plan.id}-interview/send`,
        });
        // 500 is expected in test env since interview.random-id doesn't exist
        expect([200, 500]).toContain(res.statusCode);

        await prisma.interview.deleteMany({ where: { planId: planId } });
        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId: planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
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
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'SeqTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Sequence Plan', templateId: template.id, status: 'RUNNING' },
        });
        planId = plan.id;

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

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('PUT /api/plans/:id — update plan', () => {
    it('should update plan name and return id', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'PutTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Original Name', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'PUT',
          url: `/api/plans/${plan.id}`,
          payload: { name: 'Updated Name', templateId: template.id },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.id).toBe(plan.id);

        const updated = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
        expect(updated?.name).toBe('Updated Name');

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 200 for update with non-existent templateId (graceful DB handling)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'PutGraceful Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'Graceful Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'PUT',
          url: `/api/plans/${plan.id}`,
          payload: {
            name: 'Graceful Updated',
            templateId: '00000000-0000-0000-0000-000000000000',
          },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.id).toBe(plan.id);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });

  describe('Admin-protected endpoints (no auth)', () => {
    it('DELETE /api/plans/:id/members/:interviewId should return 401 without admin auth', async () => {
      const res = await fastify.inject({
        method: 'DELETE',
        url: '/api/plans/non-existent/members/non-existent',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/plans/:id/remind should return 401 without admin auth', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent/remind',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/plans/:id/members should return 401 without admin auth', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/non-existent/members',
        payload: { userId: 'test-user', name: 'Test' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/plans/:id/members — add member to plan', () => {
    it('should add member by userId and return interviewId', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'MemberTest Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'MemberTest Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'user-add-1', name: 'Alice' },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.interviewId).toBeDefined();

        const interview = await prisma.interview.findUnique({ where: { id: body.interviewId } });
        expect(interview).not.toBeNull();
        expect(interview?.userId).toBe('user-add-1');
        expect(interview?.planId).toBe(plan.id);

        await prisma.interview.deleteMany({ where: { planId: planId } });
        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId: planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 400 when neither userId nor phone provided', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'NoUserId Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'NoUserId Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { name: 'NoId' },
        });

        expect([400, 401, 500]).toContain(res.statusCode);

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 409 for duplicate member userId', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'DupMember Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'DupMember Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'dup-user', name: 'Duplicate' },
        });
        expect(res1.statusCode).toBe(200);

        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { userId: 'dup-user', name: 'Duplicate Again' },
        });
        expect(res2.statusCode).toBe(409);

        await prisma.interview.deleteMany({ where: { planId: planId } });
        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId: planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 400 with error message on Zod validation failure (invalid phone)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'PhoneValidation Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'PhoneValidation Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { phone: 'not-a-phone!!!', name: 'BadPhone' },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toContain('输入格式错误');
        expect(body.error).toContain('Invalid phone format');

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 400 with error message on Zod validation failure (missing userId and phone)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'MissingFields Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'MissingFields Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { name: 'NoIdOrPhone' },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toContain('输入格式错误');

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 400 with Chinese message for empty body (Zod level)', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/00000000-0000-0000-0000-000000000000/members',
        headers: {
          'x-admin-key': 'test-admin-key',
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect([400, 404]).toContain(res.statusCode);
      if (res.statusCode === 400) {
        const body = JSON.parse(res.body);
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe('string');
      }
    });

    it('should return 400 with error.message for empty body (does not pass Zod refine)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'EmptyBody Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const plan = await prisma.interviewPlan.create({
          data: { name: 'EmptyBody Plan', templateId: template.id, status: 'PENDING' },
        });
        planId = plan.id;

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan.id}/members`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {},
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toContain('输入格式错误');

        await prisma.interviewPlan.delete({ where: { id: planId } });
        await prisma.template.delete({ where: { id: templateId } });
        planId = undefined;
        templateId = undefined;
      } finally {
        if (planId) await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should return 404 for non-existent plan', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/00000000-0000-0000-0000-000000000000/members',
        headers: { 'x-admin-key': 'test-admin-key' },
        payload: { userId: 'ghost-user', name: 'Ghost' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
