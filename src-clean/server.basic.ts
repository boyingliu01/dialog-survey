import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';

export function buildServer(): FastifyInstance {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  // Register plugins
  fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return {
      code: 0,
      msg: 'success',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    };
  });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      code: 0,
      msg: 'success',
      data: {
        name: 'Interview Bot API',
        version: '1.0.0',
      },
    };
  });

  // Templates endpoints
  fastify.get('/templates', async () => {
    return {
      code: 0,
      msg: 'success',
      data: [],
    };
  });

  fastify.get('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.status(404).send({
      code: 404,
      msg: 'Template not found',
    });
  });

  // Interviews endpoints
  fastify.get('/interviews', async () => {
    return {
      code: 0,
      msg: 'success',
      data: [],
    };
  });

  fastify.get('/interviews/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    return reply.status(404).send({
      code: 404,
      msg: 'Interview not found',
    });
  });

  fastify.post('/interviews/:sessionId/end', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    return reply.status(404).send({
      code: 404,
      msg: 'Interview not found',
    });
  });

  fastify.get('/interviews/:sessionId/report', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    return reply.status(404).send({
      code: 404,
      msg: 'Report not available',
    });
  });

  fastify.get('/interviews/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    return reply.status(404).send({
      code: 404,
      msg: 'Interview not found',
    });
  });

  // Webhook endpoints
  fastify.get('/webhook', async (request) => {
    const { challenge } = request.query as { challenge?: string };
    if (challenge) {
      return { challenge };
    }
    return { code: 0, msg: 'success' };
  });

  fastify.post('/webhook', async () => {
    return {
      code: 0,
      msg: 'success',
      message: 'Message received',
    };
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await fastify.close();
      fastify.log.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      fastify.log.error('Error closing server: %s', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return fastify;
}

export async function startServer(): Promise<void> {
  const fastify = buildServer();

  try {
    await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });

    fastify.log.info(`Server running at http://${config.HOST}:${config.PORT}`);
  } catch (error) {
    fastify.log.error('Error starting server: %s', error);
    process.exit(1);
  }
}
