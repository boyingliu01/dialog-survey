import { describe, expect, it, beforeEach } from 'vitest';
import { computeDimensionStats } from '../src/services/batch-aggregation.service.js';

/** @test REQ-BATCH-002 @intent verify dimension statistics are computed correctly @covers AC-BATCH-002-01 */
describe('Batch Aggregation: Dimension Statistics', () => {
  /** @test REQ-BATCH-002 @intent verify mention rate and sentiment breakdown calculation @covers AC-BATCH-002-01 */
  it('calculates mention rate and sentiment breakdown', () => {
    const dimensionTags = [
      [
        {
          dimensionId: 'stability',
          label: '稳定性',
          sentiment: 'negative',
          quotes: ['崩溃'],
        },
      ],
      [
        {
          dimensionId: 'stability',
          label: '稳定性',
          sentiment: 'positive',
          quotes: ['好转'],
        },
      ],
      [],
      [
        {
          dimensionId: 'usability',
          label: '易用性',
          sentiment: 'neutral',
          quotes: ['一般'],
        },
      ],
      [
        {
          dimensionId: 'stability',
          label: '稳定性',
          sentiment: 'negative',
          quotes: ['卡顿'],
        },
      ],
    ];

    const stats = computeDimensionStats(dimensionTags, 6);

    expect(stats.dimensions).toHaveLength(2);
    const stability = stats.dimensions.find((d) => d.dimensionId === 'stability');
    expect(stability).toBeDefined();
    expect(stability!.mentionRate).toBeCloseTo(0.5);
    expect(stability!.sentimentBreakdown.negative).toBeCloseTo(2 / 3);
    expect(stability!.sentimentBreakdown.positive).toBeCloseTo(1 / 3);

    const usability = stats.dimensions.find((d) => d.dimensionId === 'usability');
    expect(usability).toBeDefined();
    expect(usability!.mentionRate).toBeCloseTo(1 / 6);
  });

  it('returns empty stats when no dimensions', () => {
    const stats = computeDimensionStats([[], []], 2);
    expect(stats.dimensions).toHaveLength(0);
    expect(stats.totalInterviews).toBe(2);
  });

  it('handles single interview with multiple dimensions', () => {
    const dimensionTags = [
      [
        {
          dimensionId: 'stability',
          label: '稳定性',
          sentiment: 'negative',
          quotes: ['差'],
        },
        {
          dimensionId: 'performance',
          label: '性能',
          sentiment: 'negative',
          quotes: ['慢'],
        },
      ],
    ];

    const stats = computeDimensionStats(dimensionTags, 1);
    expect(stats.dimensions).toHaveLength(2);
    expect(stats.dimensions.find((d) => d.dimensionId === 'stability')!.mentionRate).toBe(1);
    expect(stats.dimensions.find((d) => d.dimensionId === 'performance')!.mentionRate).toBe(1);
  });
});

/** @test REQ-BATCH-006 @intent verify checkpoint tracks completed step @covers AC-BATCH-006-01 */
describe('Batch Aggregation: Checkpoint', () => {
  it('creates checkpoint with completed step', async () => {
    const { createCheckpoint } = await import('../src/services/batch-aggregation.service.js');
    const checkpoint = createCheckpoint(1, {
      dimensionStats: { stability: { mentionRate: 0.62 } },
    });

    expect(checkpoint.completedStep).toBe(1);
    expect(checkpoint.dimensionStats).toBeDefined();
  });

  it('resumes from checkpoint skipping completed steps', async () => {
    const { shouldSkipStep } = await import('../src/services/batch-aggregation.service.js');

    expect(shouldSkipStep(null, 2)).toBe(false);
    const checkpoint = { completedStep: 1, dimensionStats: {} };
    expect(shouldSkipStep(checkpoint, 1)).toBe(true);
    expect(shouldSkipStep(checkpoint, 2)).toBe(false);
  });
});

/** @test REQ-BATCH-005 @intent verify concurrency limit enforces max 3 @covers AC-BATCH-005-01 */
describe('Batch Aggregation: Concurrency', () => {
  it('limits concurrent execution to max parameter', async () => {
    const { executeWithConcurrencyLimit } = await import(
      '../src/services/batch-aggregation.service.js'
    );
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return i;
    });

    const results = await executeWithConcurrencyLimit(tasks, 3);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});

/** @test REQ-BATCH-007 @intent verify timeout aborts pipeline @covers AC-BATCH-007-01 */
describe('Batch Aggregation: Timeout', () => {
  it('rejects when operation exceeds timeout', async () => {
    const { runWithTimeout } = await import('../src/services/batch-aggregation.service.js');
    await expect(
      runWithTimeout(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'done';
      }, 10)
    ).rejects.toThrow();
  });

  it('completes when operation is within timeout', async () => {
    const { runWithTimeout } = await import('../src/services/batch-aggregation.service.js');
    const result = await runWithTimeout(async () => 'ok', 1000);
    expect(result).toBe('ok');
  });
});
