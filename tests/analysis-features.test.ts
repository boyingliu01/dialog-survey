import { describe, expect, it } from 'vitest';
import { AnalysisService } from '../src/services/analysis.service.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';

/**
 * These cases exercise the REAL `AnalysisService`, not a copy of it.
 *
 * This file previously defined its own `AnalysisService` class and tested that
 * instead — 260 lines asserting the behaviour of three methods
 * (`calculateStatistics`, `clusterBySentiment`, `extractRepresentativeViewpoints`)
 * that do not exist on the production class at all. It stayed green no matter
 * what happened to the real implementation, and archlint reported the copy as a
 * `CodeClone` against `analysis.service.ts` because the sentiment scorer was
 * reproduced verbatim.
 *
 * `calculateMetrics` and `compareClusters` are reached through their real entry
 * points, which also covers the private `analyzeSentiment` / `extractTopics`
 * helpers they call.
 */

/** `calculateMetrics` never touches Prisma, so a bare stub is enough. */
const service = new AnalysisService({} as PrismaClient);

function metricsFor(contents: string[]): ReturnType<AnalysisService['calculateMetrics']> {
  return service.calculateMetrics(contents.map((content) => ({ content, followupDepth: 0 })));
}

describe('AnalysisService.calculateMetrics', () => {
  it('counts responses and rounds the average length', () => {
    const metrics = metricsFor(['abcd', 'ab']);

    expect(metrics.totalResponses).toBe(2);
    expect(metrics.avgResponseLength).toBe(3);
    expect(metrics.completionRate).toBe(1);
  });

  it('reports zeros rather than NaN for an empty response set', () => {
    const metrics = metricsFor([]);

    expect(metrics.totalResponses).toBe(0);
    expect(metrics.avgResponseLength).toBe(0);
    expect(metrics.completionRate).toBe(0);
    expect(metrics.followupDepth).toBe(0);
  });

  it('takes the deepest follow-up across responses', () => {
    const metrics = service.calculateMetrics([
      { content: 'a', followupDepth: 1 },
      { content: 'b', followupDepth: 4 },
      { content: 'c', followupDepth: 2 },
    ]);

    expect(metrics.followupDepth).toBe(4);
  });

  it('classifies positive sentiment when praise outweighs complaints', () => {
    expect(metricsFor(['很好，我很喜欢', '优秀']).sentiment).toBe('positive');
  });

  it('classifies negative sentiment when complaints outweigh praise', () => {
    expect(metricsFor(['很差', '失望']).sentiment).toBe('negative');
  });

  it('classifies neutral sentiment when praise and complaints cancel out', () => {
    expect(metricsFor(['好', '差']).sentiment).toBe('neutral');
  });

  it('classifies an answer with no sentiment words as neutral', () => {
    expect(metricsFor(['今天天气多云']).sentiment).toBe('neutral');
  });

  it('extracts the topics actually present in the text', () => {
    const metrics = metricsFor(['产品功能都不错', '服务体验一般']);

    expect(metrics.topicCoverage).toContain('产品');
    expect(metrics.topicCoverage).toContain('功能');
    expect(metrics.topicCoverage).toContain('服务');
    expect(metrics.topicCoverage).not.toContain('价格');
  });

  it('scores sentiment across all responses as one text', () => {
    // One praise against two complaints nets negative.
    expect(metricsFor(['好', '差', '糟糕']).sentiment).toBe('negative');
  });
});

describe('AnalysisService.compareClusters', () => {
  it('skips a cluster whose plan has no interviews', async () => {
    const prisma = {
      interview: { findMany: async () => [] },
    } as unknown as PrismaClient;

    expect(await new AnalysisService(prisma).compareClusters(['empty-plan'])).toEqual([]);
  });

  it('summarises a cluster from its interview responses', async () => {
    const prisma = {
      interview: {
        findMany: async () => [
          { responses: [{ content: '产品质量很好' }, { content: '功能也喜欢' }] },
          { responses: [{ content: '服务体验不错' }] },
        ],
      },
    } as unknown as PrismaClient;

    const [cluster] = await new AnalysisService(prisma).compareClusters(['plan-1']);

    expect(cluster?.clusterId).toBe('plan-1');
    expect(cluster?.memberCount).toBe(2);
    expect(cluster?.avgSentiment).toBe('positive');
    expect(cluster?.keyThemes).toContain('产品');
    expect(cluster?.representativeViewpoints).toHaveLength(3);
  });

  it('returns one entry per non-empty cluster, in the requested order', async () => {
    const prisma = {
      interview: {
        findMany: async ({ where }: { where: { planId: string } }) =>
          where.planId === 'plan-b' ? [] : [{ responses: [{ content: '好' }] }],
      },
    } as unknown as PrismaClient;

    const clusters = await new AnalysisService(prisma).compareClusters([
      'plan-a',
      'plan-b',
      'plan-c',
    ]);

    expect(clusters.map((c) => c.clusterId)).toEqual(['plan-a', 'plan-c']);
  });
});
