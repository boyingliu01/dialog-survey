import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * @test ISSUE-150
 * @intent AC-150-01 vitest.config.ts 声明 80/80/70/80 覆盖率阈值（防止再次被无声丢弃）；
 * AC-150-02 CI coverage job 不再使用 if: always()，正常依赖前置 job。
 * @covers AC-150-01, AC-150-02
 */
describe('coverage gate (issue #150)', () => {
  const vitestConfig = readFileSync('vitest.config.ts', 'utf-8');
  const prWorkflow = readFileSync('.github/workflows/pr.yml', 'utf-8');

  it('declares the 80/80/70/80 coverage thresholds in vitest.config.ts', () => {
    // The thresholds block was silently lost once already (dropped while
    // resolving a rebase conflict during PR #161) — this test is the
    // regression tripwire for issue #150.
    const thresholds = vitestConfig.match(/thresholds:\s*\{([^}]*)\}/s);
    expect(thresholds, 'coverage.thresholds block is missing from vitest.config.ts').toBeTruthy();
    expect(thresholds?.[1]).toMatch(/statements:\s*80/);
    expect(thresholds?.[1]).toMatch(/branches:\s*70/);
    expect(thresholds?.[1]).toMatch(/functions:\s*80/);
    expect(thresholds?.[1]).toMatch(/lines:\s*80/);
  });

  it('coverage job does not bypass its prerequisites with if: always()', () => {
    const coverageJob = prWorkflow.match(/^ {2}coverage:\n([\s\S]*?)(?=^ {2}\S)/m);
    expect(coverageJob, 'coverage job not found in pr.yml').toBeTruthy();
    // A step-level `if: always()` (e.g. upload-artifact) is fine; the JOB-level
    // one is what made the check non-blocking.
    expect(coverageJob?.[1]).not.toMatch(/^\s{4}if:/m);
    expect(coverageJob?.[1]).toMatch(/needs:\s*\[[^\]]*integration-tests/);
  });
});
