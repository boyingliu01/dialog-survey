import type { FastifyInstance } from 'fastify';
import type { Browser, BrowserContext } from 'playwright';
// @no-test-required: E2E test infrastructure helper, exercised by E2E test files
import type { PrismaClient } from '../../../src/utils/prisma-client.js';
import { TestDatabase } from '../../helpers/test-db.js';

const OWNED_ENV_KEYS = [
  'NODE_ENV',
  'SESSION_SECRET',
  'SESSION_SALT',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
] as const;

type OwnedEnvKey = (typeof OWNED_ENV_KEYS)[number];

function snapshotEnvironment(): ReadonlyMap<OwnedEnvKey, string | undefined> {
  return new Map(OWNED_ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot: ReadonlyMap<OwnedEnvKey, string | undefined>): void {
  for (const key of OWNED_ENV_KEYS) {
    const value = snapshot.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export interface E2EServer {
  app: FastifyInstance;
  prisma: PrismaClient;
  testDb: TestDatabase;
  baseUrl: string;
  teardown: () => Promise<void>;
}

export async function closeE2EResources(
  server: E2EServer | undefined,
  browser: Browser | undefined,
  context: BrowserContext | undefined
): Promise<void> {
  try {
    if (context) await context.close();
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (server) await server.teardown();
    }
  }
}

/**
 * Create a full E2E test server with real database and HTTP listener.
 * Used by Playwright E2E tests that need a real HTTP server.
 * External services (DingTalk, LLM) must have dummy env vars configured.
 */
export async function createE2EServer(port = 0): Promise<E2EServer> {
  const environment = snapshotEnvironment();
  let testDb: TestDatabase | undefined;
  let app: FastifyInstance | undefined;

  process.env['NODE_ENV'] = 'test';
  // Set dummy env vars for auth session
  if (!process.env['SESSION_SECRET'])
    process.env['SESSION_SECRET'] = 'e2e-session-secret-key-32chars!!';
  if (!process.env['SESSION_SALT'])
    process.env['SESSION_SALT'] = '0123456789abcdef0123456789abcdef';
  // Set E2E admin credentials for login tests
  if (!process.env['ADMIN_USERNAME']) process.env['ADMIN_USERNAME'] = 'e2e-admin';
  if (!process.env['ADMIN_PASSWORD_HASH'])
    process.env['ADMIN_PASSWORD_HASH'] =
      '$2a$04$/n0nx2VL1x0uOwVndrujnufaskvd7PG9fLC.MsbejxijyJmoALqAG';
  // Set dummy DingTalk env vars so DingTalkStreamClient.fromEnv() doesn't throw
  if (!process.env['DINGTALK_CLIENT_ID']) process.env['DINGTALK_CLIENT_ID'] = 'e2e-dummy-client-id';
  if (!process.env['DINGTALK_CLIENT_SECRET'])
    process.env['DINGTALK_CLIENT_SECRET'] = 'e2e-dummy-client-secret';
  // Issue #172: force the no-LLM fallback path unconditionally. A host .env with a
  // reachable LLM gateway would otherwise make report content model-generated and
  // non-deterministic (server.ts dotenv keeps already-set vars, so this beats .env
  // too). Port 9 (discard) refuses connections instantly, matching CI.
  process.env['LLM_BASE_URL'] = 'http://127.0.0.1:9/v1';
  process.env['LLM_API_KEY'] = 'e2e-dummy-llm-key';
  process.env['LLM_MODEL'] = 'e2e-dummy-model';

  try {
    testDb = new TestDatabase();
    await testDb.setup();
    const prisma = testDb.getPrisma();
    const { buildApp } = await import('../../../src/server.js');
    const builtApp = await buildApp({ prismaFactory: () => prisma });
    app = builtApp.fastify;
    await app.listen({ port, host: '127.0.0.1' });
    const address = app.server.address();
    const baseUrl =
      typeof address === 'object' && address
        ? `http://127.0.0.1:${address.port}`
        : 'http://127.0.0.1:3001';
    const readyApp = app;
    const readyTestDb = testDb;
    let isClosed = false;

    return {
      app: readyApp,
      prisma,
      testDb: readyTestDb,
      baseUrl,
      teardown: async () => {
        if (isClosed) return;
        isClosed = true;
        try {
          await readyApp.close();
        } finally {
          try {
            await readyTestDb.teardown();
          } finally {
            restoreEnvironment(environment);
          }
        }
      },
    };
  } catch (setupError) {
    try {
      if (app) await app.close();
    } catch (cleanupError) {
      void cleanupError;
    } finally {
      try {
        if (testDb) await testDb.teardown();
      } catch (cleanupError) {
        void cleanupError;
      } finally {
        restoreEnvironment(environment);
      }
    }
    throw setupError;
  }
}
