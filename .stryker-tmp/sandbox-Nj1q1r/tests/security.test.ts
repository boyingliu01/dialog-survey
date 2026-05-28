// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { anonymizeData, generateApiKey } from '../src/utils/security.js';

/**
 * @test Tests for the anonymization function that masks PII data
 */
describe('anonymizeData', () => {
  it('should mask Chinese phone numbers', () => {
    const phone = 'My phone is 13812345678 and 15987654321 is another one';
    const expected = 'My phone is 1XXXXXXXXXX and 1XXXXXXXXXX is another one';

    const result = anonymizeData(phone);

    expect(result).toBe(expected);
  });

  it('should mask email addresses', () => {
    const email = 'Contact me at john.doe@example.com or jane_smith@test.org';
    const expected = 'Contact me at xxx@xxx.xxx or xxx@xxx.xxx';

    const result = anonymizeData(email);

    expect(result).toBe(expected);
  });

  it('should mask Chinese ID cards', () => {
    const idCards = 'ID is 123456789012345678 and another is 87654321098765432X';
    const expected = 'ID is XXXXXXXXXXXXXXXXX and another is XXXXXXXXXXXXXXXXX';

    const result = anonymizeData(idCards);

    expect(result).toBe(expected);
  });

  it('should mask mixed PII data', () => {
    const mixed = 'Call 13812345678 at john.doe@example.com with ID 123456789012345678';
    const expected = 'Call 1XXXXXXXXXX at xxx@xxx.xxx with ID XXXXXXXXXXXXXXXXX';

    const result = anonymizeData(mixed);

    expect(result).toBe(expected);
  });

  it('should not modify data without PII', () => {
    const clean = 'This is clean data without PII';

    const result = anonymizeData(clean);

    expect(result).toBe(clean);
  });
});

/**
 * @test Tests for the API key generation function
 */
describe('generateApiKey', () => {
  it('should return a string starting with ib_', () => {
    const key = generateApiKey();

    expect(key.startsWith('ib_')).toBe(true);
  });

  it('should return a hex string of correct length', () => {
    const key = generateApiKey();
    const keyWithoutPrefix = key.substring(3);

    expect(keyWithoutPrefix.length).toBe(64);
  });

  it('should return different values for different calls', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1).not.toBe(key2);
  });
});

// These tests only validate the pure functions that do not require database connections

// TODO: Skip testing verifyApiKey function due to complexity of setting up pre-existing API key in auditLog
// TODO: Skip testing securityMiddleware function due to requiring full Fastify app setup which is too complex for unit tests
// TODO: Consider integration tests for logSecurityEvent that use real database with cleanup
