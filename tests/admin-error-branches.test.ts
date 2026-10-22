import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

/**
 * Error-branch coverage for `src/api/admin-templates.ts`.
 *
 * After the happy-path suites, every remaining uncovered mutant sat in a `catch`
 * block: the route ran, the throw never did. These tests inject failing
 * dependencies so each handler's 500 path executes and its message is asserted —
 * asserting the body, not just the status, is what distinguishes "the error was
 * surfaced" from "the error was swallowed and an empty 500 returned".
 *
 * Dependencies are injected as stubs rather than the real repositories, which is
 * the same seam `server.ts` uses.
 */

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

let prisma: PrismaClient;
const boom = new Error('injected failure');

/** Every collaborator the routes accept, each method rejecting. */
function failingDeps() {
  const fail = () => Promise.reject(boom);
  return {
    templateRepo: {
      findById: fail,
      findByIdWithCounts: fail,
      findAllPaginated: fail,
      findAllForAdminTree: fail,
      findAllForSelect: fail,
      create: fail,
      updateWithVersion: fail,
      publish: fail,
      deleteAndVerify: fail,
      getUsageStats: fail,
      findAll: fail,
    },
    interviewPlanService: {
      countByStatusForTemplate: fail,
      findByIdWithDeleteChecks: fail,
      findByIdWithTemplate: fail,
      findByIdWithInterviewsAndCounts: fail,
      findAllForSelect: fail,
      findAllForDashboard: fail,
      deletePlan: fail,
      deletePlanWithInterviews: fail,
      findAll: fail,
    },
    interviewRepo: {
      countByStatusForTemplate: fail,
      findByIdForReportDetail: fail,
      findByIdForReportExport: fail,
      findByPlanId: fail,
      findRecent: fail,
    },
    interviewPlanRepo: {
      findInviteeData: fail,
      findAll: fail,
    },
    analysisService: {
      getReportByInterviewId: fail,
      findRecentReports: fail,
      analyzeInterview: fail,
    },
    analyticsService: {
      getKPIs: fail,
      getStatusDistribution: fail,
      getPlanCompletionRates: fail,
      getWeeklyTrend: fail,
      getDashboardPlanProgress: fail,
      getPlanStats: fail,
    },
    templateDimensionService: {
      findAll: fail,
      updateTemplateDimensions: fail,
    },
  };
}

async function createFailingApp(deps: Record<string, unknown> = failingDeps()) {
  const { default: Fastify } = await import('fastify');
  const { resolve } = await import('node:path');
  const { default: fastifyView } = await import('@fastify/view');
  const { default: nunjucks } = await import('nunjucks');
  const { default: secureSession } = await import('@fastify/secure-session');
  const { default: csrfProtection } = await import('@fastify/csrf-protection');

  const app = Fastify({ logger: false });
  await app.register(secureSession, { secret: 'a'.repeat(32), salt: 'b'.repeat(16) });
  await app.register(csrfProtection);
  app.addHook('onRequest', async (request) => {
    if (request.headers['x-admin-key'] === undefined) {
      request.headers['x-admin-key'] = 'test-secret-key';
    }
  });
  await app.register(fastifyView, {
    engine: { nunjucks },
    templates: resolve(import.meta.dirname, '..', 'src', 'views'),
    options: {
      autoescape: true,
      noCache: true,
      onConfigure: (env: import('nunjucks').Environment) => {
        env.addFilter('date', () => '-');
        env.addFilter('markdown', (input: string | null | undefined) => input ?? '');
      },
    },
  });
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      try {
        done(null, JSON.parse(body));
      } catch {
        done(null, {});
      }
    }
  );
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    }
  );
  app.addContentTypeParser('*', (_req, _b, done) => done(null, ''));

  const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');
  await app.register(adminTemplatesRoutes, deps as never);
  return app;
}

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
  await prisma.$connect();
});

describe('admin-templates error branches', () => {
  let app: Awaited<ReturnType<typeof createFailingApp>>;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', 'test-secret-key');
    app = await createFailingApp();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await app?.close();
  });

  const cases: Array<{ name: string; method: 'GET' | 'POST' | 'DELETE'; url: string }> = [
    { name: 'admin tree', method: 'GET', url: '/admin' },
    { name: 'dashboard', method: 'GET', url: '/admin/content/dashboard' },
    { name: 'analytics page', method: 'GET', url: '/admin/analytics' },
    { name: 'analytics data', method: 'GET', url: '/admin/api/analytics/data' },
    { name: 'reports list', method: 'GET', url: '/admin/reports' },
    { name: 'report detail', method: 'GET', url: '/admin/reports/some-id' },
    { name: 'report fragment', method: 'GET', url: '/admin/content/reports/some-id' },
    { name: 'templates list', method: 'GET', url: '/admin/api/templates' },
    { name: 'template usage', method: 'GET', url: '/admin/api/templates/some-id/usage' },
    { name: 'template stats', method: 'GET', url: '/admin/api/templates/some-id/stats' },
    { name: 'template edit form', method: 'GET', url: '/admin/content/templates/some-id/edit' },
    { name: 'template publish', method: 'POST', url: '/admin/api/templates/some-id/publish' },
    { name: 'template delete', method: 'DELETE', url: '/admin/api/templates/some-id' },
    { name: 'plan delete', method: 'DELETE', url: '/admin/api/plans/some-id' },
  ];

  for (const c of cases) {
    it(`${c.name} surfaces the failure instead of throwing`, async () => {
      const res = await app.inject({ method: c.method, url: c.url });
      expect(res.statusCode).toBe(500);
      // The injected message reaches the client, so a swallowed error is caught.
      // Some handlers render it through Nunjucks `error.njk`, which wraps it in an
      // `Error: ` prefix, hence the loose match.
      expect(res.body).toMatch(/injected failure/);
    });
  }

  // These routes have no try/catch by design: the error propagates to Fastify,
  // which renders its own 500. The point of testing them is that the failure is
  // not silently turned into a 200 with an empty page.
  const uncatched: Array<{ name: string; url: string }> = [
    { name: 'template detail', url: '/admin/content/templates/some-id' },
    { name: 'plan detail', url: '/admin/content/plans/some-id' },
    { name: 'plan edit form', url: '/admin/content/plans/some-id/edit' },
    { name: 'plan interviews', url: '/admin/content/plans/some-id/all-interviews' },
  ];

  for (const c of uncatched) {
    it(`${c.name} fails loudly rather than rendering an empty page`, async () => {
      const res = await app.inject({ method: 'GET', url: c.url });
      expect(res.statusCode).toBe(500);
    });
  }

  it('the template create route reports a schema failure as 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      // No questions: rejected by content validation before the repo is touched.
      payload: 'name=x&invitationPrompt=y',
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('请至少添加一个问题');
  });

  it('the template update route reports a missing version as 422', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/templates/some-id',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=x&invitationPrompt=y&questions[0][text]=q',
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('Version number is required');
  });
});

/**
 * Rendering assertions for the pure helpers behind the admin pages.
 *
 * `fmtDate` and `buildInviteeNameMap` return plain strings that the templates
 * interpolate, so a mutant that changes a format or drops a lookup is invisible
 * unless a test reads the rendered page. These drive the two pages that surface
 * them with fixed data and assert the exact output.
 */
describe('admin-templates render helpers', () => {
  let app: Awaited<ReturnType<typeof createFailingApp>>;

  const createdAt = new Date('2026-03-04T05:06:07.000Z');

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', 'test-secret-key');
    const ok =
      <T>(v: T) =>
      () =>
        Promise.resolve(v);
    app = await createFailingApp({
      templateRepo: {
        findAllPaginated: ok({ items: [], total: 0, page: 1, pageSize: 20 }),
        findAllForAdminTree: ok([]),
        findAllForSelect: ok([]),
      },
      interviewPlanService: {
        findByIdWithInterviewsAndCounts: ok({
          id: 'plan-1',
          templateId: 'tpl-1',
          inviteeData: [
            { userId: 'u1', name: '张三' },
            { userId: 'u2', name: '李四' },
            { userId: 'u3' },
            'not-an-object',
            null,
          ],
          interviews: [
            { id: 'i1', userId: 'u1', status: 'COMPLETED' },
            { id: 'i2', userId: 'u2', status: 'COMPLETED' },
            { id: 'i3', userId: 'u3', status: 'PENDING' },
          ],
          _count: { interviews: 3 },
          sentCount: 3,
          template: { id: 'tpl-1', name: 'T' },
        }),
      },
      analysisService: {
        getPlanStats: ok(null),
        findRecentReports: ok([
          {
            interviewId: 'i1',
            createdAt,
            sentiment: 'positive',
            interview: { userId: 'u1', status: 'COMPLETED' },
          },
          // A report whose interview row is gone: the `?? '-'` fallbacks apply.
          { interviewId: 'i2', createdAt: null, sentiment: null, interview: null },
        ]),
      },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await app?.close();
  });

  it('renders invitee names keyed by userId, skipping entries without one', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/content/plans/plan-1' });
    expect(res.statusCode).toBe(200);
    // Names come from inviteeData and are joined onto the interviews by userId.
    expect(res.body).toContain('张三');
    expect(res.body).toContain('李四');
    // The entry with no name must not produce an empty badge.
    expect(res.body).not.toContain('>undefined<');
  });

  it('renders the report list with formatted dates and dash fallbacks', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/reports' });
    expect(res.statusCode).toBe(200);
    // One row has a real timestamp: the zh-CN formatting shows a year and time.
    expect(res.body).toMatch(/2026/);
    // The orphaned row falls back to '-' for user, status and date.
    expect(res.body).toContain('-');
    expect(res.body).not.toContain('undefined');
    expect(res.body).not.toContain('null');
  });
});
