// @no-test-required: Vitest config consumed only by the Stryker runner; behaviour is exercised by mutation runs themselves (see tests/mutation-testing.test.ts for the static contract)
import base from './vitest.config.js';

/**
 * Vitest profile for Stryker mutant runs (issue #155).
 *
 * Stryker drives one vitest instance per worker and forces single-threaded
 * execution inside each, so parallelism comes from Stryker's concurrency —
 * not vitest's own pool. The browser-level e2e suites are excluded: they add
 * minutes of dry-run time per mutant without adding kill signal beyond the
 * unit + integration layers for the mutated file.
 */
export default {
  ...base,
  test: {
    ...base.test,
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: [...(base.test.exclude ?? []), 'tests/e2e/**', 'tests/**/*.e2e.test.ts'],
    // Never retry inside a mutant run: a flake would misreport a mutant.
    retry: 0,
  },
};
