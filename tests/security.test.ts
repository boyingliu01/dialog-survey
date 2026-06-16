import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymizeData, generateApiKey } from '../src/utils/security.js';

vi.mock('@prisma/client', () => {
  const mockFindFirst = vi.fn();
  (globalThis as any).__mockFindFirst = mockFindFirst;
  return {
    PrismaClient: class MockPrismaClient {
      auditLog = { findFirst: mockFindFirst };
    },
  };
});

const _getMocks = () => ({
  findFirst: (globalThis as any).__mockFindFirst,
});

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

// TODO: Skip testing securityMiddleware function due to requiring full Fastify app setup which is too complex for unit tests
// TODO: Consider integration tests for logSecurityEvent that use real database with cleanup

/**
 * @test Tests for verifyApiKey middleware
 */
describe('verifyApiKey', () => {
  let ReplyClass: any;
  let mockPrisma: any;

  beforeEach(async () => {
    vi.resetModules();

    mockPrisma = {
      auditLog: {
        findFirst: vi.fn(),
      },
      apiKey: {
        findFirst: vi.fn(),
      },
    };

    ReplyClass = class MockReply {
      status(code: number) {
        (this as any)._statusCode = code;
        return this;
      }
      send(body: any) {
        (this as any)._body = body;
        return this;
      }
      _statusCode: number | undefined;
      _body: any;
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return 401 when no API key header is present', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    const verifyApiKey = createVerifyApiKey(mockPrisma);
    const request = { headers: {} } as any;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply);

    expect(result).toBe(reply);
    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: 'API key required' });
    expect(mockPrisma.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it('should set request.user when valid API key is found', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      userId: 'user-123',
      id: 'key-456',
      role: 'user',
    });

    const verifyApiKey = createVerifyApiKey(mockPrisma);
    const request = { headers: { 'x-api-key': 'ib_abcdef1234567890' } } as any;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply);

    expect(result).toBeUndefined();
    expect(request.user).toEqual({ userId: 'user-123', role: 'user', apiKeyId: 'key-456' });
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { keyHash: expect.any(String), revoked: false },
    });
  });

  it('should return 401 when API key is not found', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);

    const verifyApiKey = createVerifyApiKey(mockPrisma);
    const request = { headers: { 'x-api-key': 'ib_invalid_key' } } as any;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply);

    expect(result).toBe(reply);
    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: 'Invalid API key' });
  });

  it('should default userId to unknown when keyRecord has no userId', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'key-789', userId: null, role: 'user' });

    const verifyApiKey = createVerifyApiKey(mockPrisma);
    const request = { headers: { 'x-api-key': 'ib_xyz98765' } } as any;
    const reply = new ReplyClass();

    await verifyApiKey(request, reply);

    expect(request.user).toEqual({ userId: 'unknown', role: 'user', apiKeyId: 'key-789' });
  });
});
