// @no-test-required: covered by tests/database-health-repository.test.ts
import { error } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';

export interface DbHealthResult {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

/**
 * Database connectivity probe for /health (REQ-181): keeps the raw
 * `$queryRaw` access out of the API layer. Semantics are identical to the
 * former inline `checkDatabase()` in src/api/health.ts.
 */
export class DatabaseHealthRepository {
  constructor(private prisma: PrismaClient) {}

  async check(): Promise<DbHealthResult> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return { status: 'ok', latencyMs };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      error('Database health check failed', { error: errMsg });
      return { status: 'error', error: errMsg };
    }
  }
}
