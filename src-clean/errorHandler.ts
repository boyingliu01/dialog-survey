import type { FastifyError, FastifyReply } from 'fastify';

export class ErrorHandler {
  private readonly isDevelopment: boolean;

  constructor(isDevelopment: boolean) {
    this.isDevelopment = isDevelopment;
  }

  /**
   * Create error response
   */
  createErrorResponse(statusCode: number, message: string, details?: unknown): { code: number; msg: string; details?: unknown } {
    const response: { code: number; msg: string; details?: unknown } = {
      code: statusCode,
      msg: message,
    };

    if (details && this.isDevelopment) {
      response.details = details;
    }

    return response;
  }

  /**
   * Fastify error handler
   */
  fastifyErrorHandler(error: FastifyError, _request: unknown, reply: FastifyReply): void {
    const statusCode = error.statusCode ?? 500;
    const message = error.message ?? 'Internal server error';

    reply.status(statusCode).send(this.createErrorResponse(statusCode, message));
  }
}
