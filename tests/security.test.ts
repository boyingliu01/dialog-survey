import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import {
  anonymizeData,
  generateApiKey,
  logSecurityEvent,
  securityMiddleware,
  timingSafeEqualStrings,
} from '../src/utils/security.js';

vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
  const mockFindFirst = vi.fn();
  (globalThis as Record<string, unknown>)['__mockFindFirst'] = mockFindFirst;
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    PrismaClient: class MockPrismaClient {
      auditLog = { findFirst: mockFindFirst };
    },
  };
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

describe('timingSafeEqualStrings', () => {
  it('should return true for identical strings', () => {
    expect(timingSafeEqualStrings('ib_same_key_value', 'ib_same_key_value')).toBe(true);
  });

  it('should return false for different strings of the same length', () => {
    expect(timingSafeEqualStrings('ib_key_aaaaaaaaaaaa', 'ib_key_bbbbbbbbbbbb')).toBe(false);
  });

  it('should return false without throwing for strings of different lengths', () => {
    expect(() => timingSafeEqualStrings('short', 'a-much-longer-different-value')).not.toThrow();
    expect(timingSafeEqualStrings('short', 'a-much-longer-different-value')).toBe(false);
  });
});

// These tests only validate the pure functions that do not require database connections

/**
 * `securityMiddleware` only registers an onRequest hook — it needs a Fastify
 * instance to hang the hook on, not a booted application. A stub that captures
 * the hook is enough to assert the logging policy, which is the whole behaviour:
 * audit writes are the expensive part, so the filter is what matters.
 */
describe('securityMiddleware', () => {
  type HookHandler = (request: unknown, reply: unknown) => Promise<void>;

  function mount(): { handler: HookHandler; create: ReturnType<typeof vi.fn> } {
    let handler: HookHandler | undefined;
    const create = vi.fn().mockResolvedValue({});
    const stubFastify = {
      addHook: (name: string, fn: HookHandler) => {
        expect(name).toBe('onRequest');
        handler = fn;
      },
    };
    const prisma = { auditLog: { create } } as unknown as PrismaClient;
    // eslint-disable-next-line no-void
    void securityMiddleware(stubFastify as unknown as FastifyInstance, prisma);
    if (!handler) throw new Error('securityMiddleware did not register an onRequest hook');
    return { handler, create };
  }

  function req(method: string, url: string): unknown {
    return { method, url, ip: '10.1.2.3' };
  }

  it('registers an onRequest hook', () => {
    expect(() => mount()).not.toThrow();
  });

  it('does not audit health checks', async () => {
    const { handler, create } = mount();
    await handler(req('GET', '/health'), {});
    await handler(req('POST', '/health/ready'), {});
    expect(create).not.toHaveBeenCalled();
  });

  it('does not audit static assets', async () => {
    const { handler, create } = mount();
    await handler(req('POST', '/public/css/admin.css'), {});
    expect(create).not.toHaveBeenCalled();
  });

  it('does not audit plain GET requests to non-admin paths', async () => {
    const { handler, create } = mount();
    await handler(req('GET', '/api/plans'), {});
    expect(create).not.toHaveBeenCalled();
  });

  it('audits mutations', async () => {
    const { handler, create } = mount();
    await handler(req('POST', '/api/plans'), {});
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data['action']).toBe('REQUEST');
    expect(arg.data['ipAddress']).toBe('10.1.2.3');
    expect(arg.data['details']).toBe(JSON.stringify({ method: 'POST', path: '/api/plans' }));
  });

  it('audits GET requests to admin paths', async () => {
    const { handler, create } = mount();
    await handler(req('GET', '/admin/plans'), {});
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['PUT', 'DELETE'])('audits %s mutations', async (method) => {
    const { handler, create } = mount();
    await handler(req(method, '/api/plans/1'), {});
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not audit HEAD or OPTIONS', async () => {
    const { handler, create } = mount();
    await handler(req('HEAD', '/api/plans'), {});
    await handler(req('OPTIONS', '/api/plans'), {});
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * `logSecurityEvent` writes one audit row. Its only logic is dropping
 * undefined fields, so a stub prisma (no database) covers it fully.
 */
describe('logSecurityEvent', () => {
  function stubPrisma(): { create: ReturnType<typeof vi.fn>; client: PrismaClient } {
    const create = vi.fn().mockResolvedValue({});
    return { create, client: { auditLog: { create } } as unknown as PrismaClient };
  }

  it('writes every supplied field', async () => {
    const { create, client } = stubPrisma();
    await logSecurityEvent(client, {
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: 'u-1',
      userId: 'u-1',
      details: { reason: 'bad password' },
      ipAddress: '10.0.0.1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: 'u-1',
        userId: 'u-1',
        details: JSON.stringify({ reason: 'bad password' }),
        ipAddress: '10.0.0.1',
      },
    });
  });

  it('omits optional fields when absent rather than writing undefined', async () => {
    const { create, client } = stubPrisma();
    await logSecurityEvent(client, { action: 'REQUEST', entityType: 'api' });

    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(arg.data).sort()).toStrictEqual(['action', 'entityType']);
  });

  it('serializes details even when empty', async () => {
    const { create, client } = stubPrisma();
    await logSecurityEvent(client, { action: 'X', entityType: 'y', details: {} });

    const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data['details']).toBe('{}');
  });
});

/**
 * @test Tests for verifyApiKey middleware
 */
describe('verifyApiKey', () => {
  let ReplyClass: new () => {
    status: (code: number) => unknown;
    send: (body: unknown) => unknown;
    _statusCode: number | undefined;
    _body: unknown;
  };
  let mockPrisma: {
    auditLog: { findFirst: ReturnType<typeof vi.fn> };
    apiKey: { findFirst: ReturnType<typeof vi.fn> };
  };

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
      _statusCode: number | undefined;
      _body: unknown;
      status(code: number) {
        (this as { _statusCode: number })._statusCode = code;
        return this;
      }
      send(body: unknown) {
        (this as { _body: unknown })._body = body;
        return this;
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return 401 when no API key header is present', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    const verifyApiKey = createVerifyApiKey(mockPrisma as unknown as PrismaClient);
    const request = { headers: {} } as unknown as FastifyRequest;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply as unknown as FastifyReply);

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

    const verifyApiKey = createVerifyApiKey(mockPrisma as unknown as PrismaClient);
    const request = {
      headers: { 'x-api-key': 'ib_abcdef1234567890' },
    } as unknown as FastifyRequest;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(request.user).toEqual({ userId: 'user-123', role: 'user', apiKeyId: 'key-456' });
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { keyHash: expect.any(String), revoked: false },
    });
  });

  it('should return 401 when API key is not found', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);

    const verifyApiKey = createVerifyApiKey(mockPrisma as unknown as PrismaClient);
    const request = { headers: { 'x-api-key': 'ib_invalid_key' } } as unknown as FastifyRequest;
    const reply = new ReplyClass();

    const result = await verifyApiKey(request, reply as unknown as FastifyReply);

    expect(result).toBe(reply);
    expect(reply._statusCode).toBe(401);
    expect(reply._body).toEqual({ error: 'Invalid API key' });
  });

  it('should default userId to unknown when keyRecord has no userId', async () => {
    const { createVerifyApiKey } = await import('../src/utils/security.js');
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'key-789', userId: null, role: 'user' });

    const verifyApiKey = createVerifyApiKey(mockPrisma as unknown as PrismaClient);
    const request = { headers: { 'x-api-key': 'ib_xyz98765' } } as unknown as FastifyRequest;
    const reply = new ReplyClass();

    await verifyApiKey(request, reply as unknown as FastifyReply);

    expect(request.user).toEqual({ userId: 'unknown', role: 'user', apiKeyId: 'key-789' });
  });
});
