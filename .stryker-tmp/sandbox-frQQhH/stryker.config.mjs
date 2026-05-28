// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/utils/logger.ts',
    'src/utils/date.ts',
    'src/utils/validation.ts',
    'src/utils/pii-anonymizer.ts',
    'src/services/followup.service.ts',
    'src/services/prompt.service.ts',
    'src/services/asr.service.ts',
    'src/core/**/*.ts',
    '!src/core/graph.ts',
  ],
  vitest: {
    configFile: 'vitest.config.ts',
  },
  testFilePattern: [
    'tests/logger.test.ts',
    'tests/followup-branches.test.ts',
    'tests/llm-followup-report.test.ts',
    'tests/asr.test.ts',
    'tests/pii-anonymizer.test.ts',
    'tests/core-nodes-branches.test.ts',
  ],
  concurrency: 4,
  thresholds: {
    high: 80,
    low: 60,
  },
  reporters: ['html', 'clear-text', 'progress'],
  disableTypeChecks: true,
  ignorePatterns: ['.stryker-tmp', 'dist', 'coverage', 'node_modules'],
  timeoutFactor: 2.0,
  maxTestRunnerReuse: 50,
};
