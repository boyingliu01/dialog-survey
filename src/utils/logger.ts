import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export function info(message: string, meta?: Record<string, unknown>) {
  logger.info(meta, message);
}

export function warn(message: string, meta?: Record<string, unknown>) {
  logger.warn(meta, message);
}

export function error(message: string, meta?: Record<string, unknown>) {
  logger.error(meta, message);
}

export function debug(message: string, meta?: Record<string, unknown>) {
  logger.debug(meta, message);
}

export { logger };
