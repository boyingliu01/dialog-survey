import cors from '@fastify/cors';
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
