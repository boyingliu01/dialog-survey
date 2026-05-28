// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/utils/**/*.ts',
    'src/services/**/*.ts',
    '!src/services/{dead-letter,interview-plan,analysis,report,batch-aggregation}.service.ts',
    '!src/repositories/**/*.ts',
    '!src/integrations/**/*.ts',
    '!src/domains/**/*.ts',
    '!src/api/**/*.ts',
  ],
  vitest: {
    configFile: 'vitest.config.ts',
  },
  concurrency: 4,
  thresholds: {
    high: 80,
    low: 60,
  },
  reporters: ['html', 'clear-text', 'progress'],
  disableTypeChecks: true,
  ignorePatterns: ['.stryker-tmp', 'dist', 'coverage', 'node_modules', 'tests/'],
  timeoutFactor: 2.0,
  maxTestRunnerReuse: 50,
};
