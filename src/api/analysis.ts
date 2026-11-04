import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AnalysisService } from '../services/analysis.service.js';

const analyzeSingleSchema = z.object({
  interviewId: z.string().uuid(),
});

interface AnalysisRoutesOptions {
  analysisService: AnalysisService;
}

/**
 * The possible aggregation outcomes, discriminated on `kind`.
 *
 * Modelled as a union rather than one shape with optional fields, because that is
 * what lets the switch's `default` narrow to `never` and break the build when the
 * service gains a new kind.
 */
type AggregateResult =
  | { kind: 'created'; report: { id: string; status: string } }
  | { kind: 'conflict'; existingId: string }
  | { kind: 'no-completed' }
  | { kind: 'plan-not-found' };

/** A ready-to-send API reply: status code plus body. */
interface AggregateReply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Turn an aggregation result into an HTTP reply.
 *
 * The `default` branch assigns to `never`, so adding a new result kind to the
 * service breaks the BUILD here rather than silently falling into whichever case
 * happens to read most plausibly. That is the reason this is a switch and not a
 * lookup table -- a table cannot prove exhaustiveness.
 */
function aggregateReply(result: AggregateResult): AggregateReply {
  switch (result.kind) {
    case 'created':
      return {
        status: 201,
        body: { batchReportId: result.report.id, status: result.report.status },
      };
    case 'conflict':
      return {
        status: 409,
        body: {
          error: 'Aggregate analysis already running',
          existingReportId: result.existingId,
        },
      };
    case 'no-completed':
      return { status: 400, body: { error: 'No COMPLETED interviews found in this plan' } };
    case 'plan-not-found':
      return { status: 404, body: { error: 'Plan not found' } };
    default: {
      const _exhaustive: never = result;
      throw new Error(`Unhandled result kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export async function analysisRoutes(fastify: FastifyInstance, opts: AnalysisRoutesOptions) {
  const analysisService = opts.analysisService;

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
      const outcome = aggregateReply(await analysisService.createBatchReportIfEligible(planId));
      return reply.status(outcome.status).send(outcome.body);
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
