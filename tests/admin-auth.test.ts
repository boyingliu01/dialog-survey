import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth } from '../src/middleware/admin-auth.js';

const TEST_NOW = new Date('2026-08-20T00:00:00.000Z');

function createMockReply(): Partial<FastifyReply> {
  const reply: Partial<FastifyReply> = {};
  reply.code = vi.fn().mockReturnValue(reply);
  reply.type = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  reply.status = vi.fn().mockReturnValue(reply);
  reply.redirect = vi.fn().mockReturnValue(reply);
  return reply;
}

function createMockRequest(
  sessionData: Record<string, unknown> | null,
  headers: Record<string, string | undefined> = {},
  method = 'POST'
): Partial<FastifyRequest> {
  return {
    method,
    session: {
      get: vi.fn().mockReturnValue(sessionData),
      delete: vi.fn(),
      set: vi.fn(),
      data: vi.fn(),
      changed: false,
      deleted: false,
      regenerate: vi.fn(),
      options: vi.fn(),
      touch: vi.fn(),
    },
    headers,
    url: '/admin/api/templates',
  };
}

describe('adminAuth middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    vi.stubEnv('SESSION_MAX_AGE', '28800');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('should allow access with valid session', async () => {
    const session = {
      userId: 'admin',
      role: 'admin' as const,
      loginTime: Date.now(),
      lastActivity: Date.now(),
    };
    const request = createMockRequest(session);
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect((request as FastifyRequest).user).toBeDefined();
    expect((request as FastifyRequest).user).toEqual({
      userId: 'admin',
      role: 'admin',
    });
    expect((request as FastifyRequest).adminAuthMode).toBe('session');
  });

  it('should allow access with valid API key', async () => {
    const request = createMockRequest(null, { 'x-admin-key': 'test-api-key' });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect((request as FastifyRequest).user).toBeDefined();
    expect((request as FastifyRequest).user).toEqual({
      userId: 'admin',
      role: 'admin',
    });
    expect((request as FastifyRequest).adminAuthMode).toBe('api-key');
  });

  it('should reject request with invalid session and no API key', async () => {
    const request = createMockRequest(null);
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('Admin API Key'));
  });

  it('should reject request with invalid API key', async () => {
    const request = createMockRequest(null, { 'x-admin-key': 'wrong-key' });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('should prefer session over API key', async () => {
    const session = {
      userId: 'admin',
      role: 'admin' as const,
      loginTime: Date.now(),
      lastActivity: Date.now(),
    };
    const request = createMockRequest(session, {
      'x-admin-key': 'test-api-key',
    });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect((request as FastifyRequest).adminAuthMode).toBe('session');
  });

  it('should allow a valid session when ADMIN_API_KEY is not configured', async () => {
    const session = {
      userId: 'session-admin',
      role: 'admin' as const,
      loginTime: Date.now(),
      lastActivity: Date.now(),
    };
    const request = createMockRequest(session, { 'x-admin-key': 'irrelevant-key' });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect((request as FastifyRequest).user).toEqual({
      userId: 'session-admin',
      role: 'admin',
    });
    expect((request as FastifyRequest).adminAuthMode).toBe('session');
  });

  it('should return 500 when ADMIN_API_KEY is not configured', async () => {
    const request = createMockRequest(null, { 'x-admin-key': 'test-api-key' });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('ADMIN_API_KEY'));
  });

  it('should delete an expired session before using API key fallback', async () => {
    const session = {
      userId: 'admin',
      role: 'admin' as const,
      loginTime: Date.now() - 28801 * 1000,
      lastActivity: Date.now() - 28801 * 1000,
    };
    const request = createMockRequest(session, { 'x-admin-key': 'test-api-key' });
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect(request.session?.delete).toHaveBeenCalled();
    expect((request as FastifyRequest).user).toBeDefined();
    expect((request as FastifyRequest).user).toEqual({
      userId: 'admin',
      role: 'admin',
    });
    expect((request as FastifyRequest).adminAuthMode).toBe('api-key');
  });

  it('should delete an expired session before redirecting an anonymous GET', async () => {
    const session = {
      userId: 'admin',
      role: 'admin' as const,
      loginTime: Date.now() - 28801 * 1000,
      lastActivity: Date.now() - 28801 * 1000,
    };
    const request = createMockRequest(session, {}, 'GET');
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(request.session?.delete).toHaveBeenCalled();
    expect(reply.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('should redirect unauthenticated GET requests to login page', async () => {
    const request = createMockRequest(null, {}, 'GET');
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.redirect).toHaveBeenCalledWith('/admin/login');
  });

  it('should redirect unauthenticated GET requests when ADMIN_API_KEY is not configured', async () => {
    const request = createMockRequest(null, {}, 'GET');
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.redirect).toHaveBeenCalledWith('/admin/login');
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should reject an anonymous mutation when ADMIN_API_KEY is not configured', async () => {
    const request = createMockRequest(null);
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('Admin API Key'));
  });

  it('should reject anonymous OPTIONS requests instead of exempting them', async () => {
    const request = createMockRequest(null, {}, 'OPTIONS');
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', undefined);

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.redirect).not.toHaveBeenCalled();
  });

  it('should await an early authentication response before resolving', async () => {
    let releaseSend: (() => void) | undefined;
    const sendCompletion = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const request = createMockRequest(null);
    const reply = createMockReply();
    reply.send = vi.fn().mockReturnValue(sendCompletion);
    let authResolved = false;

    const authCompletion = adminAuth(request as FastifyRequest, reply as FastifyReply).then(() => {
      authResolved = true;
    });
    await Promise.resolve();

    expect(authResolved).toBe(false);
    releaseSend?.();
    await authCompletion;
  });

  it('should redirect unauthenticated HEAD requests to login page', async () => {
    const request = createMockRequest(null, {}, 'HEAD');
    const reply = createMockReply();
    vi.stubEnv('ADMIN_API_KEY', 'test-api-key');

    await adminAuth(request as FastifyRequest, reply as FastifyReply);

    expect(reply.redirect).toHaveBeenCalledWith('/admin/login');
  });
});
