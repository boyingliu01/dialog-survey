// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.{test,spec}.ts',
    '!src/types/**/*',
    '!src/**/types/**/*',
  ],
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  concurrency: 4,
  thresholds: {
    high: 80,
    low: 60,
  },
  reporters: ['html', 'clear-text', 'progress'],
  disableTypeChecks: true,
  excludedMutations: ['string', 'logical-operator'],
  ignorePatterns: ['.stryker-tmp', 'dist', 'coverage', 'node_modules'],
  timeoutFactor: 2.0,
  maxTestRunnerReuse: 50,
};
