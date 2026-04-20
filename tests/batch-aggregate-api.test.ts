import { PrismaClient } from '@prisma/client';
import Fastify, { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analysisRoutes } from '../src/api/analysis.js';

const prisma = new PrismaClient();

/** @test REQ-BATCH-001 @intent verify POST aggregate triggers batch analysis @covers AC-BATCH-001-01 */
describe('POST /api/analysis/aggregate/:planId', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await analysisRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  /** @test REQ-BATCH-001 @intent verify POST returns 201 when plan has COMPLETED interviews @covers AC-BATCH-001-01 */
  it('returns 201 with batchReportId when plan has COMPLETED interviews', async () => {
    const [template, plan] = await prisma.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: { name: 'AggPostTest', content: '[]', status: 'DRAFT' },
      });
      const p = await tx.interviewPlan.create({
        data: { name: 'AggPostPlan', templateId: t.id, status: 'COMPLETED' },
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

    const res = await fastify.inject({
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

  /** @test REQ-BATCH-001 @intent verify POST returns 409 when RUNNING report exists @covers AC-BATCH-001-02 */
  it('returns 409 when an aggregate report is already RUNNING', async () => {
    const [template, plan] = await prisma.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: { name: 'Agg409Test', content: '[]', status: 'DRAFT' },
      });
      const p = await tx.interviewPlan.create({
        data: { name: 'Agg409Plan', templateId: t.id, status: 'PENDING' },
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

    const res = await fastify.inject({
      method: 'POST',
      url: `/api/analysis/aggregate/${plan.id}`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.existingReportId).toBeDefined();

    await prisma.$transaction(async (tx) => {
      await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
      await tx.interviewPlan.delete({ where: { id: plan.id } });
      await tx.template.delete({ where: { id: template.id } });
    });
  });

  /** @test REQ-BATCH-001 @intent verify POST returns 400 when plan has no COMPLETED interviews @covers AC-BATCH-001-03 */
  it('returns 400 when plan has no COMPLETED interviews', async () => {
    const [template, plan] = await prisma.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: { name: 'Agg400Test', content: '[]', status: 'DRAFT' },
      });
      const p = await tx.interviewPlan.create({
        data: { name: 'Agg400Plan', templateId: t.id, status: 'PENDING' },
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

    const res = await fastify.inject({
      method: 'POST',
      url: `/api/analysis/aggregate/${plan.id}`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();

    await prisma.$transaction(async (tx) => {
      await tx.interview.deleteMany({ where: { planId: plan.id } });
      await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
      await tx.interviewPlan.delete({ where: { id: plan.id } });
      await tx.template.delete({ where: { id: template.id } });
    });
  });
});
