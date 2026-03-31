import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { ErrorHandler } from './errorHandler.js';
import webhookRoutes from './api/webhook.js';
import interviewsRoutes from './api/interviews.js';
import templatesRoutes from './api/templates.js';
import streamRoutes from './api/stream.js';

export interface ServerOptions {
  logger?: FastifyServerOptions['logger'];
  skipPlugins?: string[];
  skipRoutes?: string[];
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const logger = options.logger ?? {
    level: config.LOG_LEVEL,
  };

  const fastify = Fastify({
    logger,
    trustProxy: true,
  });

  const errorHandler = new ErrorHandler(config.isDevelopment);

  // Set up error handler
  fastify.setErrorHandler(errorHandler.fastifyErrorHandler.bind(errorHandler));

  // Register plugins
  if (!options.skipPlugins?.includes('cors')) {
    fastify.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
    });
  }

  if (!options.skipPlugins?.includes('websocket')) {
    fastify.register(websocket, {
      options: {
        maxPayload: 1048576,
        clientTracking: true,
      },
    });
  }

  // Register routes with prefix /api
  fastify.register(async (api) => {
    if (!options.skipRoutes?.includes('webhook')) {
      api.register(webhookRoutes);
    }

    if (!options.skipRoutes?.includes('interviews')) {
      api.register(interviewsRoutes);
    }

    if (!options.skipRoutes?.includes('templates')) {
      api.register(templatesRoutes);
    }

    if (!options.skipRoutes?.includes('stream')) {
      api.register(streamRoutes);
    }

    // Health check endpoint
    api.get('/health', async () => {
      return {
        code: 0,
        msg: 'success',
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        },
      };
    });
  }, { prefix: '/api' });

  // Root endpoint
  fastify.get('/', async () => {
    return {
      code: 0,
      msg: 'success',
      data: {
        name: 'Interview Bot API',
        version: '1.0.0',
        docs: '/api/docs',
      },
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
