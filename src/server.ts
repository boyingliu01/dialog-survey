import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { config } from "./config.js";
import { ErrorHandler } from "./errorHandler.js";
import webhookRoutes from "./api/webhook.js";
import interviewsRoutes from "./api/interviews.js";
import templatesRoutes from "./api/templates.js";
import streamRoutes from "./api/stream.js";

export interface ServerOptions {
  logger?: FastifyServerOptions["logger"];
  skipPlugins?: string[];
  skipRoutes?: string[];
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const logger = options.logger ?? {
    level: config.LOG_LEVEL,
    transport: config.isDevelopment
      ? {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  };

  const fastify = Fastify({
    logger,
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  const errorHandler = new ErrorHandler(config.isDevelopment);

  fastify.setErrorHandler(errorHandler.fastifyErrorHandler.bind(errorHandler));

  if (!options.skipPlugins?.includes("cors")) {
    void fastify.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
    });
  }

  if (!options.skipPlugins?.includes("websocket")) {
    void fastify.register(websocket, {
      options: {
        maxPayload: 1048576,
        clientTracking: true,
      },
    });
  }

  void fastify.register(
    (api) => {
      if (!options.skipRoutes?.includes("webhook")) {
        void api.register(webhookRoutes);
      }

      if (!options.skipRoutes?.includes("interviews")) {
        void api.register(interviewsRoutes);
      }

      if (!options.skipRoutes?.includes("templates")) {
        void api.register(templatesRoutes);
      }

      if (!options.skipRoutes?.includes("stream")) {
        void api.register(streamRoutes);
      }

      api.get("/health", () => {
        return {
          code: 0,
          msg: "success",
          data: {
            status: "healthy",
            timestamp: new Date().toISOString(),
          },
        };
      });
    },
    { prefix: "/api" },
  );

  fastify.get("/", () => {
    return {
      code: 0,
      msg: "success",
      data: {
        name: "Interview Bot API",
        version: "1.0.0",
        docs: "/api/docs",
      },
    };
  });

  const shutdown = (signal: string): void => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    void fastify
      .close()
      .then(() => {
        fastify.log.info("Server closed successfully");
        process.exit(0);
      })
      .catch((error) => {
        fastify.log.error("Error closing server: %s", error);
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

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
    fastify.log.error("Error starting server: %s", error);
    process.exit(1);
  }
}
