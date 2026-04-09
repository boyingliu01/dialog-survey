import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Health Check Implementation', () => {
  it('should have src/utils/logger.ts', () => {
    expect(fs.existsSync('src/utils/logger.ts')).toBe(true);
  });

  it('should have health check endpoint in src/api/health.ts', () => {
    expect(fs.existsSync('src/api/health.ts')).toBe(true);
  });

  it('logger should export info, warn, error functions', () => {
    const logger = fs.readFileSync('src/utils/logger.ts', 'utf-8');
    expect(logger).toContain('export function info');
    expect(logger).toContain('export function warn');
    expect(logger).toContain('export function error');
  });

  it('health endpoint should include DB check', () => {
    const health = fs.readFileSync('src/api/health.ts', 'utf-8');
    expect(health).toContain('db');
    expect(health).toContain('check');
  });

  it('health endpoint should include LLM check', () => {
    const health = fs.readFileSync('src/api/health.ts', 'utf-8');
    expect(health).toContain('llm');
  });

  it('health endpoint should include DingTalk check', () => {
    const health = fs.readFileSync('src/api/health.ts', 'utf-8');
    expect(health).toContain('dingtalk');
  });

  it('health endpoint should support degraded mode', () => {
    const health = fs.readFileSync('src/api/health.ts', 'utf-8');
    expect(health).toContain('degraded') || health.toLowerCase().includes('status');
  });
});
