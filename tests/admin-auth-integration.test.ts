import secureSession from '@fastify/secure-session';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminAuth } from '../src/middleware/admin-auth.js';

async function createProtectedApp(handler: () => void): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(secureSession, {
    secret: 'a'.repeat(32),
    salt: 'b'.repeat(16),
  });
  app.route({
    method: ['GET', 'POST'],
    url: '/protected',
    preHandler: adminAuth,
    handler: async () => {
      handler();
      return { reached: true };
    },
  });
  app.post('/login', async (request) => {
    request.session.set('admin', {
      userId: 'session-admin',
      role: 'admin',
      loginTime: Date.now(),
      lastActivity: Date.now(),
    });
    return { loggedIn: true };
  });
  await app.ready();
  return app;
}

describe('adminAuth Fastify integration', () => {
  let apps: Array<ReturnType<typeof Fastify>> = [];

  function trackApp(app: ReturnType<typeof Fastify>): ReturnType<typeof Fastify> {
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    for (const app of apps) {
      await app.close();
    }
    apps = [];
  });

  it('should not reach a protected handler after an anonymous redirect', async () => {
    const handler = vi.fn();
    const app = trackApp(await createProtectedApp(handler));

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/admin/login');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not reach a protected handler after an anonymous 401 response', async () => {
    const handler = vi.fn();
    const app = trackApp(await createProtectedApp(handler));

    const response = await app.inject({ method: 'POST', url: '/protected' });

    expect(response.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should persist refreshed activity across requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
    vi.stubEnv('SESSION_MAX_AGE', '10');
    const handler = vi.fn();
    const app = trackApp(await createProtectedApp(handler));

    const loginResponse = await app.inject({ method: 'POST', url: '/login' });
    const sessionCookie = loginResponse.headers['set-cookie'];
    vi.advanceTimersByTime(9_000);

    const firstResponse = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: sessionCookie },
    });
    const refreshedCookie = firstResponse.headers['set-cookie'];
    expect(refreshedCookie).toBeDefined();
    if (!refreshedCookie) {
      throw new Error('Protected response did not refresh the session cookie');
    }
    vi.advanceTimersByTime(9_000);

    const secondResponse = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: refreshedCookie },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
