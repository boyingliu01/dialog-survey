import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getFailedAnalyses, recordAnalysisFailure } from '../src/services/dead-letter.service.js';

const prisma = new PrismaClient();

describe('Analysis Dead-Letter Service', () => {
  beforeEach(async () => {
    await prisma.analysisFailure.deleteMany({ where: {} });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * @test REQ-SAFETY-001
   * @intent verify LLM timeout or error is recorded with interviewId and error details
   * @covers AC-SINGLE-001-03
   */
  it('records failed analysis with interviewId and error', async () => {
    await recordAnalysisFailure('interview-123', 'LLM_TIMEOUT', 'Request timed out after 30s');

    const failures = await prisma.analysisFailure.findMany({
      where: { interviewId: 'interview-123' },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].errorType).toBe('LLM_TIMEOUT');
    expect(failures[0].errorMessage).toContain('timed out');
  });

  /** @test REQ-RELIABILITY-001 @intent verify failed analyses can be queried @covers AC-RELIABILITY-001-01 */
  it('returns only failed analyses for batch retry', async () => {
    await recordAnalysisFailure('dl-retry-a', 'LLM_ERROR', 'Rate limited');
    await recordAnalysisFailure('dl-retry-b', 'LLM_TIMEOUT', 'Timed out');

    const failures = await getFailedAnalyses();
    const dlFailures = failures.filter((f) => f.interviewId.startsWith('dl-retry-'));
    expect(dlFailures).toHaveLength(2);
    expect(dlFailures.map((f) => f.interviewId)).toContain('dl-retry-a');
    expect(dlFailures.map((f) => f.interviewId)).toContain('dl-retry-b');
  });

  it('does not record duplicate failures for same interview', async () => {
    await recordAnalysisFailure('dl-dedup', 'LLM_ERROR', 'Error 1');
    await recordAnalysisFailure('dl-dedup', 'LLM_ERROR', 'Error 2');

    const failures = await prisma.analysisFailure.findMany({
      where: { interviewId: 'dl-dedup' },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].errorMessage).toBe('Error 1');
  });
});
