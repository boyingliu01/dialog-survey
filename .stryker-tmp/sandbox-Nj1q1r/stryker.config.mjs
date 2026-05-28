// @ts-nocheck
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/utils/**/*.ts',
    'src/services/**/*.ts',
    '!src/services/{dead-letter,interview-plan,analysis,report,batch-aggregation,message-sender,stream-message.service,asr,dingtalk.*,template-dimension,pii-anonymizer,retry,llm-clustering,followup,prompt}.service.ts',
    '!src/repositories/**/*.ts',
    '!src/integrations/**/*.ts',
    '!src/domains/**/*.ts',
    '!src/api/**/*.ts',
    '!src/**/index.ts',
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
