import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import logger from "../../../src/utils/logger";

describe("logger", () => {
  it("should create a logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.warn).toBe("function");
  });

  it("should have info level method", () => {
    const infoSpy = vi.spyOn(logger, "info");
    logger.info("Test info message");
    expect(infoSpy).toHaveBeenCalledWith("Test info message");
    infoSpy.mockRestore();
  });

  it("should have error level method", () => {
    const errorSpy = vi.spyOn(logger, "error");
    logger.error("Test error message");
    expect(errorSpy).toHaveBeenCalledWith("Test error message");
    errorSpy.mockRestore();
  });

  it("should have debug level method", () => {
    const debugSpy = vi.spyOn(logger, "debug");
    logger.debug("Test debug message");
    expect(debugSpy).toHaveBeenCalledWith("Test debug message");
    debugSpy.mockRestore();
  });

  it("should have warn level method", () => {
    const warnSpy = vi.spyOn(logger, "warn");
    logger.warn("Test warn message");
    expect(warnSpy).toHaveBeenCalledWith("Test warn message");
    warnSpy.mockRestore();
  });

  it("should support structured logging with objects", () => {
    const infoSpy = vi.spyOn(logger, "info");
    logger.info({ key: "value" }, "Test structured log");
    expect(infoSpy).toHaveBeenCalledWith({ key: "value" }, "Test structured log");
    infoSpy.mockRestore();
  });
});
