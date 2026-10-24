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

  /**
   * xp-gate #594: Gate 5 runs `vitest run --coverage <changed test files>`.
   * When none of those tests imports a src module, istanbul writes
   * `total.lines.pct = "Unknown"`, the hook does `Math.round("Unknown")` -> NaN,
   * and `[ NaN -lt 80 ]` fails in bash — which `if` reads as "condition false"
   * and so prints the PASS branch. The gate reported `NaN% ✅` and enforced
   * nothing.
   *
   * `coverage.include` + `cleanOnRerun: false` force untested files into the
   * report on a subset run too (@vitest/coverage-v8 only merges them when
   * `include != null && (allTestsRun || !cleanOnRerun)`), so the total is always
   * a real number and the NaN path is unreachable.
   */
  it('forces unimported sources into the report so a subset run cannot yield NaN', () => {
    expect(
      vitestConfig,
      'coverage.include is what makes untested files appear on a subset run'
    ).toMatch(/include:\s*\[\s*'src\/\*\*\/\*\.ts'\s*\]/);
    expect(
      vitestConfig,
      'cleanOnRerun: false is required for the include merge on a subset run'
    ).toMatch(/cleanOnRerun:\s*false/);
    // `all` was removed from @vitest/coverage-v8 v4; using it silently does nothing.
    expect(vitestConfig).not.toMatch(/^\s*all:\s*true/m);
  });
});
