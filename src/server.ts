import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { analysisRoutes } from './api/analysis.js';
import { healthRoutes } from './api/health.js';
import { interviewPlanRoutes } from './api/plans.js';
import { templateRoutes } from './api/templates.js';
import { webhookRoutes } from './api/webhook.js';
import { DingTalkStreamClient } from './integrations/dingtalk/stream-client.js';
import { type StreamMessage, processStreamMessage } from './services/stream-message.service.js';
import { error, info } from './utils/logger.js';
import { securityMiddleware } from './utils/security.js';

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

async function initializeDefaultTemplate(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.template.findUnique({
      where: { id: 'default-template' },
    });

    if (!existing) {
      await prisma.template.create({
        data: {
          id: 'default-template',
          name: 'Default Interview Template',
          description: 'Default template for DingTalk Stream interviews',
          content: JSON.stringify({
            questions: [
              '请简单介绍一下您的工作经历？',
              '您在之前的项目中遇到过什么挑战？',
              '您如何处理团队合作中的分歧？',
            ],
          }),
          status: 'PUBLISHED',
        },
      });
      info('Created default-template');
    } else {
      info('default-template already exists');
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    error('Failed to initialize default-template', { error: errMsg });
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

  await fastify.register(cors, {
    origin: true,
  });

  await securityMiddleware(fastify);
  await fastify.register(healthRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(interviewPlanRoutes);
  await fastify.register(templateRoutes);
  await fastify.register(analysisRoutes);

  return fastify;
}

export async function startServer() {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    process.exit(1);
  }

  await initializeDefaultTemplate();

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
