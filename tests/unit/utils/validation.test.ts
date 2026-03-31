import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { validate, validateEnv } from "../../../src/utils/validation";
import { ValidationError } from "../../../src/utils/errors";

const TestSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0),
});

describe("validation utils", () => {
  describe("validate", () => {
    it("should validate and return data that matches schema", () => {
      const data = { name: "Test", age: 30 };
      const result = validate(data, TestSchema);
      expect(result).toEqual(data);
    });

    it("should throw ValidationError for invalid data", () => {
      const data = { name: "", age: "invalid" };
      expect(() => validate(data, TestSchema)).toThrow(ValidationError);
    });

    it("should throw ValidationError with details", () => {
      const data = { name: "", age: -5 };
      try {
        validate(data, TestSchema);
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.details).toHaveProperty("name");
        expect(validationError.details).toHaveProperty("age");
      }
    });
  });

  describe("validateEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        NODE_ENV: "development",
        PORT: "3000",
        HOST: "0.0.0.0",
        DATABASE_URL: "postgresql://localhost:5432/db",
        DASHSCOPE_API_KEY: "test-key",
        INTERNAL_API_KEY: "test-internal-key",
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should validate environment variables successfully", () => {
      const result = validateEnv();
      expect(result).toHaveProperty("NODE_ENV", "development");
      expect(result).toHaveProperty("PORT", 3000);
      expect(result).toHaveProperty("DATABASE_URL", "postgresql://localhost:5432/db");
    });

    it("should use default values for missing variables", () => {
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.HOST;
      const result = validateEnv();
      expect(result).toHaveProperty("NODE_ENV", "development");
      expect(result).toHaveProperty("PORT", 3000);
      expect(result).toHaveProperty("HOST", "0.0.0.0");
    });

    it("should throw ValidationError when required variables are missing", () => {
      delete process.env.DATABASE_URL;
      expect(() => validateEnv()).toThrow(ValidationError);
    });

    it("should throw ValidationError with ENV_VALIDATION_ERROR code", () => {
      delete process.env.DASHSCOPE_API_KEY;
      try {
        validateEnv();
        expect.fail("Should have thrown ValidationError");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.code).toBe("ENV_VALIDATION_ERROR");
      }
    });
  });
});
