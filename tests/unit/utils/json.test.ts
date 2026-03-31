import { describe, it, expect } from "vitest";
import { cleanJsonMarkdown, safeJsonParse, safeJsonStringify } from "../../../src/utils/json";

describe("json utils", () => {
  describe("cleanJsonMarkdown", () => {
    it("should remove ```json and ``` wrappers", () => {
      const input = "```json\n{\"name\": \"Test\"}\n```";
      const result = cleanJsonMarkdown(input);
      expect(result).toBe("{\"name\": \"Test\"}");
    });

    it("should trim whitespace", () => {
      const input = "   {\"name\": \"Test\"}   ";
      const result = cleanJsonMarkdown(input);
      expect(result).toBe("{\"name\": \"Test\"}");
    });

    it("should handle input without markdown wrappers", () => {
      const input = "{\"name\": \"Test\"}";
      const result = cleanJsonMarkdown(input);
      expect(result).toBe("{\"name\": \"Test\"}");
    });

    it("should handle empty string", () => {
      const input = "";
      const result = cleanJsonMarkdown(input);
      expect(result).toBe("");
    });
  });

  describe("safeJsonParse", () => {
    it("should parse valid JSON", () => {
      const input = "{\"name\": \"Test\", \"age\": 30}";
      const result = safeJsonParse<{ name: string; age: number }>(input);
      expect(result).toEqual({ name: "Test", age: 30 });
    });

    it("should parse JSON with markdown wrappers", () => {
      const input = "```json\n{\"name\": \"Test\", \"age\": 30}\n```";
      const result = safeJsonParse<{ name: string; age: number }>(input);
      expect(result).toEqual({ name: "Test", age: 30 });
    });

    it("should return null for invalid JSON", () => {
      const input = "{invalid json}";
      const result = safeJsonParse(input);
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      const input = "";
      const result = safeJsonParse(input);
      expect(result).toBeNull();
    });

    it("should parse JSON with reviver", () => {
      const input = "{\"date\": \"2024-01-01T00:00:00.000Z\"}";
      const result = safeJsonParse<{ date: Date }>(input, (key, value) => {
        if (key === "date") return new Date(value);
        return value;
      });
      expect(result?.date instanceof Date).toBe(true);
    });
  });

  describe("safeJsonStringify", () => {
    it("should stringify objects with pretty print", () => {
      const input = { name: "Test", age: 30 };
      const result = safeJsonStringify(input);
      expect(result).toBe('{\n  "name": "Test",\n  "age": 30\n}');
    });

    it("should use custom indentation", () => {
      const input = { name: "Test", age: 30 };
      const result = safeJsonStringify(input, 4);
      expect(result).toBe('{\n    "name": "Test",\n    "age": 30\n}');
    });

    it("should stringify arrays", () => {
      const input = [1, 2, 3];
      const result = safeJsonStringify(input);
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it("should return {} for circular references", () => {
      const obj: any = { name: "Test" };
      obj.self = obj;
      const result = safeJsonStringify(obj);
      expect(result).toBe("{}");
    });
  });
});
