import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { recordAnalysisFailure, getFailedAnalyses } from '../src/services/dead-letter.service.js';

const prisma = new PrismaClient();

/**
 * @test REQ-SAFETY-001
 * @intent verify LLM analysis failures are recorded in dead-letter table for later retry
 * @covers AC-SINGLE-001-03, AC-RELIABILITY-001
 */
describe('Analysis Dead-Letter Service', () => {
  afterEach(async () => {
    await prisma.analysisFailure.deleteMany({ where: {} });
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

  /**
   * @test REQ-RELIABILITY-001
   * @intent verify failed analyses can be queried for batch retry
   * @covers AC-RELIABILITY-001-01
   */
  it('returns only failed analyses for batch retry', async () => {
    await recordAnalysisFailure('interview-1', 'LLM_ERROR', 'Rate limited');
    await recordAnalysisFailure('interview-2', 'LLM_TIMEOUT', 'Timed out');

    const failures = await getFailedAnalyses();
    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.interviewId)).toContain('interview-1');
    expect(failures.map((f) => f.interviewId)).toContain('interview-2');
  });

  it('does not record duplicate failures for same interview', async () => {
    await recordAnalysisFailure('interview-1', 'LLM_ERROR', 'Error 1');
    await recordAnalysisFailure('interview-1', 'LLM_ERROR', 'Error 2');

    const failures = await prisma.analysisFailure.findMany({
      where: { interviewId: 'interview-1' },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0].errorMessage).toBe('Error 1');
  });
});
