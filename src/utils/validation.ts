import { z, type ZodIssue } from "zod";
import {
  EnvironmentVariablesSchema,
  type EnvironmentVariables,
} from "../types";
import { ValidationError } from "./errors";

/**
 * Validates environment variables using Zod schema
 * @returns Validated environment variables object
 * @throws ValidationError if validation fails
 */
export function validateEnv(): EnvironmentVariables {
  const result = EnvironmentVariablesSchema.safeParse(process.env);

  if (!result.success) {
    const details: Record<string, string[]> = {};
    result.error.issues.forEach((issue: ZodIssue) => {
      const path = issue.path.join(".");
      if (!details[path]) {
        details[path] = [];
      }
      details[path].push(issue.message);
    });

    throw new ValidationError("Environment variables validation failed", {
      details,
      code: "ENV_VALIDATION_ERROR",
    });
  }

  return result.data;
}

/**
 * Validates data against a given Zod schema
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Validated data
 * @throws ValidationError if validation fails
 */
export function validate<T>(data: unknown, schema: z.Schema<T>): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details: Record<string, string[]> = {};
    result.error.issues.forEach((issue: ZodIssue) => {
      const path = issue.path.join(".");
      if (!details[path]) {
        details[path] = [];
      }
      details[path].push(issue.message);
    });

    throw new ValidationError("Data validation failed", { details });
  }

  return result.data;
}
