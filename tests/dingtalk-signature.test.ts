import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateSignature,
  verifySignature,
  verifyTimestamp,
} from '../src/integrations/dingtalk/middleware.js';

describe('DingTalk Signature Verification', () => {
  const secret = 'SECxxxxxxxxxxxxxxxxxxxxxxx';

  it('should have dingtalk signature verification module', () => {
    expect(fs.existsSync('src/integrations/dingtalk/middleware.ts')).toBe(true);
  });

  it('should export verifySignature function', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('export function verifySignature');
  });

  it('should export verifyTimestamp function for replay protection', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('verifyTimestamp') || content.toLowerCase().includes('timestamp');
  });

  it('should validate correct signature', () => {
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, secret);
    expect(verifySignature(timestamp, secret, signature)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const timestamp = Date.now();
    expect(verifySignature(timestamp, secret, 'invalid-signature')).toBe(false);
  });

  it('should reject timestamp older than 5 minutes', () => {
    const content = fs.readFileSync('src/integrations/dingtalk/middleware.ts', 'utf-8');
    expect(content).toContain('300000') || content.includes('5 * 60 * 1000');
  });

  it('should reject expired timestamp', () => {
    const oldTimestamp = Date.now() - 400000;
    expect(verifyTimestamp(oldTimestamp)).toBe(false);
  });

  it('should accept recent timestamp', () => {
    const recentTimestamp = Date.now() - 60000;
    expect(verifyTimestamp(recentTimestamp)).toBe(true);
  });

  it('should reject when timestamp is missing', () => {
    expect(verifyTimestamp(0)).toBe(false);
  });

  it('should reject when secret is missing', () => {
    expect(verifySignature(Date.now(), '', 'sig')).toBe(false);
  });

  it('should reject when signature is missing', () => {
    expect(verifySignature(Date.now(), 'secret', '')).toBe(false);
  });

  it('should reject when all parameters missing', () => {
    expect(verifySignature(0, '', '')).toBe(false);
  });
});
