import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import { PrismaClient } from '@prisma/client';
import nunjucks from 'nunjucks';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const prisma = new PrismaClient();

// Create a minimal test app
async function createTestApp() {
  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: resolve(__dirname, '..', 'public'),
  });

  const viewsDir = resolve(__dirname, '..', 'src', 'views');
  await app.register(fastifyView, {
    engine: { nunjucks },
    templates: viewsDir,
    options: { autoescape: true, noCache: true },
  });

  // Skip content type parser for text/plain (HTMX)
  app.addContentTypeParser('*', () => {});

  const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');
  const { TemplateRepository } = await import('../src/repositories/template.repository.js');
  const { InterviewRepository } = await import('../src/repositories/interview.repository.js');
  const { AnalysisService } = await import('../src/services/analysis.service.js');
  const { AnalyticsService } = await import('../src/services/analytics.service.js');
  const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
  await app.register(adminTemplatesRoutes, {
    templateRepo: new TemplateRepository(prisma),
    interviewPlanService: new InterviewPlanService(prisma),
    interviewRepo: new InterviewRepository(prisma),
    analysisService: new AnalysisService(prisma),
    analyticsService: new AnalyticsService(prisma),
    prisma,
  });

  return app;
}

describe('DELETE /admin/api/templates/:id', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    vi.resetModules();
    process.env['ADMIN_API_KEY'] = 'test-secret-key';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    process.env['ADMIN_API_KEY'] = undefined;
  });

  it('should delete a draft template and verify it is gone from DB', async () => {
    // Create a draft template
    const template = await prisma.template.create({
      data: {
        name: 'Test Delete Template',
        content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q1'] }),
        status: 'DRAFT',
      },
    });

    // Verify it exists
    const before = await prisma.template.findUnique({ where: { id: template.id } });
    expect(before).not.toBeNull();

    // Send DELETE request
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/api/templates/${template.id}`,
      headers: { 'x-admin-key': 'test-secret-key' },
    });

    expect(response.statusCode).toBe(200);

    // Verify it is actually deleted from DB
    const after = await prisma.template.findUnique({ where: { id: template.id } });
    expect(after).toBeNull();
  });

  it('should return 404 for non-existent template', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/api/templates/non-existent-id',
      headers: { 'x-admin-key': 'test-secret-key' },
    });

    expect(response.statusCode).toBe(404);
  });
});
