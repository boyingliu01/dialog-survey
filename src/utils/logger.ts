import pino from 'pino';

const loggerConfig: Record<string, unknown> = {
  level: process.env['LOG_LEVEL'] || 'info',
};
if (process.env['NODE_ENV'] === 'development') {
  loggerConfig['transport'] = { target: 'pino-pretty', options: { colorize: true } };
}
const logger = pino(loggerConfig);

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
