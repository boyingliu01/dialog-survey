import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { TestDatabase } from '../../helpers/test-db.js';

export interface E2EServer {
  app: FastifyInstance;
  prisma: PrismaClient;
  testDb: TestDatabase;
  teardown: () => Promise<void>;
}

/**
 * Create a full E2E test server with real database.
 * Uses processStreamMessage directly (not HTTP webhook) for interview simulation.
 * External services (DingTalk, LLM) must be mocked individually by test files.
 */
export async function createE2EServer(): Promise<E2EServer> {
  process.env['NODE_ENV'] = 'test';

  const testDb = new TestDatabase();
  await testDb.setup();

  const prisma = testDb.getPrisma();

  return {
    app: null as unknown as FastifyInstance,
    prisma,
    testDb,
    teardown: async () => {
      await testDb.teardown();
    },
  };
}
