import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interviewPlanRoutes, isAdministrativePlanMutation } from '../src/api/plans.js';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

type BrowserState = {
  readonly cookie: string;
  readonly token: string;
};

type PlanMutationCase = {
  readonly name: string;
  readonly method: 'POST' | 'PUT' | 'DELETE';
  readonly url: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly expectedStatus: number;
};

const validPlan = {
  name: 'Plan',
  templateId: '123e4567-e89b-12d3-a456-426614174000',
} as const;

const planMutationCases: readonly PlanMutationCase[] = [
  { name: 'create', method: 'POST', url: '/api/plans', payload: validPlan, expectedStatus: 200 },
  {
    name: 'update',
    method: 'PUT',
    url: '/api/plans/plan-id?source=admin',
    payload: validPlan,
    expectedStatus: 200,
  },
  { name: 'send', method: 'POST', url: '/api/plans/plan-id/send', expectedStatus: 200 },
  {
    name: 'interview resend',
    method: 'POST',
    url: '/api/plans/plan-id/interviews/interview-id/send?retry=true',
    expectedStatus: 200,
  },
  { name: 'pause', method: 'POST', url: '/api/plans/plan-id/pause', expectedStatus: 200 },
  {
    name: 'resume',
    method: 'POST',
    url: '/api/plans/plan-id/resume?source=admin',
    expectedStatus: 200,
  },
  { name: 'cancel', method: 'POST', url: '/api/plans/plan-id/cancel', expectedStatus: 200 },
  {
    name: 'add member',
    method: 'POST',
    url: '/api/plans/plan-id/members',
    payload: { userId: 'member-id' },
    expectedStatus: 200,
  },
  {
    name: 'delete member',
    method: 'DELETE',
    url: '/api/plans/plan-id/members/interview-id?source=admin',
    expectedStatus: 200,
  },
  {
    name: 'remind',
    method: 'POST',
    url: '/api/plans/plan-id/remind',
    payload: {},
    expectedStatus: 200,
  },
  {
    name: 'import preview',
    method: 'POST',
    url: '/api/plans/missing-plan/import-preview?dryRun=true',
    expectedStatus: 404,
  },
  {
    name: 'import commit',
    method: 'POST',
    url: '/api/plans/plan-id/import-commit',
    payload: {},
    expectedStatus: 400,
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

describe('plan route session CSRF', () => {
  const prisma = new PrismaClient();
  const apps: FastifyInstance[] = [];

  async function createApp(): Promise<FastifyInstance> {
    vi.spyOn(InterviewPlanService.prototype, 'createPlan').mockResolvedValue('created-plan');
    vi.spyOn(InterviewPlanService.prototype, 'updatePlan').mockResolvedValue(undefined);
    vi.spyOn(InterviewPlanService.prototype, 'sendInvitations').mockResolvedValue({
      sent: 0,
      failed: 0,
    });
    vi.spyOn(InterviewPlanService.prototype, 'resendToInterview').mockResolvedValue({
      success: true,
    });
    vi.spyOn(InterviewPlanService.prototype, 'pausePlan').mockResolvedValue(undefined);
    vi.spyOn(InterviewPlanService.prototype, 'resumePlan').mockResolvedValue(undefined);
    vi.spyOn(InterviewPlanService.prototype, 'cancelPlan').mockResolvedValue(undefined);
    vi.spyOn(InterviewPlanService.prototype, 'addMember').mockResolvedValue({
      interviewId: 'interview-id',
    });
    vi.spyOn(InterviewPlanService.prototype, 'removeMember').mockResolvedValue(undefined);
    vi.spyOn(InterviewPlanService.prototype, 'sendReminder').mockResolvedValue({
      reminded: 0,
      failed: 0,
    });
    vi.spyOn(prisma.interviewPlan, 'findUnique').mockResolvedValue(null);

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
    await app.register(async (api) => {
      api.addHook('preHandler', async (request, reply) => {
        if (isAdministrativePlanMutation(request.method, request.url)) return;
        await reply.code(401).send({ error: 'API key required' });
      });
      await api.register(interviewPlanRoutes, {
        interviewPlanService: new InterviewPlanService(prisma),
        prisma,
      });
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
    for (const app of apps.splice(0)) await app.close();
  });

  it.each(planMutationCases)('rejects tokenless session $name', async (testCase) => {
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

  it.each(planMutationCases)('allows matching session CSRF to reach $name', async (testCase) => {
    // Given
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
  });
});
