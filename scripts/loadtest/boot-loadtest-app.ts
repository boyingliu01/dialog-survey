// @no-test-required: manually/CI-driven harness; its correctness gate is the loadtest run itself (npm run loadtest)
/**
 * Loadtest boot harness (REQ-180 / DR-001).
 *
 * Boots the production `buildApp()` in-process against a PGlite database
 * (default) or a real PostgreSQL (LOADTEST_USE_REAL_PG=1 — used by the CI
 * loadtest job to measure true connection-pool behaviour).
 *
 * Environment must be prepared BEFORE server.ts is imported: its module
 * top-level reads NODE_ENV. NODE_ENV=test skips dotenv override and the
 * 100/min rate limiter, which would otherwise floor the measurement.
 *
 * Credential-free is enforced in code, not left to the environment: all
 * LLM/DingTalk credential variables are deleted before buildApp() runs —
 * once before the import (dotenv may load .env with override:false and
 * backfill them) and once after (final guarantee), so the S6 handler can
 * never silently take a real-LLM path and pollute the baseline.
 */
import type { PrismaClient } from '../../src/utils/prisma-client.js';

const CREDENTIAL_ENV_VARS = [
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
  // Aliases read by src/integrations/dingtalk/token-manager.ts
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_MODEL',
  'DASHSCOPE_EMBEDDING_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_TIMEOUT',
  'VOLCENGINE_API_KEY',
  'VOLCENGINE_BASE_URL',
  'VOLCENGINE_MODEL',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

function deleteCredentialEnv(): void {
  for (const name of CREDENTIAL_ENV_VARS) {
    delete process.env[name];
  }
}

function prepareEnv(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['SESSION_SECRET'] ??= 'loadtest-session-secret-0123456789abcdef';
  // 32 hex chars — server.ts parses it with Buffer.from(salt, 'hex').
  process.env['SESSION_SALT'] ??= 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8';
  process.env['METRICS_TOKEN'] ??= 'loadtest-metrics-token';
  deleteCredentialEnv();
}

async function createPrismaForLoadtest(): Promise<{
  prisma: PrismaClient;
  close: () => Promise<void>;
}> {
  if (process.env['LOADTEST_USE_REAL_PG'] === '1') {
    // Real PostgreSQL path (CI loadtest job): the default factory reads
    // DATABASE_URL and drives the true PrismaPg connection pool.
    const { createPrismaClient } = await import('../../src/utils/prisma-factory.js');
    const prisma = createPrismaClient();
    return {
      prisma,
      close: () => prisma.$disconnect(),
    };
  }
  const { PrismaPGlite } = await import('pglite-prisma-adapter');
  const { createTestPglite } = await import('../../tests/helpers/pglite-template.js');
  const { PrismaClient } = await import('../../src/utils/prisma-client.js');
  const pglite = await createTestPglite();
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  return {
    prisma,
    close: () => prisma.$disconnect(),
  };
}

/**
 * Seeded data handles handed to the runner. Idempotent per database: safe to
 * re-run against the same real PostgreSQL instance (upsert / find-or-create).
 */
interface SeedData {
  apiKey: string;
  templateId: string;
  planId: string;
}

async function seedLoadtestData(prisma: PrismaClient): Promise<SeedData> {
  const apiKeyValue = 'loadtest-api-key';
  const { hashApiKey } = await import('../../src/utils/security.js');
  const keyHash = hashApiKey(apiKeyValue);
  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {},
    create: { keyHash, role: 'admin', revoked: false },
  });

  // Template content reuses the production default (single source of truth).
  const { DEFAULT_TEMPLATE_CONTENT } = await import('../../src/core/types/index.js');
  const template = await prisma.template.findFirst({
    where: { name: 'loadtest-template' },
  });
  const templateId =
    template?.id ??
    (
      await prisma.template.create({
        data: {
          name: 'loadtest-template',
          description: 'Seeded by the loadtest harness (REQ-180)',
          content: JSON.stringify(DEFAULT_TEMPLATE_CONTENT),
          status: 'PUBLISHED',
        },
      })
    ).id;

  const plan = await prisma.interviewPlan.findFirst({ where: { name: 'loadtest-plan' } });
  const planId =
    plan?.id ??
    (
      await prisma.interviewPlan.create({
        data: {
          name: 'loadtest-plan',
          description: 'Seeded plan for S4 plan-read load',
          templateId,
          status: 'RUNNING',
        },
      })
    ).id;

  // 20 completed interviews with 6 messages each — realistic payload for the
  // S4 plan-detail read. Only seeded once per database (interviews are stable
  // COMPLETED rows; re-seeding would just duplicate identical load).
  const existingInterviews = await prisma.interview.count({ where: { planId } });
  if (existingInterviews === 0) {
    for (let i = 0; i < 20; i++) {
      const interview = await prisma.interview.create({
        data: {
          userId: `loadtest-user-${String(i).padStart(3, '0')}`,
          templateId,
          planId,
          status: 'COMPLETED',
          currentQuestion: 4,
          maxFollowups: 5,
          version: 1,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      for (let m = 0; m < 3; m++) {
        await prisma.message.create({
          data: { interviewId: interview.id, role: 'user', content: `回答 ${m}: 工作经历描述。` },
        });
        await prisma.message.create({
          data: {
            interviewId: interview.id,
            role: 'assistant',
            content: `追问 ${m}: 能展开说说吗？`,
          },
        });
      }
    }
  }

  return { apiKey: apiKeyValue, templateId, planId };
}

export interface BootedLoadtestApp {
  baseUrl: string;
  prisma: PrismaClient;
  close: () => Promise<void>;
  seed: SeedData;
}

export async function bootLoadtestApp(): Promise<BootedLoadtestApp> {
  prepareEnv();

  const { buildApp } = await import('../../src/server.js');
  // dotenv (override:false, loaded during the import above) may have
  // backfilled credentials from .env — the final guarantee is this delete.
  deleteCredentialEnv();

  const { prisma, close } = await createPrismaForLoadtest();

  const { fastify } = await buildApp({ prismaFactory: () => prisma });

  const seed = await seedLoadtestData(prisma);
  await fastify.listen({ port: 0, host: '127.0.0.1' });
  const address = fastify.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('loadtest app did not listen on a TCP port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    prisma,
    close: async () => {
      await fastify.close();
      await close();
    },
    seed,
  };
}
