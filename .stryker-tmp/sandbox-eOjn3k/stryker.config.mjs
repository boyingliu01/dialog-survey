// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/utils/logger.ts',
    'src/utils/security.ts',
    'src/utils/date.ts',
    'src/utils/encryption.ts',
    'src/utils/validation.ts',
    'src/utils/pii-anonymizer.ts',
    'src/services/conversation-engine.ts',
    'src/services/followup.service.ts',
    'src/services/prompt.service.ts',
    'src/services/asr.service.ts',
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
  ignorePatterns: ['.stryker-tmp', 'dist', 'coverage', 'node_modules'],
  timeoutFactor: 2.0,
  maxTestRunnerReuse: 50,
};
