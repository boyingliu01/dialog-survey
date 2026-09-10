import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interviewPlanRoutes, isAdministrativePlanMutation } from '../src/api/plans.js';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';
import { createVerifyApiKey, hashApiKey } from '../src/utils/security.js';

type BrowserState = {
  readonly cookie: string;
  readonly token: string;
};

type ApiKeyRecord = {
  readonly id: string;
  readonly userId: string;
  readonly role: 'admin' | 'user';
};

const apiKeys = new Map<string, ApiKeyRecord>([
  [hashApiKey('admin-api-key'), { id: 'admin-key-id', userId: 'api-admin', role: 'admin' }],
  [hashApiKey('user-api-key'), { id: 'user-key-id', userId: 'api-user', role: 'user' }],
]);

const findApiKey = vi.fn(async (query: { readonly where: { readonly keyHash: string } }) => {
  return apiKeys.get(query.where.keyHash) ?? null;
});

function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): string {
  const cookies = new Map<string, string>();
  for (const setCookieHeader of setCookieHeaders) {
    const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const value of values) {
      const pair = value?.split(';')[0];
      const name = pair?.split('=')[0];
      if (pair && name) cookies.set(name, pair);
    }
  }
  return [...cookies.values()].join('; ');
}

describe('browser-driven plan mutation CSRF', () => {
  const prisma = new PrismaClient();
  const apps: ReturnType<typeof Fastify>[] = [];

  async function createApp(): Promise<ReturnType<typeof Fastify>> {
    const app = Fastify({ logger: false });
    apps.push(app);
    await app.register(secureSession, { secret: 'a'.repeat(32), salt: 'b'.repeat(16) });
    await app.register(csrfProtection);
    const verifierPrisma = {
      apiKey: { findFirst: findApiKey },
    };
    const verifyApiKey = createVerifyApiKey(verifierPrisma as unknown as PrismaClient);
    app.post('/test/session', async (request) => {
      request.session.set('admin', {
        userId: 'session-admin',
        role: 'admin',
        loginTime: Date.now(),
        lastActivity: Date.now(),
      });
      return { authenticated: true };
    });
    app.get('/test/csrf', async (_request, reply) => ({ token: reply.generateCsrf() }));
    await app.register(async (api) => {
      api.addHook('preHandler', async (request, reply) => {
        if (
          isAdministrativePlanMutation(request.method, request.url) &&
          request.headers['x-api-key'] === undefined
        )
          return;
        await verifyApiKey(request, reply);
      });
      await api.register(interviewPlanRoutes, {
        interviewPlanService: new InterviewPlanService(prisma),
        prisma,
      });
    });
    await app.ready();
    return app;
  }

  async function browserState(app: ReturnType<typeof Fastify>): Promise<BrowserState> {
    const sessionResponse = await app.inject({ method: 'POST', url: '/test/session' });
    const sessionCookie = cookieHeader(sessionResponse.headers['set-cookie']);
    const csrfResponse = await app.inject({
      method: 'GET',
      url: '/test/csrf',
      headers: { cookie: sessionCookie },
    });
    const payload: unknown = csrfResponse.json();
    if (!payload || typeof payload !== 'object' || !('token' in payload)) {
      throw new Error('CSRF endpoint did not return a token');
    }
    const token = payload.token;
    if (typeof token !== 'string') throw new Error('CSRF token was not a string');
    return {
      cookie: cookieHeader(sessionCookie, csrfResponse.headers['set-cookie']),
      token,
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    findApiKey.mockClear();
    vi.unstubAllEnvs();
    for (const app of apps.splice(0)) await app.close();
  });

  it('rejects a session mutation without a CSRF token', async () => {
    // Given
    const app = await createApp();
    const state = await browserState(app);

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { cookie: state.cookie },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(403);
  });

  it('bypasses the generic API-key hook for a query-bearing session mutation', async () => {
    // Given
    const app = await createApp();
    const state = await browserState(app);

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans?source=admin',
      headers: { cookie: state.cookie, 'x-csrf-token': state.token },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid input' });
  });

  it('allows a valid explicit admin key to bypass CSRF', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { 'x-admin-key': 'valid-admin-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid input' });
  });

  it('allows a verified generic admin API key to reach application validation', async () => {
    // Given
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { 'x-api-key': 'admin-api-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid input' });
    expect(findApiKey).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey('admin-api-key'), revoked: false },
    });
  });

  it('rejects a verified generic user API key for an administrative plan mutation', async () => {
    // Given
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { 'x-api-key': 'user-api-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(401);
  });

  it('rejects an invalid or revoked generic API key through the real verifier', async () => {
    // Given
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { 'x-api-key': 'revoked-or-invalid-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid API key' });
  });

  it('preserves generic user API-key access for non-administrative plan reads', async () => {
    // Given
    const listPlans = vi
      .spyOn(InterviewPlanService.prototype, 'listPlans')
      .mockResolvedValue({ plans: [], total: 0 });
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/api/plans',
      headers: { 'x-api-key': 'user-api-key' },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(listPlans).toHaveBeenCalledOnce();
  });

  it('requires CSRF for pause when authenticated by session', async () => {
    // Given
    const app = await createApp();
    const state = await browserState(app);
    const pausePlan = vi
      .spyOn(InterviewPlanService.prototype, 'pausePlan')
      .mockResolvedValue(undefined);

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans/plan-id/pause',
      headers: { cookie: state.cookie },
    });

    // Then
    expect(response.statusCode).toBe(403);
    expect(pausePlan).not.toHaveBeenCalled();
  });

  it('allows matching session CSRF for pause', async () => {
    // Given
    const app = await createApp();
    const state = await browserState(app);
    const pausePlan = vi
      .spyOn(InterviewPlanService.prototype, 'pausePlan')
      .mockResolvedValue(undefined);

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans/plan-id/pause',
      headers: { cookie: state.cookie, 'x-csrf-token': state.token },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(pausePlan).toHaveBeenCalledWith('plan-id');
  });

  it('allows matching session CSRF when ADMIN_API_KEY is absent', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', undefined);
    const app = await createApp();
    const state = await browserState(app);
    const pausePlan = vi
      .spyOn(InterviewPlanService.prototype, 'pausePlan')
      .mockResolvedValue(undefined);

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans/plan-id/pause',
      headers: { cookie: state.cookie, 'x-csrf-token': state.token },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(pausePlan).toHaveBeenCalledWith('plan-id');
  });

  it.each(['pause', 'resume', 'cancel'] as const)(
    'allows a verified generic admin API key to %s a plan',
    async (action) => {
      // Given
      const app = await createApp();
      vi.spyOn(InterviewPlanService.prototype, 'pausePlan').mockResolvedValue(undefined);
      vi.spyOn(InterviewPlanService.prototype, 'resumePlan').mockResolvedValue(undefined);
      vi.spyOn(InterviewPlanService.prototype, 'cancelPlan').mockResolvedValue(undefined);

      // When
      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/plan-id/${action}`,
        headers: { 'x-api-key': 'admin-api-key' },
      });

      // Then
      expect(response.statusCode).toBe(200);
    }
  );

  it.each(['pause', 'resume', 'cancel'] as const)(
    'rejects a verified generic user API key that attempts to %s a plan',
    async (action) => {
      // Given
      const app = await createApp();

      // When
      const response = await app.inject({
        method: 'POST',
        url: `/api/plans/plan-id/${action}`,
        headers: { 'x-api-key': 'user-api-key' },
      });

      // Then
      expect(response.statusCode).toBe(401);
    }
  );

  it('rejects an invalid explicit admin key before CSRF or application validation', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: { 'x-admin-key': 'invalid-admin-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(401);
  });
});
