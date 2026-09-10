import { readFile } from 'node:fs/promises';
import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import fastifyView from '@fastify/view';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminTemplatesRoutes } from '../src/api/admin-templates.js';
import { InterviewRepository } from '../src/repositories/interview.repository.js';
import { TemplateRepository } from '../src/repositories/template.repository.js';
import { AnalysisService } from '../src/services/analysis.service.js';
import { AnalyticsService } from '../src/services/analytics.service.js';
import { InterviewPlanService } from '../src/services/interview-plan.service.js';

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

describe('admin shell CSRF transport', () => {
  const prisma = new PrismaClient();
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const app of apps.splice(0)) await app.close();
  });

  it('renders one generated token into the meta transport and logout form', async () => {
    // Given
    vi.spyOn(TemplateRepository.prototype, 'findAllForAdminTree').mockResolvedValue([]);
    const app = Fastify({ logger: false });
    apps.push(app);
    await app.register(secureSession, { secret: 'a'.repeat(32), salt: 'b'.repeat(16) });
    await app.register(csrfProtection);
    await app.register(fastifyView, {
      engine: { nunjucks },
      templates: 'src/views',
      options: { autoescape: true, noCache: true },
    });
    app.post('/test/session', async (request) => {
      request.session.set('admin', {
        userId: 'session-admin',
        role: 'admin',
        loginTime: Date.now(),
        lastActivity: Date.now(),
      });
      return { authenticated: true };
    });
    await app.register(adminTemplatesRoutes, {
      templateRepo: new TemplateRepository(prisma),
      interviewPlanService: new InterviewPlanService(prisma),
      interviewRepo: new InterviewRepository(prisma),
      analysisService: new AnalysisService(prisma),
      analyticsService: new AnalyticsService(prisma),
      prisma,
    });
    await app.ready();
    const sessionResponse = await app.inject({ method: 'POST', url: '/test/session' });

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: cookieHeader(sessionResponse.headers['set-cookie']) },
    });

    // Then
    expect(response.statusCode).toBe(200);
    const metaToken = /<meta name="csrf-token" content="([^"]+)">/.exec(response.body)?.[1];
    expect(metaToken).toBeTruthy();
    expect(response.body).toContain(`name="_csrf" value="${metaToken}"`);
    expect(response.body).toContain('function adminCsrfToken()');
    expect(response.body).toContain('document.querySelector(\'meta[name="csrf-token"]\')');
    expect(response.body).toContain('var csrfToken = adminCsrfToken()');
    expect(response.body).toContain("evt.detail.headers['x-csrf-token'] = csrfToken");
    expect(response.body).not.toContain('document.cookie');
    expect(response.body).not.toContain('change-password');
  });

  it('sets the meta-derived CSRF token on the add-member XMLHttpRequest', async () => {
    // Given
    const template = await readFile('src/views/admin/content/plan-detail.njk', 'utf8');

    // When
    const addMemberScript = template.slice(
      template.indexOf("xhr.open('POST', '/api/plans/{{ plan.id }}/members'"),
      template.indexOf('xhr.send(JSON.stringify(payload))')
    );

    // Then
    expect(addMemberScript).toContain("xhr.setRequestHeader('x-csrf-token', adminCsrfToken())");
  });
});
