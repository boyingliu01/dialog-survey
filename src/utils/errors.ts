/**
 * Base error class for all interview bot errors
 */
export class InterviewBotError extends Error {
  public readonly name: string;
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    options: {
      name?: string;
      statusCode?: number;
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    const { name = "InterviewBotError", statusCode = 500, code = "INTERNAL_ERROR", cause } = options;
    super(message, { cause });

    this.name = name;
    this.statusCode = statusCode;
    this.code = code;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
    };
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends InterviewBotError {
  public readonly details: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      details?: Record<string, string[]>;
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    const { details = {}, code = "VALIDATION_ERROR", cause } = options;
    super(message, {
      name: "ValidationError",
      statusCode: 400,
      code,
      cause,
    });
    this.details = details;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * Error thrown when LLM operation fails
 */
export class LLMError extends InterviewBotError {
  constructor(
    message: string,
    options: {
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    const { code = "LLM_ERROR", cause } = options;
    super(message, {
      name: "LLMError",
      statusCode: 502,
      code,
      cause,
    });
  }
}

/**
 * Error thrown when database operation fails
 */
export class DatabaseError extends InterviewBotError {
  constructor(
    message: string,
    options: {
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    const { code = "DATABASE_ERROR", cause } = options;
    super(message, {
      name: "DatabaseError",
      statusCode: 500,
      code,
      cause,
    });
  }
}

/**
 * Error thrown when DingTalk operation fails
 */
export class DingTalkError extends InterviewBotError {
  constructor(
    message: string,
    options: {
      code?: string;
      cause?: unknown;
    } = {}
  ) {
    const { code = "DINGTALK_ERROR", cause } = options;
    super(message, {
      name: "DingTalkError",
      statusCode: 502,
      code,
      cause,
    });
  }
}
