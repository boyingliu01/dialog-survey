// @ts-nocheck
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalysisService } from '../services/analysis.service.js';

const analyzeSingleSchema = z.object({
  interviewId: z.string().uuid(),
});

export async function analysisRoutes(fastify: FastifyInstance) {
  const analysisService = new AnalysisService();

  fastify.post('/api/analysis/single', async (request, reply) => {
    const { interviewId } = analyzeSingleSchema.parse(request.body);

    try {
      const result = await analysisService.analyzeInterview(interviewId);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      return reply.status(500).send({ error: errorMsg });
    }
  });

  fastify.post('/api/analysis/batch', async (request, reply) => {
    const { planId } = request.body as { planId: string };

    if (!planId) {
      return reply.status(400).send({ error: 'planId is required' });
    }

    try {
      const results = await analysisService.batchAnalyze(planId);
      return {
        total: results.length,
        results: results.map((r) => ({
          interviewId: r.interviewId,
          metrics: r.metrics,
        })),
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      return reply.status(500).send({ error: errorMsg });
    }
  });

  fastify.get('/api/analysis/cluster/:planId', async (request, reply) => {
    const { planId } = request.params as { planId: string };

    try {
      const clusters = await analysisService.compareClusters([planId]);
      return { clusters };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      return reply.status(500).send({ error: errorMsg });
    }
  });

  fastify.get('/api/analysis/report/:interviewId', async (request, reply) => {
    const { interviewId } = request.params as { interviewId: string };

    const report = await analysisService.getReportByInterviewId(interviewId);

    if (!report) {
      return reply.status(404).send({ error: 'Report not found' });
    }

    return report;
  });

  fastify.post('/api/analysis/aggregate/:planId', async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const prisma = analysisService.prisma;

    try {
      const existing = (await prisma.batchAnalysisReport.findFirst({
        where: { planId, status: 'RUNNING' },
      })) as { id: string } | null;

      if (existing) {
        return reply.status(409).send({
          error: 'Aggregate analysis already running',
          existingReportId: existing.id,
        });
      }

      const completed = (await prisma.interview.findFirst({
        where: { planId, status: 'COMPLETED' },
      })) as { id: string } | null;

      if (!completed) {
        return reply.status(400).send({
          error: 'No COMPLETED interviews found in this plan',
        });
      }

      const plan = (await prisma.interviewPlan.findUnique({
        where: { id: planId },
        select: { templateId: true },
      })) as { templateId: string } | null;

      if (!plan) {
        return reply.status(404).send({ error: 'Plan not found' });
      }

      const report = (await prisma.batchAnalysisReport.create({
        data: {
          planId,
          templateId: plan.templateId,
          type: 'SUMMARY',
          status: 'PENDING',
          content: '',
          metrics: {},
          topics: {},
          emergents: [],
        },
      })) as { id: string; status: string };

      return reply.status(201).send({
        batchReportId: report.id,
        status: report.status,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      return reply.status(500).send({ error: errorMsg });
    }
  });

  fastify.get('/api/analysis/aggregate/:batchReportId', async (request, reply) => {
    const { batchReportId } = request.params as { batchReportId: string };

    try {
      const report = await analysisService.prisma.batchAnalysisReport.findUnique({
        where: { id: batchReportId },
      });

      if (!report) {
        return reply.status(404).send({ error: 'Aggregate report not found' });
      }

      return reply.status(200).send(report);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      fastify.log.error({ error: errorMsg }, 'GET aggregate endpoint error');
      return reply.status(500).send({ error: errorMsg });
    }
  });
}
