import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyFormbody from '@fastify/formbody';
import fastifyView from '@fastify/view';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';

// Load .env early but explicitly (not via side-effect import) so tests can
// control environment via vi.stubEnv() without interference.
dotenv.config();
import { adminTemplatesRoutes } from './api/admin-templates.js';
import { analysisRoutes } from './api/analysis.js';
import { healthRoutes } from './api/health.js';
import { interviewPlanRoutes } from './api/plans.js';
import { templateRoutes } from './api/templates.js';
import { webhookRoutes } from './api/webhook.js';
import { DingTalkStreamClient } from './integrations/dingtalk/stream-client.js';
import { InterviewRepository } from './repositories/interview.repository.js';
import { TemplateRepository } from './repositories/template.repository.js';
import { AnalysisService } from './services/analysis.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { InterviewPlanService } from './services/interview-plan.service.js';
import { type StreamMessage, processStreamMessage } from './services/stream-message.service.js';
import { error, info, warn } from './utils/logger.js';
import { renderMarkdown } from './utils/markdown.js';
import { createVerifyApiKey, securityMiddleware } from './utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_CHECK_TIMEOUT_MS = 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

export async function checkDatabaseConnection(): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout')), DB_CHECK_TIMEOUT_MS)
      ),
    ]);
    info('Database connection OK');
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    error('Database connection FAILED', { error: errMsg });
    error('PostgreSQL must be running before starting the server');
    error('Run: sudo systemctl start postgresql');
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

export async function buildApp() {
  const isProduction = NODE_ENV === 'production';

  const loggerConfig = isProduction
    ? {
        level: LOG_LEVEL,
        transport: undefined,
      }
    : {
        level: LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      };

  const fastify = Fastify({
    logger: loggerConfig,
  });

  // Security: limit content-type parsing to known safe types (XML bombs, CSV injection).
  // Fastify natively handles `application/json` and `application/x-www-form-urlencoded`.
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

  const viewsDir = resolve(__dirname, '..', 'src', 'views');

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

  const prisma = new PrismaClient();
  const templateRepo = new TemplateRepository(prisma);
  const interviewPlanService = new InterviewPlanService(prisma);
  const interviewRepo = new InterviewRepository(prisma);
  const analysisService = new AnalysisService(prisma);
  const analyticsService = new AnalyticsService(prisma);

  await securityMiddleware(fastify, prisma);

  const verifyApiKey = createVerifyApiKey(prisma);

  await fastify.register(healthRoutes, { prisma });
  await fastify.register(webhookRoutes);

  await fastify.register(async (api) => {
    api.addHook('preHandler', verifyApiKey);
    await api.register(interviewPlanRoutes);
    await api.register(templateRoutes, { templateRepo, prisma });
    await api.register(analysisRoutes, { prisma });
  });

  await fastify.register(adminTemplatesRoutes, {
    templateRepo,
    interviewPlanService,
    interviewRepo,
    analysisService,
    analyticsService,
  });

  return { fastify, prisma };
}

export async function startServer() {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    process.exit(1);
  }

  const { fastify: app, prisma } = await buildApp();

  try {
    await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });

    const clientId = process.env.DINGTALK_CLIENT_ID;
    const clientSecret = process.env.DINGTALK_CLIENT_SECRET;
    const agentId = process.env.DINGTALK_AGENT_ID;

    if (clientId && clientSecret && agentId) {
      const client = DingTalkStreamClient.fromEnv();

      client.on('connected', () => {
        info('DingTalk Stream connected');
      });

      client.on('message', (message: unknown) => {
        info('Received DingTalk message', {
          topic: (message as StreamMessage)?.headers?.topic,
          messageId: (message as StreamMessage)?.headers?.messageId,
        });
        processStreamMessage(message as StreamMessage, prisma).catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          error('Failed to process message', { error: errMsg });
        });
      });

      client.on('error', (err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        error('DingTalk Stream error', { error: errMsg });
      });

      client.on('disconnected', () => {
        info('DingTalk Stream disconnected');
      });

      // Non-blocking DingTalk connection — server stays up even if DingTalk fails
      client.connect().catch((err) => {
        warn('DingTalk Stream connection failed, server continues without it', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const gracefulShutdown = async (signal: string) => {
        info(`Received ${signal}, shutting down gracefully`);
        client.disconnect();
        await app.close();
        process.exit(0);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    } else {
      info('DingTalk Stream mode not configured, skipping WebSocket connection');
    }

    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
