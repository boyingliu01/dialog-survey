// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    // Core logic - services
    'src/services/followup.service.ts',
    'src/services/analysis.service.ts',
    'src/services/report.service.ts',
    'src/services/analytics.service.ts',
    // Utils
    'src/utils/security.ts',
    'src/utils/retry.ts',
    'src/utils/logger.ts',
    'src/utils/asr.service.ts',
    'src/services/asr.service.ts',
    'src/utils/pii-anonymizer.ts',
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
  ignorePatterns: ['.stryker-tmp', 'dist', 'coverage', 'node_modules', 'tests'],
  timeoutFactor: 2.0,
  maxTestRunnerReuse: 50,
  buildCommand: 'npx tsc --noEmit',
};
