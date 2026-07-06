import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import fastifyView from '@fastify/view';
import { type PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import nunjucks from 'nunjucks';

import { adminTemplatesRoutes } from '../../src/api/admin-templates.js';
import { analysisRoutes } from '../../src/api/analysis.js';
import { healthRoutes } from '../../src/api/health.js';
import { interviewPlanRoutes } from '../../src/api/plans.js';
import { templateRoutes } from '../../src/api/templates.js';
import { DingTalkStreamClient } from '../../src/integrations/dingtalk/stream-client.js';
import { tokenManager } from '../../src/integrations/dingtalk/token-manager.js';
import { InterviewRepository } from '../../src/repositories/interview.repository.js';
import { TemplateRepository } from '../../src/repositories/template.repository.js';
import { AnalysisService } from '../../src/services/analysis.service.js';
import { AnalyticsService } from '../../src/services/analytics.service.js';
import { ExportService } from '../../src/services/export.service.js';
import { InterviewPlanService } from '../../src/services/interview-plan.service.js';
import { renderMarkdown } from '../../src/utils/markdown.js';
import { createVerifyApiKey, securityMiddleware } from '../../src/utils/security.js';
import { TestDatabase } from './test-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TestServer {
  app: FastifyInstance;
  prisma: PrismaClient;
  testDb: TestDatabase;
  teardown: () => Promise<void>;
}

/**
 * Create a test server with real database connection
 * - Uses test database (not production)
 * - Skips external services (DingTalk Stream, cron jobs)
 * - Provides same routes as production server
 */
export async function createTestServer(): Promise<TestServer> {
  process.env['NODE_ENV'] = 'test';

  const testDb = new TestDatabase();
  await testDb.setup();

  const prisma = testDb.getPrisma();

  const fastify = Fastify({
    logger: false, // Disable logging in tests for cleaner output
  });

  // Security: limit content-type parsing
  fastify.addContentTypeParser(
    ['application/xml', 'text/xml', 'text/csv'],
    { parseAs: 'string' },
    (_req, _body, done) => {
      done(null, '');
    }
  );

  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(fastifyFormbody);

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 1 * 1024 * 1024, parts: 1 },
  });

  const viewsDir = resolve(__dirname, '..', '..', 'src', 'views');

  const customNunjucks = {
    ...nunjucks,
    configure(templatesDir: string | string[], opts: Record<string, unknown>) {
      const env = nunjucks.configure(templatesDir, opts);
      env.addFilter('date', (input: Date | string | null, format?: string) => {
        if (!input) return '';
        const date = new Date(input);
        if (Number.isNaN(date.getTime())) return '';
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const HH = String(date.getHours()).padStart(2, '0');
        const MM = String(date.getMinutes()).padStart(2, '0');

        if (format === 'Y-m-d H:i') return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
        return `${yyyy}-${mm}-${dd}`;
      });
      env.addFilter('markdown', (input: string | null | undefined) => renderMarkdown(input));
      return env;
    },
  };

  await fastify.register(fastifyView, {
    engine: { nunjucks: customNunjucks as unknown as typeof nunjucks },
    templates: viewsDir,
    options: {
      autoescape: true,
      noCache: true,
    },
  });

  // Create repositories and services with test prisma
  const templateRepo = new TemplateRepository(prisma);
  const streamClient = DingTalkStreamClient.fromEnv();
  const interviewPlanService = new InterviewPlanService(
    prisma,
    undefined,
    streamClient,
    tokenManager
  );
  const interviewRepo = new InterviewRepository(prisma);
  const analysisService = new AnalysisService(prisma);
  const analyticsService = new AnalyticsService(prisma);
  const exportService = new ExportService(prisma);

  await securityMiddleware(fastify, prisma);

  // Skip rate limiting in tests (fastify.inject() bypasses it anyway)

  // Content-Security-Policy header
  fastify.addHook('onSend', (_request, reply, payload, done) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "connect-src 'self'"
    );
    done(null, payload);
  });

  // Skip cron jobs in tests

  const verifyApiKey = createVerifyApiKey(prisma);

  await fastify.register(healthRoutes, { prisma });

  await fastify.register(async (api) => {
    api.addHook('preHandler', verifyApiKey);
    await api.register(interviewPlanRoutes, { interviewPlanService, prisma });
    await api.register(templateRoutes, { templateRepo, prisma });
    await api.register(analysisRoutes, { prisma });
  });

  await fastify.register(adminTemplatesRoutes, {
    templateRepo,
    interviewPlanService,
    interviewRepo,
    analysisService,
    analyticsService,
    exportService,
    prisma,
  });

  // Skip DingTalk Stream connection in tests

  return {
    app: fastify,
    prisma,
    testDb,
    teardown: async () => {
      await fastify.close();
      await testDb.teardown();
    },
  };
}
