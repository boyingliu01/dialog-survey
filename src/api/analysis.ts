import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalysisService } from '../services/analysis.service.js';

const analyzeSingleSchema = z.object({
  interviewId: z.string().uuid(),
});

interface AnalysisRoutesOptions {
  prisma: PrismaClient;
}

export async function analysisRoutes(fastify: FastifyInstance, opts: AnalysisRoutesOptions) {
  const analysisService = new AnalysisService(opts.prisma);

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

    try {
      const result = await analysisService.createBatchReportIfEligible(planId);

      switch (result.kind) {
        case 'created':
          return reply.status(201).send({
            batchReportId: result.report.id,
            status: result.report.status,
          });
        case 'conflict':
          return reply.status(409).send({
            error: 'Aggregate analysis already running',
            existingReportId: result.existingId,
          });
        case 'no-completed':
          return reply.status(400).send({
            error: 'No COMPLETED interviews found in this plan',
          });
        case 'plan-not-found':
          return reply.status(404).send({ error: 'Plan not found' });
        default: {
          const _exhaustive: never = result;
          throw new Error(`Unhandled result kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      return reply.status(500).send({ error: errorMsg });
    }
  });

  fastify.get('/api/analysis/aggregate/:batchReportId', async (request, reply) => {
    const { batchReportId } = request.params as { batchReportId: string };

    try {
      const report = await analysisService.getBatchReportById(batchReportId);

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
