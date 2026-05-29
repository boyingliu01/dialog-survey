import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { analysisRoutes } from '../src/api/analysis.js';

const prisma = new PrismaClient();

/** @test REQ-REPORT-001 @intent verify GET aggregate report by batchReportId @covers AC-REPORT-001-01 */
describe('Report API Endpoints', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    await analysisRoutes(fastify, { prisma });
    await fastify.ready();
  });

  /** @test REQ-REPORT-001 @intent verify GET aggregate report returns full data @covers AC-REPORT-001-01 */
  it('GET /api/analysis/aggregate/:batchReportId returns full aggregate report', async () => {
    const [template, plan] = await prisma.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: { name: 'AggTest', content: '[]', status: 'DRAFT' },
      });
      const p = await tx.interviewPlan.create({
        data: { name: 'AggPlan', templateId: t.id, status: 'PENDING' },
      });
      return [t, p];
    });

    const report = await prisma.batchAnalysisReport.create({
      data: {
        planId: plan.id,
        templateId: template.id,
        type: 'SUMMARY',
        status: 'COMPLETED',
        content: '# Report',
        metrics: {
          dimensions: [{ dimensionId: 'stability', mentionRate: 0.62 }],
        },
        topics: { stability: [{ subTopicName: 'upgrades' }] },
        emergents: [{ name: 'security', mentionCount: 5, urgency: 'high' }],
      },
    });

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/analysis/aggregate/${report.id}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.metrics).toBeDefined();
    expect(body.topics).toBeDefined();
    expect(body.emergents).toBeDefined();

    await prisma.$transaction(async (tx) => {
      await tx.batchAnalysisReport.deleteMany({ where: { planId: plan.id } });
      await tx.interviewPlan.delete({ where: { id: plan.id } });
      await tx.template.delete({ where: { id: template.id } });
    });
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });
});
