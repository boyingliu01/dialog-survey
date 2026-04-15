import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateSignature,
  verifySignature,
  verifyTimestamp,
} from '../src/integrations/dingtalk/middleware.js';

describe('DingTalk Signature Verification', () => {
  const secret = 'SECxxxxxxxxxxxxxxxxxxxxxxx';

  /**
   * @test REQ-002-1-03
   * @intent 验证钉钉签名验证中间件模块存在性
   */
  it('should have dingtalk signature verification module', () => {
    expect(fs.existsSync('src/integrations/dingtalk/middleware.ts')).toBe(true);
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证HMAC-SHA256签名验证功能可用
   */
  it('should export verifySignature function', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('export function verifySignature');
  });

  /**
   * @test REQ-002-1-02
   * @intent 验证时间戳验证用于防重放攻击
   */
  it('should export verifyTimestamp function for replay protection', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('verifyTimestamp') || content.toLowerCase().includes('timestamp');
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证HMAC-SHA256算法能够正确验证正确的签名
   */
  it('should validate correct signature', () => {
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, secret);
    expect(verifySignature(timestamp, secret, signature)).toBe(true);
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证HMAC-SHA256算法能够正确拒绝无效的签名
   */
  it('should reject invalid signature', () => {
    const timestamp = Date.now();
    expect(verifySignature(timestamp, secret, 'invalid-signature')).toBe(false);
  });

  /**
   * @test REQ-002-1-02
   * @intent 验证中间件具有5分钟的时间窗口设置
   */
  it('should reject timestamp older than 5 minutes', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('300000') || content.includes('5 * 60 * 1000');
  });

  /**
   * @test REQ-002-1-02
   * @intent 验证时间戳验证功能可以拒绝超过5分钟的过期时间戳
   */
  it('should reject expired timestamp', () => {
    const oldTimestamp = Date.now() - 400000;
    expect(verifyTimestamp(oldTimestamp)).toBe(false);
  });

  /**
   * @test REQ-002-1-02
   * @intent 验证时间戳验证功能接受最近的未过期时间戳
   */
  it('should accept recent timestamp', () => {
    const recentTimestamp = Date.now() - 60000;
    expect(verifyTimestamp(recentTimestamp)).toBe(true);
  });

  /**
   * @test REQ-002-1-02
   * @intent 验证时间戳验证功能处理缺失的时间戳情况
   */
  it('should reject when timestamp is missing', () => {
    expect(verifyTimestamp(0)).toBe(false);
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证当密钥丢失时签名验证返回false
   */
  it('should reject when secret is missing', () => {
    expect(verifySignature(Date.now(), '', 'sig')).toBe(false);
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证当签名丢失时签名验证返回false
   */
  it('should reject when signature is missing', () => {
    expect(verifySignature(Date.now(), 'secret', '')).toBe(false);
  });

  /**
   * @test REQ-002-1-01
   * @intent 验证当所有参数都缺失时签名验证返回false
   */
  it('should reject when all parameters missing', () => {
    expect(verifySignature(0, '', '')).toBe(false);
  });
});
