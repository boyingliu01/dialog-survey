import secureSession from '@fastify/secure-session';
import Fastify, { type FastifyInstance, type onRequestHookHandler } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminMutationGuard } from '../src/middleware/admin-csrf.js';

type ProtectedApp = {
  readonly app: FastifyInstance;
  readonly csrfProtection: onRequestHookHandler;
  readonly handler: ReturnType<typeof vi.fn>;
};

async function createProtectedApp(options?: {
  readonly rejectCsrf?: boolean;
}): Promise<ProtectedApp> {
  const app = Fastify({ logger: false });
  const handler = vi.fn();
  const csrfProtection: onRequestHookHandler = vi.fn((_request, reply, done) => {
    if (options?.rejectCsrf) {
      void reply.code(403).send({ error: 'Invalid csrf token' });
      return;
    }
    done();
  });
  await app.register(secureSession, {
    secret: 'a'.repeat(32),
    salt: 'b'.repeat(16),
  });
  app.post('/session', async (request, reply) => {
    request.session.set('admin', {
      userId: 'session-admin',
      role: 'admin',
      loginTime: Date.now(),
      lastActivity: Date.now(),
    });
    return reply.send({ authenticated: true });
  });
  app.post('/protected', {
    preHandler: createAdminMutationGuard(csrfProtection),
    handler: async () => {
      handler();
      return { reached: true };
    },
  });
  await app.ready();
  return { app, csrfProtection, handler };
}

describe('admin mutation CSRF guard', () => {
  let apps: FastifyInstance[] = [];

  async function closeApps(): Promise<void> {
    for (const app of apps) {
      await app.close();
    }
    apps = [];
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    await closeApps();
  });

  it('skips CSRF when authentication succeeds through an API key', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const result = await createProtectedApp();
    apps.push(result.app);
    const { app, csrfProtection, handler } = result;

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: { 'x-admin-key': 'valid-admin-key' },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(csrfProtection).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('invokes CSRF exactly once when authentication succeeds through a session', async () => {
    // Given
    const result = await createProtectedApp();
    apps.push(result.app);
    const { app, csrfProtection, handler } = result;
    const sessionResponse = await app.inject({ method: 'POST', url: '/session' });
    const sessionCookie = sessionResponse.headers['set-cookie'];

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: { cookie: sessionCookie },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(csrfProtection).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not invoke CSRF when authentication fails', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const result = await createProtectedApp();
    apps.push(result.app);
    const { app, csrfProtection, handler } = result;

    // When
    const response = await app.inject({ method: 'POST', url: '/protected' });

    // Then
    expect(response.statusCode).toBe(401);
    expect(csrfProtection).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops progression when CSRF rejects a session request', async () => {
    // Given
    const result = await createProtectedApp({ rejectCsrf: true });
    apps.push(result.app);
    const { app, csrfProtection, handler } = result;
    const sessionResponse = await app.inject({ method: 'POST', url: '/session' });
    const sessionCookie = sessionResponse.headers['set-cookie'];

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/protected',
      headers: { cookie: sessionCookie },
    });

    // Then
    expect(response.statusCode).toBe(403);
    expect(csrfProtection).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
