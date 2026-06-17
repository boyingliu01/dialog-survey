import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/', 'coverage/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.config.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        // TODO: 补充集成测试后移除此排除 - https://github.com/boyingliu01/dialog-survey/issues/61
        'scripts/cli.mjs',
        'src/server.ts',
        'src/index.ts',
      ],
    },
    globals: true,
    environment: 'node',
    hookTimeout: 10000,
    testTimeout: 10000,
  },
});
