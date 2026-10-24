import os from 'node:os';
import { defineConfig } from 'vitest/config';

// §3.6 starting point: PGlite per-file workers hold ~140MB+ each — cap the
// pool, refine only if T-m3/T-m4 measurements say otherwise.
const maxWorkers = Math.min(4, os.cpus().length);

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/', 'coverage/'],
    globalSetup: ['tests/global-setup.ts'],
    coverage: {
      provider: 'v8',
      // `json-summary` is not cosmetic: xp-gate's Gate 5 reads
      // coverage/coverage-summary.json to get the numbers. Without it the gate
      // reports "DEGRADED (coverage: N/A%)" and its thresholds are never
      // actually enforced locally. Do not drop it.
      //
      // `all: true` is what makes those numbers mean something. xp-gate's Gate 5
      // runs `vitest run --coverage <changed test files>`, so only files the
      // selected tests actually import get instrumented. When none of them
      // imports a src module, istanbul writes
      //   total.lines = { total: 0, covered: 0, pct: "Unknown" }
      // and the hook does `Math.round("Unknown")` => NaN, then
      // `[ NaN -lt 80 ]`, which bash rejects with "integer expression expected"
      // and treats as false — so the gate printed `NaN% ✅` and passed. That was
      // xp-gate #594, and the real full-suite coverage is ~93%.
      //
      // `include` (not the removed `all`) plus `cleanOnRerun: false` is what
      // makes untested files appear even on a subset run: @vitest/coverage-v8
      // only merges them when `options.include != null && (allTestsRun ||
      // !cleanOnRerun)`. A subset run has allTestsRun=false, so without
      // cleanOnRerun:false the branch is skipped and the total stays "Unknown".
      include: ['src/**/*.ts'],
      cleanOnRerun: false,
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Issue #150: these thresholds are what makes the CI "Coverage Check
      // (80/80/70/80)" job blocking. They were silently dropped twice — once in
      // a rebase-conflict resolution (PR #161) and never restored in the #149
      // merge — while pr.yml still claimed "thresholds are enforced by
      // vitest.config.ts". tests/coverage-gate.test.ts guards this block.
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'src/generated/**',
        '**/*.config.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/index.ts',
        'scripts/',
        'src/server.ts',
      ],
    },
    globals: true,
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
    retry: 1,
    fileParallelism: true,
    maxWorkers,
  },
});
