import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

interface ErrorResponse {
  code: number;
  msg: string;
  details?: unknown;
}

interface ValidationError {
  issues?: Array<{ message: string; path: (string | number)[] }>;
}

interface DatabaseError {
  code?: string;
  message?: string;
}

interface AppError {
  code?: string | number;
  msg?: string;
  message?: string;
  validation?: unknown;
  statusCode?: number;
}

export class ErrorHandler {
  private readonly isDevelopment: boolean;

  constructor(isDevelopment: boolean) {
    this.isDevelopment = isDevelopment;
  }

  createErrorResponse(
    statusCode: number,
    message: string,
    details?: unknown,
  ): ErrorResponse {
    const response: ErrorResponse = {
      code: statusCode,
      msg: message,
    };

    if (details && this.isDevelopment) {
      response.details = details;
    }

    return response;
  }

  handleValidationError(error: ValidationError): ErrorResponse {
    if (error.issues) {
      return {
        code: 400,
        msg: "Validation failed",
        details: error.issues,
      };
    }

    return {
      code: 400,
      msg: "Invalid request",
    };
  }

  handleDatabaseError(error: DatabaseError): ErrorResponse {
    if (error.code === "P2002") {
      return {
        code: 409,
        msg: "Resource already exists",
      };
    }

    if (error.code === "P2025") {
      return {
        code: 404,
        msg: "Resource not found",
      };
    }

    if (error.code) {
      return {
        code: 500,
        msg: "Database error",
        details: this.isDevelopment ? error : undefined,
      };
    }

    return {
      code: 500,
      msg: "Database error",
    };
  }

  handleError(error: AppError): ErrorResponse {
    if (error.code && error.msg) {
      return error as ErrorResponse;
    }

    if (error.validation) {
      return this.handleValidationError(error as ValidationError);
    }

    if (error.code === "E_UNKNOWN") {
      return {
        code: 500,
        msg: "Unknown error",
      };
    }

    if (error.statusCode) {
      return {
        code: error.statusCode,
        msg: error.message ?? "Unknown error",
      };
    }

    return {
      code: 500,
      msg: "Internal server error",
    };
  }

  fastifyErrorHandler(
    error: FastifyError,
    _request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const handledError = this.handleError(error);
    void reply.status(handledError.code).send(handledError);
  }
}
