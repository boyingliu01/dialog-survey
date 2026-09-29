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
    maxWorkers,
  },
});
