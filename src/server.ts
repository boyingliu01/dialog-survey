import cors from '@fastify/cors';
import Fastify from 'fastify';
import { analysisRoutes } from './api/analysis.js';
import { healthRoutes } from './api/health.js';
import { interviewPlanRoutes } from './api/plans.js';
import { templateRoutes } from './api/templates.js';
import { webhookRoutes } from './api/webhook.js';
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
    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
