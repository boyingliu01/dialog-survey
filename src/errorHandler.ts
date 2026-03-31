import { FastifyError, FastifyReply } from 'fastify';

export class ErrorHandler {
  private readonly isDevelopment: boolean;

  constructor(isDevelopment: boolean) {
    this.isDevelopment = isDevelopment;
  }

  /**
   * Create error response
   */
  createErrorResponse(statusCode: number, message: string, details?: any): any {
    const response: any = {
      code: statusCode,
      msg: message,
    };

    if (details && this.isDevelopment) {
      response.details = details;
    }

    return response;
  }

  /**
   * Handle validation errors
   */
  handleValidationError(error: any) {
    if (error.issues) {
      return {
        code: 400,
        msg: 'Validation failed',
        details: error.issues,
      };
    }

    return {
      code: 400,
      msg: 'Invalid request',
    };
  }

  /**
   * Handle database errors
   */
  handleDatabaseError(error: any) {
    if (error.code === 'P2002') {
      return {
        code: 409,
        msg: 'Resource already exists',
      };
    }

    if (error.code === 'P2025') {
      return {
        code: 404,
        msg: 'Resource not found',
      };
    }

    if (error.code) {
      return {
        code: 500,
        msg: 'Database error',
        details: this.isDevelopment ? error : undefined,
      };
    }

    return {
      code: 500,
      msg: 'Database error',
    };
  }

  /**
   * Handle general errors
   */
  handleError(error: any) {
    if (error.code && error.msg) {
      return error;
    }

    if (error.validation) {
      return this.handleValidationError(error);
    }

    if (error.code === 'E_UNKNOWN') {
      return {
        code: 500,
        msg: 'Unknown error',
      };
    }

    if (error.statusCode) {
      return {
        code: error.statusCode,
        msg: error.message,
      };
    }

    return {
      code: 500,
      msg: 'Internal server error',
    };
  }

  /**
   * Fastify error handler
   */
  fastifyErrorHandler(error: FastifyError, _request: any, reply: FastifyReply) {
    const handledError = this.handleError(error);

    reply.status(handledError.code).send(handledError);
  }
}
