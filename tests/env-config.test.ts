import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Environment Configuration', () => {
  it('should have .env.example file', () => {
    expect(fs.existsSync('.env.example')).toBe(true);
  });

  it('should contain DATABASE_URL', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('DATABASE_URL');
  });

  it('should contain DINGTALK_WEBHOOK_URL', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('DINGTALK_WEBHOOK_URL');
  });

  it('should contain DINGTALK_SECRET', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('DINGTALK_SECRET');
  });

  it('should contain DASHSCOPE_API_KEY', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('DASHSCOPE_API_KEY');
  });

  it('should contain FUN_ASR_API_KEY', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('FUN_ASR_API_KEY');
  });

  it('should contain LOG_LEVEL', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('LOG_LEVEL');
  });

  it('should contain ENCRYPTION_KEY', () => {
    const env = fs.readFileSync('.env.example', 'utf-8');
    expect(env).toContain('ENCRYPTION_KEY');
  });
});
