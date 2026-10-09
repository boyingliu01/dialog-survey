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
 * Credential-free by design: no DINGTALK_* / DASHSCOPE_API_KEY in the
 * environment means the DingTalk stream client never starts and the S6
 * message handler takes the declared LLM fallback path (see design.md).
 */
interface BootedLoadtestApp {
  baseUrl: string;
  prisma: unknown;
  close: () => Promise<void>;
  seed: {
    apiKey: string;
    templateId: string;
    planId: string;
  };
}

function prepareEnv(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['SESSION_SECRET'] ??= 'loadtest-session-secret-0123456789abcdef';
  // 32 hex chars — server.ts parses it with Buffer.from(salt, 'hex').
  process.env['SESSION_SALT'] ??= 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8';
  process.env['METRICS_TOKEN'] ??= 'loadtest-metrics-token';
  // Deliberately NOT set: DINGTALK_CLIENT_ID/SECRET/AGENT_ID, DASHSCOPE_API_KEY.
}

async function createPrismaForLoadtest(): Promise<{ prisma: unknown; close: () => Promise<void> }> {
  if (process.env['LOADTEST_USE_REAL_PG'] === '1') {
    // Real PostgreSQL path (CI loadtest job): the default factory reads
    // DATABASE_URL and drives the true PrismaPg connection pool.
    const { createPrismaClient } = await import('../../src/utils/prisma-client.js');
    const prisma = createPrismaClient();
    return {
      prisma,
      close: () => (prisma as { $disconnect: () => Promise<void> }).$disconnect(),
    };
  }
  const { PrismaPGlite } = await import('pglite-prisma-adapter');
  const { createTestPglite } = await import('../../tests/helpers/pglite-template.js');
  const { PrismaClient } = await import('../../src/utils/prisma-client.js');
  const pglite = await createTestPglite();
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  return {
    prisma,
    close: () => (prisma as { $disconnect: () => Promise<void> }).$disconnect(),
  };
}

/** Template content mirrors src/core/types DEFAULT_TEMPLATE_CONTENT. */
function loadtestTemplateContent(): object {
  return {
    name: 'Loadtest Interview',
    invitationPrompt: '您好！欢迎参与本次访谈。',
    questions: [
      '请简单介绍一下您的工作经历？',
      '您在工作中遇到过最大的挑战是什么？',
      '您是如何解决这个挑战的？',
      '您对未来的职业规划是什么？',
    ],
  };
}

async function seedLoadtestData(prisma: unknown): Promise<BootedLoadtestApp['seed']> {
  const db = prisma as {
    apiKey: { create: (args: object) => Promise<{ id: string }> };
    template: { create: (args: object) => Promise<{ id: string }> };
    interviewPlan: { create: (args: object) => Promise<{ id: string }> };
    interview: { create: (args: object) => Promise<{ id: string }> };
    message: { create: (args: object) => Promise<unknown> };
  };

  const apiKeyValue = 'loadtest-api-key';
  await db.apiKey.create({
    data: {
      keyHash: await createKeyHash(apiKeyValue),
      role: 'admin',
      revoked: false,
    },
  });

  const template = await db.template.create({
    data: {
      name: 'loadtest-template',
      description: 'Seeded by the loadtest harness (REQ-180)',
      content: JSON.stringify(loadtestTemplateContent()),
      status: 'PUBLISHED',
    },
  });

  const plan = await db.interviewPlan.create({
    data: {
      name: 'loadtest-plan',
      description: 'Seeded plan for S4 plan-read load',
      templateId: template.id,
      status: 'RUNNING',
    },
  });

  // 20 completed interviews with 6 messages each — realistic payload for
  // the S4 plan-detail read and the S6 interview state chain.
  for (let i = 0; i < 20; i++) {
    const interview = await db.interview.create({
      data: {
        userId: `loadtest-user-${String(i).padStart(3, '0')}`,
        templateId: template.id,
        planId: plan.id,
        status: 'COMPLETED',
        currentQuestion: 4,
        maxFollowups: 5,
        version: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    for (let m = 0; m < 3; m++) {
      await db.message.create({
        data: { interviewId: interview.id, role: 'user', content: `回答 ${m}: 工作经历描述。` },
      });
      await db.message.create({
        data: {
          interviewId: interview.id,
          role: 'assistant',
          content: `追问 ${m}: 能展开说说吗？`,
        },
      });
    }
  }

  return { apiKey: apiKeyValue, templateId: template.id, planId: plan.id };
}

async function createKeyHash(apiKey: string): Promise<string> {
  const { hashApiKey } = await import('../../src/utils/security.js');
  return hashApiKey(apiKey);
}

export async function bootLoadtestApp(): Promise<BootedLoadtestApp> {
  prepareEnv();

  const { buildApp } = await import('../../src/server.js');
  const { prisma, close } = await createPrismaForLoadtest();

  const { fastify } = await buildApp({
    prismaFactory: () => prisma as never,
  });

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
