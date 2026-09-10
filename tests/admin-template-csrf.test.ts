import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminTemplatesRoutes } from '../src/api/admin-templates.js';
import { InterviewRepository } from '../src/repositories/interview.repository.js';
import { TemplateRepository } from '../src/repositories/template.repository.js';
import { AnalysisService } from '../src/services/analysis.service.js';
import { AnalyticsService } from '../src/services/analytics.service.js';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

type BrowserState = {
  readonly cookie: string;
  readonly token: string;
};

type MutationCase = {
  readonly name: string;
  readonly method: 'POST' | 'PUT' | 'DELETE';
  readonly url: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly expectedStatus: number;
};

const mutationCases: readonly MutationCase[] = [
  {
    name: 'template creation',
    method: 'POST',
    url: '/admin/api/templates',
    payload: {},
    expectedStatus: 422,
  },
  {
    name: 'template update',
    method: 'PUT',
    url: '/admin/api/templates/template-id',
    payload: {},
    expectedStatus: 422,
  },
  {
    name: 'template deletion',
    method: 'DELETE',
    url: '/admin/api/templates/missing-template',
    expectedStatus: 404,
  },
];

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

describe('admin template mutation CSRF', () => {
  const prisma = new PrismaClient();
  const apps: FastifyInstance[] = [];

  async function createApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    apps.push(app);
    await app.register(secureSession, { secret: 'a'.repeat(32), salt: 'b'.repeat(16) });
    await app.register(csrfProtection);
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
    await app.register(adminTemplatesRoutes, {
      templateRepo: new TemplateRepository(prisma),
      interviewPlanService: new InterviewPlanService(prisma),
      interviewRepo: new InterviewRepository(prisma),
      analysisService: new AnalysisService(prisma),
      analyticsService: new AnalyticsService(prisma),
      prisma,
    });
    await app.ready();
    return app;
  }

  async function browserState(app: FastifyInstance): Promise<BrowserState> {
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
    vi.unstubAllEnvs();
    for (const app of apps.splice(0)) await app.close();
  });

  it.each(mutationCases)('rejects tokenless session $name', async (testCase) => {
    // Given
    const app = await createApp();
    const state = await browserState(app);

    // When
    const response = await app.inject({
      method: testCase.method,
      url: testCase.url,
      headers: { cookie: state.cookie },
      ...(testCase.payload === undefined ? {} : { payload: testCase.payload }),
    });

    // Then
    expect(response.statusCode).toBe(403);
  });

  it.each(mutationCases)(
    'allows matching session CSRF to reach $name behavior',
    async (testCase) => {
      // Given
      vi.spyOn(TemplateRepository.prototype, 'findById').mockResolvedValue(null);
      const app = await createApp();
      const state = await browserState(app);

      // When
      const response = await app.inject({
        method: testCase.method,
        url: testCase.url,
        headers: { cookie: state.cookie, 'x-csrf-token': state.token },
        ...(testCase.payload === undefined ? {} : { payload: testCase.payload }),
      });

      // Then
      expect(response.statusCode).toBe(testCase.expectedStatus);
    }
  );

  it('allows a valid explicit admin key to bypass CSRF', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { 'x-admin-key': 'valid-admin-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(422);
  });

  it('rejects an invalid explicit admin key before application validation', async () => {
    // Given
    vi.stubEnv('ADMIN_API_KEY', 'valid-admin-key');
    const app = await createApp();

    // When
    const response = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { 'x-admin-key': 'invalid-admin-key' },
      payload: {},
    });

    // Then
    expect(response.statusCode).toBe(401);
  });
});
