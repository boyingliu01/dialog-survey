import { describe, it, expect } from "vitest";
import {
  InterviewBotError,
  ValidationError,
  LLMError,
  DatabaseError,
  DingTalkError,
} from "../../../src/utils/errors";

describe("errors", () => {
  describe("InterviewBotError", () => {
    it("should create an instance with default values", () => {
      const error = new InterviewBotError("Test error");
      expect(error).toBeInstanceOf(InterviewBotError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("InterviewBotError");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
    });

    it("should create an instance with custom values", () => {
      const error = new InterviewBotError("Custom error", {
        name: "CustomError",
        statusCode: 400,
        code: "CUSTOM_ERROR",
      });
      expect(error.name).toBe("CustomError");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("CUSTOM_ERROR");
    });

    it("should include cause when provided", () => {
      const cause = new Error("Original cause");
      const error = new InterviewBotError("Test error", { cause });
      expect(error.cause).toBe(cause);
    });

    it("should serialize to JSON correctly", () => {
      const error = new InterviewBotError("Test error", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
      const json = error.toJSON();
      expect(json).toEqual({
        name: "InterviewBotError",
        message: "Test error",
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("ValidationError", () => {
    it("should create an instance", () => {
      const error = new ValidationError("Validation failed");
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(InterviewBotError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Validation failed");
      expect(error.name).toBe("ValidationError");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
    });

    it("should include details", () => {
      const details = {
        name: ["Name is required"],
        age: ["Age must be a number"],
      };
      const error = new ValidationError("Validation failed", { details });
      expect(error.details).toEqual(details);
    });

    it("should serialize details to JSON", () => {
      const details = {
        name: ["Name is required"],
      };
      const error = new ValidationError("Validation failed", { details });
      const json = error.toJSON();
      expect(json).toEqual({
        name: "ValidationError",
        message: "Validation failed",
        statusCode: 400,
        code: "VALIDATION_ERROR",
        details,
      });
    });
  });

  describe("LLMError", () => {
    it("should create an instance", () => {
      const error = new LLMError("LLM request failed");
      expect(error).toBeInstanceOf(LLMError);
      expect(error).toBeInstanceOf(InterviewBotError);
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe("LLM_ERROR");
    });
  });

  describe("DatabaseError", () => {
    it("should create an instance", () => {
      const error = new DatabaseError("Database connection failed");
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error).toBeInstanceOf(InterviewBotError);
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("DATABASE_ERROR");
    });
  });

  describe("DingTalkError", () => {
    it("should create an instance", () => {
      const error = new DingTalkError("DingTalk API failed");
      expect(error).toBeInstanceOf(DingTalkError);
      expect(error).toBeInstanceOf(InterviewBotError);
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe("DINGTALK_ERROR");
    });
  });
});
