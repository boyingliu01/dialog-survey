import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/', 'coverage/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
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
  },
});
