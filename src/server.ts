import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyView from '@fastify/view';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { adminTemplatesRoutes } from './api/admin-templates.js';
import { analysisRoutes } from './api/analysis.js';
import { healthRoutes } from './api/health.js';
import { interviewPlanRoutes } from './api/plans.js';
import { templateRoutes } from './api/templates.js';
import { webhookRoutes } from './api/webhook.js';
import { DingTalkStreamClient } from './integrations/dingtalk/stream-client.js';
import { type StreamMessage, processStreamMessage } from './services/stream-message.service.js';
import { error, info } from './utils/logger.js';
import { securityMiddleware } from './utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_CHECK_TIMEOUT_MS = 5000;

async function checkDatabaseConnection(): Promise<boolean> {
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
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, _body, done) => {
    done(null, '');
  });

  await fastify.register(cors, {
    origin: true,
  });

  const viewsDir = resolve(__dirname, '..', 'src', 'views');

  await fastify.register(fastifyView, {
    engine: { nunjucks },
    templates: viewsDir,
    options: {
      autoescape: true,
      noCache: true,
    },
  });

  await securityMiddleware(fastify);
  await fastify.register(healthRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(interviewPlanRoutes);
  await fastify.register(templateRoutes);
  await fastify.register(analysisRoutes);
  await fastify.register(adminTemplatesRoutes);

  return fastify;
}

export async function startServer() {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    process.exit(1);
  }

  const app = await buildApp();

  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });

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
        processStreamMessage(message as StreamMessage).catch((err) => {
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

      await client.connect();

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
