// @ts-nocheck
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-001-5-01
 * @test REQ-001-5-02
 * @test REQ-001-5-03
 * @test REQ-001-5-04
 * @test REQ-001-5-05
 * @test REQ-001-5-06
 * @test REQ-001-5-07
 * @intent 验证环境变量配置文件存在且包含所有必需的配置项 (DATABASE_URL, DINGTALK_WEBHOOK_URL, DINGTALK_SECRET, DASHSCOPE_API_KEY, FUN_ASR_API_KEY, LOG_LEVEL, ENCRYPTION_KEY)
 * @covers .env.example 包含 DATABASE_URL, DINGTALK_WEBHOOK_URL, DINGTALK_SECRET, DASHSCOPE_API_KEY, FUN_ASR_API_KEY, LOG_LEVEL, ENCRYPTION_KEY
 */
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
