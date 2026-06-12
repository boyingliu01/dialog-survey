import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

async function createAdminApp() {
  const { default: Fastify } = await import('fastify');
  const { resolve } = await import('node:path');
  const { default: fastifyStatic } = await import('@fastify/static');
  const { default: fastifyView } = await import('@fastify/view');
  const { default: nunjucks } = await import('nunjucks');

  const viewsDir = resolve(import.meta.dirname, '..', 'src', 'views');
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root: resolve(import.meta.dirname, '..', 'public'),
  });

  await app.register(fastifyView, {
    engine: { nunjucks },
    templates: viewsDir,
    options: {
      autoescape: true,
      noCache: true,
      onConfigure: (env: import('nunjucks').Environment) => {
        env.addFilter('date', (date: Date | string | null | undefined) => {
          if (!date) return '-';
          const d = typeof date === 'string' ? new Date(date) : date;
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        });
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
      const params = new URLSearchParams(body);
      const result: Record<string, unknown> = {};
      for (const [key, value] of params) {
        const bracketMatch = key.match(/^(\w+)\[(\d+)\]\[(\w+)\]$/);
        if (bracketMatch) {
          const [, parent, idx, prop] = bracketMatch;
          const arr = (result[parent] as Array<Record<string, string>>) || [];
          const numIdx = Number(idx);
          if (!arr[numIdx]) arr[numIdx] = {};
          arr[numIdx][prop] = value;
          result[parent] = arr;
        } else {
          result[key] = value;
        }
      }
      done(null, result);
    }
  );

  app.addContentTypeParser('*', (_req, _body, done) => {
    done(null, '');
  });

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
  });

  return app;
}

async function createPlansApp() {
  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });

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

  app.addContentTypeParser('*', (_req, _body, done) => {
    done(null, '');
  });

  const { interviewPlanRoutes } = await import('../src/api/plans.js');
  await app.register(interviewPlanRoutes);

  return app;
}

async function createAnalysisApp() {
  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });
  const { analysisRoutes } = await import('../src/api/analysis.js');
  await app.register(analysisRoutes, { prisma });
  await app.ready();
  return app;
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Shared fixture state for Scenario 2 — populated once per suite run
// ---------------------------------------------------------------------------
interface Scenario2Fixtures {
  templateId: string;
  planId: string;
  interviewId: string;
  reportId: string;
  batchReportId: string;
}

const s2 = {} as Scenario2Fixtures;

describe('Workflow: Interview Plan Maintenance', () => {
  let adminApp: Awaited<ReturnType<typeof createAdminApp>>;
  let plansApp: Awaited<ReturnType<typeof createPlansApp>>;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', 'test-secret-key');
    adminApp = await createAdminApp();
    plansApp = await createPlansApp();
    await prisma.$connect();
  });

  afterAll(async () => {
    await adminApp.close();
    await plansApp.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  // ----------------------------------------------------------------
  // Happy path: create template → create plan → delete plan → delete template
  // ----------------------------------------------------------------
  it(
    'create template -> create plan -> delete plan -> delete template',
    { timeout: 30000 },
    async () => {
      // Create template directly in DB (admin POST API has known issue with empty 201 response)
      const template = await prisma.template.create({
        data: {
          name: 'WF-Template-1',
          content: JSON.stringify({ invitationPrompt: 'hello', questions: ['q1', 'q2'] }),
          status: 'DRAFT',
        },
      });
      if (!template) throw new Error('Expected template to exist');
      const templateId = template.id;

      try {
        // 2. Create plan via plans API
        const createPlanRes = await plansApp.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'WF-Plan-1', templateId },
        });
        expect(createPlanRes.statusCode).toBe(200);
        const planBody = JSON.parse(createPlanRes.body);
        expect(planBody.id).toBeDefined();
        const planId: string = planBody.id;

        // Verify plan in DB
        const planInDb = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        expect(planInDb).not.toBeNull();
        if (planInDb) expect(planInDb.templateId).toBe(templateId);

        // 3. Delete plan
        const deletePlanRes = await adminApp.inject({
          method: 'DELETE',
          url: `/admin/api/plans/${planId}`,
          headers: { 'x-admin-key': 'test-secret-key' },
        });
        expect(deletePlanRes.statusCode).toBe(200);
        expect(deletePlanRes.body).toContain('计划已删除');

        // Verify plan deleted from DB
        const deletedPlan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        expect(deletedPlan).toBeNull();

        // 4. Delete template
        const deleteTplRes = await adminApp.inject({
          method: 'DELETE',
          url: `/admin/api/templates/${templateId}`,
          headers: { 'x-admin-key': 'test-secret-key' },
        });
        expect(deleteTplRes.statusCode).toBe(200);

        // Verify template deleted from DB
        const deletedTpl = await prisma.template.findUnique({ where: { id: templateId } });
        expect(deletedTpl).toBeNull();
      } finally {
        // Cleanup: ensure no dangling records
        await prisma.interviewPlan.deleteMany({ where: { templateId } }).catch(() => {});
        await prisma.template.deleteMany({ where: { id: templateId } }).catch(() => {});
      }
    }
  );

  // ----------------------------------------------------------------
  // Boundary: delete template when associated plan exists → 409
  // ----------------------------------------------------------------
  it(
    'should reject: delete template when associated plan exists (409)',
    { timeout: 30000 },
    async () => {
      // Create template directly in DB
      const template = await prisma.template.create({
        data: {
          name: 'WF-Template-Cascade',
          content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q'] }),
          status: 'DRAFT',
        },
      });
      if (!template) throw new Error('Expected template to exist');
      const templateId = template.id;

      try {
        // Create plan (references template)
        const plan = await prisma.interviewPlan.create({
          data: { name: 'WF-Plan-Cascade', templateId, status: 'PENDING' },
        });

        // Try to delete template → should fail 409
        const deleteRes = await adminApp.inject({
          method: 'DELETE',
          url: `/admin/api/templates/${templateId}`,
          headers: { 'x-admin-key': 'test-secret-key' },
        });
        expect(deleteRes.statusCode).toBe(409);

        // Verify template still exists
        const stillExists = await prisma.template.findUnique({ where: { id: templateId } });
        expect(stillExists).not.toBeNull();

        // Cleanup: delete plan first, then template
        await prisma.interviewPlan.delete({ where: { id: plan.id } });
        await prisma.template.delete({ where: { id: templateId } });
      } finally {
        await prisma.interviewPlan.deleteMany({ where: { templateId } }).catch(() => {});
        await prisma.template.deleteMany({ where: { id: templateId } }).catch(() => {});
      }
    }
  );

  // ----------------------------------------------------------------
  // Boundary: delete plan when completed interviews exist → 409
  // ----------------------------------------------------------------
  it('should reject: delete plan when completed interviews exist (409)', async () => {
    // Create template
    const tpl = await prisma.template.create({
      data: {
        name: 'WF-Template-Int',
        content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q'] }),
        status: 'DRAFT',
      },
    });

    try {
      // Create plan
      const plan = await prisma.interviewPlan.create({
        data: { name: 'WF-Plan-Int', templateId: tpl.id, status: 'PENDING' },
      });

      // Create COMPLETED interview under this plan
      const interview = await prisma.interview.create({
        data: {
          userId: 'wf-lifecycle-user',
          templateId: tpl.id,
          planId: plan.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Try to delete plan → should fail 409
      const deleteRes = await adminApp.inject({
        method: 'DELETE',
        url: `/admin/api/plans/${plan.id}`,
        headers: { 'x-admin-key': 'test-secret-key' },
      });
      expect(deleteRes.statusCode).toBe(409);
      expect(deleteRes.body).toContain('访谈记录');

      // Verify plan still exists
      const planStillExists = await prisma.interviewPlan.findUnique({ where: { id: plan.id } });
      expect(planStillExists).not.toBeNull();

      // Cleanup
      await prisma.analysisReport
        .deleteMany({ where: { interviewId: interview.id } })
        .catch(() => {});
      await prisma.message.deleteMany({ where: { interviewId: interview.id } }).catch(() => {});
      await prisma.response.deleteMany({ where: { interviewId: interview.id } }).catch(() => {});
      await prisma.interview.deleteMany({ where: { id: interview.id } });
      await prisma.interviewPlan.deleteMany({ where: { id: plan.id } });
    } finally {
      await prisma.interview.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.interviewPlan.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.template.deleteMany({ where: { id: tpl.id } }).catch(() => {});
    }
  });
});

describe('Workflow: Interview Analysis', () => {
  let adminApp: Awaited<ReturnType<typeof createAdminApp>>;
  let plansApp: Awaited<ReturnType<typeof createPlansApp>>;
  let analysisApp: Awaited<ReturnType<typeof createAnalysisApp>>;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', 'test-secret-key');
    adminApp = await createAdminApp();
    plansApp = await createPlansApp();
    analysisApp = await createAnalysisApp();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup Scenario 2 shared fixtures
    await prisma.analysisReport
      .deleteMany({ where: { interviewId: s2.interviewId } })
      .catch(() => {});
    await prisma.message.deleteMany({ where: { interviewId: s2.interviewId } }).catch(() => {});
    await prisma.response.deleteMany({ where: { interviewId: s2.interviewId } }).catch(() => {});
    await prisma.interview.deleteMany({ where: { id: s2.interviewId } }).catch(() => {});
    await prisma.batchAnalysisReport.deleteMany({ where: { planId: s2.planId } }).catch(() => {});
    await prisma.interview.deleteMany({ where: { planId: s2.planId } }).catch(() => {});
    await prisma.interviewPlan.deleteMany({ where: { id: s2.planId } }).catch(() => {});
    await prisma.template.deleteMany({ where: { id: s2.templateId } }).catch(() => {});

    await adminApp.close();
    await plansApp.close();
    await analysisApp.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  // ----------------------------------------------------------------
  // Happy path: create template → create plan → import invitees →
  // execute interview → generate report → batch aggregate
  // ----------------------------------------------------------------
  it(
    'create template -> plan -> invitees -> execute -> report -> aggregate',
    { timeout: 30000 },
    async () => {
      // 1. Create template directly in DB (admin POST API has known issue with empty 201 response)
      const template = await prisma.template.create({
        data: {
          name: 'WF-Analysis-Template',
          content: JSON.stringify({
            invitationPrompt: 'Welcome',
            questions: ['Tell me about yourself', 'Why this role?'],
          }),
          status: 'DRAFT',
        },
      });
      s2.templateId = template.id;

      // 2. Create plan via plans API
      const createPlanRes = await plansApp.inject({
        method: 'POST',
        url: '/api/plans',
        payload: { name: 'WF-Analysis-Plan', templateId: s2.templateId },
      });
      expect(createPlanRes.statusCode).toBe(200);
      const planBody = JSON.parse(createPlanRes.body);
      expect(planBody.id).toBeDefined();
      s2.planId = planBody.id;

      // 3. Import invitees (simulate publishing plan)
      const inviteRes = await plansApp.inject({
        method: 'POST',
        url: `/api/plans/${s2.planId}/invitees`,
        payload: {
          invitees: [{ userId: 'wf-user-analysis', name: 'Alice' }],
        },
      });
      expect(inviteRes.statusCode).toBe(200);

      // 4. Simulate interview execution: create COMPLETED interview with messages
      const interview = await prisma.interview.create({
        data: {
          userId: 'wf-user-analysis',
          templateId: s2.templateId,
          planId: s2.planId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      s2.interviewId = interview.id;

      await prisma.message.create({
        data: {
          interviewId: interview.id,
          role: 'user',
          content: 'I have 5 years of experience in software engineering.',
        },
      });
      await prisma.message.create({
        data: {
          interviewId: interview.id,
          role: 'assistant',
          content: 'Great! Tell me about a challenging project.',
        },
      });
      await prisma.response.create({
        data: {
          interviewId: interview.id,
          questionId: 'Tell me about yourself',
          content: 'I have 5 years of experience in software engineering.',
        },
      });

      // 5. Simulate report generation by inserting AnalysisReport directly
      //    (real LLM-based report generation is not available in test env)
      const report = await prisma.analysisReport.create({
        data: {
          interviewId: interview.id,
          content: '# Interview Report\n\nCandidate has strong engineering background.',
          keyFindings: ['5 years experience', 'Strong engineering background'],
          sentiment: 'positive',
          recommendations: ['Proceed to next round'],
        },
      });
      s2.reportId = report.id;

      // 6. Verify report via API
      const getReportRes = await analysisApp.inject({
        method: 'GET',
        url: `/api/analysis/report/${interview.id}`,
      });
      expect(getReportRes.statusCode).toBe(200);
      const reportBody = JSON.parse(getReportRes.body);
      expect(reportBody.keyFindings).toContain('5 years experience');

      // 7. Generate batch aggregate analysis
      const aggregateRes = await analysisApp.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${s2.planId}`,
      });
      expect(aggregateRes.statusCode).toBe(201);
      const aggBody = JSON.parse(aggregateRes.body);
      expect(aggBody.batchReportId).toBeDefined();
      expect(aggBody.status).toBe('PENDING');
      s2.batchReportId = aggBody.batchReportId;

      // 8. Verify aggregate report via API
      const getAggRes = await analysisApp.inject({
        method: 'GET',
        url: `/api/analysis/aggregate/${s2.batchReportId}`,
      });
      expect(getAggRes.statusCode).toBe(200);
      const aggReport = JSON.parse(getAggRes.body);
      expect(aggReport.planId).toBe(s2.planId);
      expect(aggReport.status).toBe('PENDING');

      // ---- NOT_IMPLEMENTED: Export report / Export analysis ----
      // The project currently has no "export report" or "export analysis" API endpoints.
      // These steps are identified as gaps in the current feature set.
    }
  );

  // ----------------------------------------------------------------
  // Boundary: aggregate when plan has no COMPLETED interviews → 400
  // ----------------------------------------------------------------
  it('should reject: batch aggregate with no completed interviews (400)', async () => {
    const tpl = await prisma.template.create({
      data: {
        name: 'WF-Boundary-Tpl',
        content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q'] }),
        status: 'DRAFT',
      },
    });

    try {
      const plan = await prisma.interviewPlan.create({
        data: { name: 'WF-Boundary-Plan', templateId: tpl.id, status: 'PENDING' },
      });

      // Create PENDING interview (not completed)
      await prisma.interview.create({
        data: {
          userId: 'wf-boundary-user',
          templateId: tpl.id,
          planId: plan.id,
          status: 'PENDING',
        },
      });

      // Try to aggregate → should fail 400
      const res = await analysisApp.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${plan.id}`,
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('COMPLETED');

      // Cleanup
      await prisma.interview.deleteMany({ where: { planId: plan.id } });
      await prisma.interviewPlan.delete({ where: { id: plan.id } });
    } finally {
      await prisma.interview.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.interviewPlan.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.template.deleteMany({ where: { id: tpl.id } }).catch(() => {});
    }
  });

  // ----------------------------------------------------------------
  // Boundary: duplicate aggregate when RUNNING report exists → 409
  // ----------------------------------------------------------------
  it('should reject: duplicate aggregate analysis when RUNNING (409)', async () => {
    const tpl = await prisma.template.create({
      data: {
        name: 'WF-Dup-Tpl',
        content: JSON.stringify({ invitationPrompt: 'hi', questions: ['q'] }),
        status: 'DRAFT',
      },
    });

    let planId = '';
    try {
      const plan = await prisma.interviewPlan.create({
        data: { name: 'WF-Dup-Plan', templateId: tpl.id, status: 'PENDING' },
      });
      planId = plan.id;

      // Create COMPLETED interview (needed to pass the guard)
      await prisma.interview.create({
        data: {
          userId: 'wf-dup-user',
          templateId: tpl.id,
          planId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Create a RUNNING batch report (simulating in-progress analysis)
      await prisma.batchAnalysisReport.create({
        data: {
          planId,
          templateId: tpl.id,
          type: 'SUMMARY',
          status: 'RUNNING',
          content: '',
          metrics: {},
          topics: {},
          emergents: [],
        },
      });

      // Try to aggregate again → should fail 409
      const res = await analysisApp.inject({
        method: 'POST',
        url: `/api/analysis/aggregate/${planId}`,
      });
      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.existingReportId).toBeDefined();
    } finally {
      await prisma.batchAnalysisReport.deleteMany({ where: { planId } }).catch(() => {});
      await prisma.interview.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.interviewPlan.deleteMany({ where: { templateId: tpl.id } }).catch(() => {});
      await prisma.template.deleteMany({ where: { id: tpl.id } }).catch(() => {});
    }
  });

  // ----------------------------------------------------------------
  // Boundary: report not found for interview without analysis → 404
  // ----------------------------------------------------------------
  it('should return 404 when report does not exist for interview', async () => {
    const res = await analysisApp.inject({
      method: 'GET',
      url: '/api/analysis/report/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Report not found');
  });
});
