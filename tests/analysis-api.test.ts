import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const prisma = new PrismaClient();

async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { analysisRoutes } = await import('../src/api/analysis.js');
  await app.register(analysisRoutes, { prisma });
  await app.ready();
  return app;
}

async function createAppWithMockService(
  method: string,
  resultOrError: unknown,
  shouldReject: boolean,
): Promise<FastifyInstance> {
  const { AnalysisService } = await import('../src/services/analysis.service.js');
  const fn = shouldReject
    ? vi.fn().mockRejectedValue(resultOrError)
    : vi.fn().mockResolvedValue(resultOrError);
  (AnalysisService.prototype as any)[method] = fn;
  const app = Fastify({ logger: false });
  const { analysisRoutes } = await import('../src/api/analysis.js');
  await app.register(analysisRoutes, { prisma });
  await app.ready();
  return app;
}

describe('Analysis API Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  describe('POST /api/analysis/single', () => {
    it('should return 500 when interviewId is not a valid UUID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/single',
        payload: { interviewId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/analysis/batch', () => {
    it('should return 400 when planId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/batch',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('planId is required');
    });
  });

  describe('GET /api/analysis/report/:interviewId', () => {
    it('should return 404 when report does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/analysis/report/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Report not found');
    });
  });

  describe('GET /api/analysis/aggregate/:batchReportId', () => {
    it('should return 404 when aggregate report does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/analysis/aggregate/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Aggregate report not found');

      await prisma.$disconnect();
    });
  });

  describe('POST /api/analysis/aggregate/:planId', () => {
    it('should return 400 when plan does not exist (completed interviews check runs first)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/aggregate/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('No COMPLETED interviews found in this plan');
    });
  });

  describe('POST /api/analysis/aggregate/:planId with real DB data', () => {
    const prisma = new PrismaClient();

    it('should return 409 when a RUNNING aggregate report already exists', async () => {
      const [template, plan] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: { name: 'AnaApiTest-Running', content: '[]', status: 'DRAFT' },
        });
        const p = await tx.interviewPlan.create({
          data: { name: 'AnaApiPlan-Running', templateId: t.id, status: 'PENDING' },
        });
        await tx.batchAnalysisReport.create({
          data: {
            planId: p.id,
            templateId: t.id,
            type: 'SUMMARY',
            status: 'RUNNING',
            content: '',
            metrics: {},
            topics: {},
            emergents: {},
          },
        });
        return [t, p];
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${plan.id}`,
      });

      expect(res.statusCode).toBe(409);

      await prisma.$transaction(async (tx) => {
        await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
        await tx.interviewPlan.delete({ where: { id: plan.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });

    it('should return 400 when plan has no COMPLETED interviews', async () => {
      const [template, plan] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: { name: 'AnaApiTest-NoCompleted', content: '[]', status: 'DRAFT' },
        });
        const p = await tx.interviewPlan.create({
          data: { name: 'AnaApiPlan-NoCompleted', templateId: t.id, status: 'PENDING' },
        });
        await tx.interview.create({
          data: {
            userId: 'user-incomplete',
            templateId: t.id,
            planId: p.id,
            status: 'ACTIVE',
            currentQuestion: 0,
          },
        });
        return [t, p];
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${plan.id}`,
      });

      expect(res.statusCode).toBe(400);

      await prisma.$transaction(async (tx) => {
        await tx.interview.deleteMany({ where: { planId: plan.id } });
        await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
        await tx.interviewPlan.delete({ where: { id: plan.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });

    it('should return 201 when plan has COMPLETED interviews', async () => {
      const [template, plan] = await prisma.$transaction(async (tx) => {
        const t = await tx.template.create({
          data: { name: 'AnaApiTest-Completed', content: '[]', status: 'DRAFT' },
        });
        const p = await tx.interviewPlan.create({
          data: { name: 'AnaApiPlan-Completed', templateId: t.id, status: 'COMPLETED' },
        });
        await tx.interview.create({
          data: {
            userId: 'user-completed',
            templateId: t.id,
            planId: p.id,
            status: 'COMPLETED',
            messages: { create: [{ role: 'user', content: 'test' }] },
          },
        });
        return [t, p];
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${plan.id}`,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.batchReportId).toBeDefined();
      expect(body.status).toBe('PENDING');

      await prisma.$transaction(async (tx) => {
        await tx.interview.deleteMany({ where: { planId: plan.id } });
        await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
        await tx.interviewPlan.delete({ where: { id: plan.id } });
        await tx.template.delete({ where: { id: template.id } });
      });
    });
  });

  describe('GET /api/analysis/cluster/:planId', () => {
    it('should return 200 for non-existent planId (returns empty clusters)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/analysis/cluster/00000000-0000-0000-0000-000000000000',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.clusters).toBeDefined();
    });
  });

  describe('POST /api/analysis/single error handling', () => {
    it('should throw 500 for non-existent interviewId (valid UUID, no interview)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/single',
        payload: { interviewId: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/analysis/aggregate/:batchReportId error handling', () => {
    it('should return 404 for invalid batchReportId format (not found path)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/analysis/aggregate/not-a-uuid',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/analysis/batch error handling', () => {
    it('should return 200 for valid planId with no interviews (empty batch results)', async () => {
      const template = await prisma.template.create({
        data: { name: 'BatchTest Template', content: '{}', status: 'DRAFT' },
      });
      const plan = await prisma.interviewPlan.create({
        data: { name: 'BatchTest Plan', templateId: template.id, status: 'PENDING' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/batch',
        payload: { planId: plan.id },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.total).toBe(0);

      await prisma.interviewPlan.delete({ where: { id: plan.id } });
      await prisma.template.delete({ where: { id: template.id } });
    });
  });
});

describe('Analysis API error paths via mock service', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  it('should return 500 when batchAnalyze throws', async () => {
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const orig = AnalysisService.prototype.batchAnalyze;
    AnalysisService.prototype.batchAnalyze = vi.fn().mockRejectedValue(new Error('DB error'));
    app = Fastify({ logger: false });
    const { analysisRoutes } = await import('../src/api/analysis.js');
    await app.register(analysisRoutes, { prisma });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analysis/batch',
      payload: { planId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('DB error');
    await app.close();
    AnalysisService.prototype.batchAnalyze = orig;
  });

  it('should return 500 when compareClusters throws', async () => {
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const orig = AnalysisService.prototype.compareClusters;
    AnalysisService.prototype.compareClusters = vi.fn().mockRejectedValue(new Error('Cluster error'));
    app = Fastify({ logger: false });
    const { analysisRoutes } = await import('../src/api/analysis.js');
    await app.register(analysisRoutes, { prisma });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/api/analysis/cluster/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Cluster error');
    await app.close();
    AnalysisService.prototype.compareClusters = orig;
  });

  it('should return 500 when createBatchReportIfEligible throws', async () => {
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const orig = AnalysisService.prototype.createBatchReportIfEligible;
    AnalysisService.prototype.createBatchReportIfEligible = vi.fn().mockRejectedValue(new Error('Aggregate error'));
    app = Fastify({ logger: false });
    const { analysisRoutes } = await import('../src/api/analysis.js');
    await app.register(analysisRoutes, { prisma });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analysis/aggregate/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Aggregate error');
    await app.close();
    AnalysisService.prototype.createBatchReportIfEligible = orig;
  });

  it('should return 404 when plan is not found explicitly', async () => {
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const orig = AnalysisService.prototype.createBatchReportIfEligible;
    AnalysisService.prototype.createBatchReportIfEligible = vi.fn().mockResolvedValue({ kind: 'plan-not-found' });
    app = Fastify({ logger: false });
    const { analysisRoutes } = await import('../src/api/analysis.js');
    await app.register(analysisRoutes, { prisma });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analysis/aggregate/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Plan not found');
    await app.close();
    AnalysisService.prototype.createBatchReportIfEligible = orig;
  });

  it('should return 500 when getBatchReportById throws', async () => {
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const orig = AnalysisService.prototype.getBatchReportById;
    AnalysisService.prototype.getBatchReportById = vi.fn().mockRejectedValue(new Error('Fetch error'));
    app = Fastify({ logger: false });
    const { analysisRoutes } = await import('../src/api/analysis.js');
    await app.register(analysisRoutes, { prisma });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/api/analysis/aggregate/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Fetch error');
    await app.close();
    AnalysisService.prototype.getBatchReportById = orig;
  });
});
