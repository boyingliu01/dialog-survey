import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

/**
 * Route-coverage suites for `src/api/admin-templates.ts`.
 *
 * Mutation testing (Gate M) put this file at 39%, and a third of the surviving
 * mutants were `NoCoverage` — the report/download handlers and most admin form
 * routes simply never executed. Each suite below drives one route end to end so
 * that its branches are not only reached but distinguished: the assertions read
 * the rendered body, so a mutant that flips a branch or blanks a literal shows
 * up as a changed string rather than as an equal-shaped response.
 */

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

async function createTestApp() {
  const { default: Fastify } = await import('fastify');
  const { resolve } = await import('node:path');
  const { default: fastifyStatic } = await import('@fastify/static');
  const { default: fastifyView } = await import('@fastify/view');
  const { default: nunjucks } = await import('nunjucks');

  const viewsDir = resolve(import.meta.dirname, '..', 'src', 'views');
  const app = Fastify({ logger: false });

  await app.register(secureSession, { secret: 'a'.repeat(32), salt: 'b'.repeat(16) });
  await app.register(csrfProtection);
  app.addHook('onRequest', async (request) => {
    if (request.headers['x-admin-key'] === undefined) {
      request.headers['x-admin-key'] = 'test-secret-key';
    }
  });
  await app.register(fastifyStatic, { root: resolve(import.meta.dirname, '..', 'public') });
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
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        });
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
      const params = new URLSearchParams(body);
      const result: Record<string, unknown> = {};
      for (const [key, value] of params) {
        const bracket = key.match(/^(\w+)\[(\d+)\]\[(\w+)\]$/);
        if (!bracket) {
          result[key] = value;
          continue;
        }
        const [, parent, idx, prop] = bracket;
        const arr = (result[parent] as Array<Record<string, string>>) || [];
        const numIdx = Number(idx);
        if (!arr[numIdx]) arr[numIdx] = {};
        arr[numIdx][prop] = value;
        result[parent] = arr;
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
  const { InterviewPlanRepository } = await import(
    '../src/repositories/interview-plan.repository.js'
  );
  const { AnalysisService } = await import('../src/services/analysis.service.js');
  const { AnalyticsService } = await import('../src/services/analytics.service.js');
  const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
  const { TemplateDimensionService } = await import(
    '../src/services/template-dimension.service.js'
  );

  await app.register(adminTemplatesRoutes, {
    templateRepo: new TemplateRepository(prisma),
    interviewPlanService: new InterviewPlanService(prisma),
    interviewRepo: new InterviewRepository(prisma),
    interviewPlanRepo: new InterviewPlanRepository(prisma),
    analysisService: new AnalysisService(prisma),
    analyticsService: new AnalyticsService(prisma),
    templateDimensionService: new TemplateDimensionService(prisma),
  });

  return app;
}

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
});

interface Fixtures {
  app: Awaited<ReturnType<typeof createTestApp>>;
  templateId: string;
  planId: string;
  interviewId: string;
}

describe('admin-templates route coverage', () => {
  const fx = {} as Fixtures;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv('ADMIN_API_KEY', 'test-secret-key');
    fx.app = await createTestApp();
    await prisma.$connect();

    const template = await prisma.template.create({
      data: {
        name: 'Coverage Template',
        content: JSON.stringify({
          invitationPrompt: 'welcome',
          dimensions: [{ id: 'd1', label: '维度一' }],
          questions: ['第一个问题', '第二个问题'],
        }),
        status: 'PUBLISHED',
      },
    });
    fx.templateId = template.id;

    const plan = await prisma.interviewPlan.create({
      data: {
        name: 'Coverage Plan',
        templateId: template.id,
        status: 'COMPLETED',
        inviteeData: [
          { userId: 'cov-user-1', name: '张三', phone: '13800000001' },
          { userId: 'cov-user-2', name: '李四' },
        ],
      },
    });
    fx.planId = plan.id;

    const interview = await prisma.interview.create({
      data: {
        userId: 'cov-user-1',
        templateId: template.id,
        planId: plan.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-01-02T03:04:05Z'),
        messages: {
          create: [
            { role: 'assistant', content: '你好，请介绍一下自己' },
            { role: 'user', content: '我叫张三' },
          ],
        },
      },
    });
    fx.interviewId = interview.id;

    await prisma.analysisReport.create({
      data: {
        interviewId: interview.id,
        content: '总体表现良好',
        sentiment: 'positive',
        keyFindings: ['表达清晰', '逻辑完整'],
        recommendations: ['可以更具体'],
      },
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await fx.app?.close();
  });

  describe('GET /admin/api/reports/:interviewId/download', () => {
    it('renders the header, the transcript and the analysis section', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${fx.interviewId}/download`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="interview-report-${fx.interviewId}.md"`
      );

      const body = res.body;
      // Header block: the invitee name and phone come from inviteeData, matched
      // on userId — a second entry exists to prove the match is not positional.
      expect(body).toContain('# 访谈报告');
      expect(body).toContain('- **用户**: cov-user-1');
      expect(body).toContain('- **姓名**: 张三');
      expect(body).toContain('- **电话**: 13800000001');
      expect(body).toContain('- **状态**: COMPLETED');
      // Transcript: roles are labelled by side, not echoed verbatim.
      expect(body).toContain('**🤖 机器人**：');
      expect(body).toContain('你好，请介绍一下自己');
      expect(body).toContain('**👤 受访者**：');
      expect(body).toContain('我叫张三');
      // Analysis: sentiment is mapped to its label, findings and recommendations
      // become bullet lists.
      expect(body).toContain('## 访谈分析总结');
      expect(body).toContain('总体表现良好');
      expect(body).toContain('**情感分析**: 积极');
      expect(body).toContain('**关键发现**：');
      expect(body).toContain('- 表达清晰');
      expect(body).toContain('- 逻辑完整');
      expect(body).toContain('**建议**：');
      expect(body).toContain('- 可以更具体');
    });

    it('returns 404 for an unknown interview', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/api/reports/does-not-exist/download',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe('Interview not found');
    });

    it('omits the analysis section entirely when no report exists yet', async () => {
      const interview = await prisma.interview.create({
        data: {
          userId: 'no-report-user',
          templateId: fx.templateId,
          status: 'COMPLETED',
          messages: {
            create: [{ role: 'user', content: '只有对话' }],
          },
        },
      });

      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${interview.id}/download`,
      });

      expect(res.statusCode).toBe(200);
      // The transcript is still there, but the analysis heading is not: a report
      // that does not exist must not render as an empty analysis section.
      expect(res.body).toContain('只有对话');
      expect(res.body).not.toContain('## 访谈分析总结');
    });

    it('prints an unmapped sentiment verbatim instead of dropping it', async () => {
      const interview = await prisma.interview.create({
        data: {
          userId: 'odd-sentiment-user',
          templateId: fx.templateId,
          status: 'COMPLETED',
          messages: { create: [{ role: 'user', content: 'hi' }] },
        },
      });
      await prisma.analysisReport.create({
        data: {
          interviewId: interview.id,
          content: '分析正文',
          sentiment: 'mixed',
        },
      });

      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${interview.id}/download`,
      });

      expect(res.statusCode).toBe(200);
      // `mixed` is not in SENTIMENT_LABELS, so the raw value is shown rather than
      // `undefined` — that fallback is the branch under test.
      expect(res.body).toContain('**情感分析**: mixed');
      expect(res.body).not.toContain('undefined');
    });

    it('omits name and phone when the user is not in the invitee list', async () => {
      const interview = await prisma.interview.create({
        data: {
          userId: 'not-an-invitee',
          templateId: fx.templateId,
          planId: fx.planId,
          status: 'COMPLETED',
          messages: { create: [{ role: 'user', content: 'hi' }] },
        },
      });

      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${interview.id}/download`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('- **用户**: not-an-invitee');
      // The plan has invitees, but none of them is this user: no partial match.
      expect(res.body).not.toContain('- **姓名**:');
      expect(res.body).not.toContain('- **电话**:');
    });

    it('skips the invitee lookup when the interview has no plan', async () => {
      const interview = await prisma.interview.create({
        data: {
          userId: 'planless-user',
          templateId: fx.templateId,
          status: 'COMPLETED',
          messages: { create: [{ role: 'user', content: 'hi' }] },
        },
      });

      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${interview.id}/download`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('- **用户**: planless-user');
      expect(res.body).not.toContain('- **姓名**:');
    });
  });

  describe('GET /admin/content/reports/:interviewId', () => {
    it('renders the detail view for a known interview', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/reports/${fx.interviewId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('cov-user-1');
    });

    it('returns 404 with a Chinese message for an unknown interview', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/content/reports/nope',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe('访谈不存在');
    });
  });

  describe('GET /admin/api/templates/:id/usage', () => {
    it('returns the usage stats for a template', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/templates/${fx.templateId}/usage`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeDefined();
    });
  });

  describe('GET /admin/api/templates/:id/stats', () => {
    it('reports interview and plan counts for the template', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/templates/${fx.templateId}/stats`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        interviews: Record<string, number>;
        plans: Record<string, number>;
        totalInterviews: number;
        totalPlans: number;
      };
      expect(body.totalInterviews).toBeGreaterThanOrEqual(1);
      expect(body.totalPlans).toBeGreaterThanOrEqual(1);
      expect(body.interviews).toBeTypeOf('object');
      expect(body.plans).toBeTypeOf('object');
    });
  });

  describe('POST /admin/api/templates/:id/publish', () => {
    it('publishes a draft template and points HTMX at the detail fragment', async () => {
      const draft = await prisma.template.create({
        data: { name: 'Draft To Publish', content: JSON.stringify({}), status: 'DRAFT' },
      });

      const res = await fx.app.inject({
        method: 'POST',
        url: `/admin/api/templates/${draft.id}/publish`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['hx-get']).toBe(`/admin/content/templates/${draft.id}`);
      expect(res.headers['hx-target']).toBe('#main-content');
      expect(res.body).toContain('已发布');

      const after = await prisma.template.findUnique({ where: { id: draft.id } });
      expect(after?.status).toBe('PUBLISHED');
    });

    it('refuses to publish an already-published template', async () => {
      const res = await fx.app.inject({
        method: 'POST',
        url: `/admin/api/templates/${fx.templateId}/publish`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('模板已发布');
    });

    it('returns 404 for an unknown template', async () => {
      const res = await fx.app.inject({
        method: 'POST',
        url: '/admin/api/templates/no-such-template/publish',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('模板不存在');
    });
  });

  describe('GET /admin/content/templates/:id/edit', () => {
    it('prefills the form with the stored questions', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/templates/${fx.templateId}/edit`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('第一个问题');
      expect(res.body).toContain('第二个问题');
    });

    it('returns 404 for an unknown template', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/content/templates/no-such/edit',
      });
      expect(res.statusCode).toBe(404);
    });

    it('falls back to an empty form when the stored content is not JSON', async () => {
      const broken = await prisma.template.create({
        data: { name: 'Broken Content', content: 'not-json{', status: 'DRAFT' },
      });
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/templates/${broken.id}/edit`,
      });
      // The parse failure is swallowed, so the form still renders.
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /admin/api/plans/:id', () => {
    it('warns with counts when the plan still has interviews', async () => {
      const res = await fx.app.inject({
        method: 'DELETE',
        url: `/admin/api/plans/${fx.planId}`,
      });
      expect(res.statusCode).toBe(409);
      expect(res.body).toContain('data-delete-warning="true"');
      expect(res.body).toContain('该计划关联了');
    });

    it('deletes the plan and its interviews when forced', async () => {
      const plan = await prisma.interviewPlan.create({
        data: {
          name: 'Force Delete Plan',
          templateId: fx.templateId,
          status: 'PENDING',
        },
      });
      const interview = await prisma.interview.create({
        data: {
          userId: 'force-del-user',
          templateId: fx.templateId,
          planId: plan.id,
          status: 'COMPLETED',
        },
      });

      const res = await fx.app.inject({
        method: 'DELETE',
        url: `/admin/api/plans/${plan.id}?force=true`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('已删除');
      expect(res.body).toContain('Force Delete Plan');

      expect(await prisma.interviewPlan.findUnique({ where: { id: plan.id } })).toBeNull();
      expect(await prisma.interview.findUnique({ where: { id: interview.id } })).toBeNull();
    });

    it('deletes a plan that has no interviews without forcing', async () => {
      const plan = await prisma.interviewPlan.create({
        data: { name: 'Clean Plan', templateId: fx.templateId, status: 'PENDING' },
      });
      const res = await fx.app.inject({ method: 'DELETE', url: `/admin/api/plans/${plan.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('计划已删除');
      expect(await prisma.interviewPlan.findUnique({ where: { id: plan.id } })).toBeNull();
    });

    it('returns 404 for an unknown plan', async () => {
      const res = await fx.app.inject({
        method: 'DELETE',
        url: '/admin/api/plans/no-such-plan',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('计划不存在');
    });
  });

  describe('report export endpoints without an export service', () => {
    // The suite registers no exportService, which is the production shape when
    // PDF/Excel support is disabled (no Playwright). Both routes must say so
    // instead of throwing.
    it('PDF export reports unavailability', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${fx.interviewId}/export/pdf`,
      });
      expect(res.statusCode).toBe(500);
      expect(res.body).toBe('PDF export not available');
    });

    it('Excel export reports unavailability', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/api/reports/${fx.interviewId}/export/excel`,
      });
      expect(res.statusCode).toBe(500);
      expect(res.body).toBe('Excel export not available');
    });
  });

  describe('GET /admin/api/analytics/data', () => {
    it('returns the four analytics blocks under a success envelope', async () => {
      const res = await fx.app.inject({ method: 'GET', url: '/admin/api/analytics/data' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        success: boolean;
        data: Record<string, unknown>;
      };
      expect(body.success).toBe(true);
      // All four blocks are present, even when the underlying tables are sparse.
      expect(Object.keys(body.data).sort()).toEqual([
        'kpis',
        'planCompletionRates',
        'statusDistribution',
        'weeklyTrend',
      ]);
    });
  });

  describe('GET /admin/content/dashboard', () => {
    it('renders the dashboard fragment', async () => {
      const res = await fx.app.inject({ method: 'GET', url: '/admin/content/dashboard' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /admin/content/templates/new and /import', () => {
    it('renders the blank create form', async () => {
      const res = await fx.app.inject({ method: 'GET', url: '/admin/content/templates/new' });
      expect(res.statusCode).toBe(200);
    });

    it('renders the import form', async () => {
      const res = await fx.app.inject({ method: 'GET', url: '/admin/content/templates/import' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /admin/content/plans/new and /:id/edit', () => {
    it('renders the blank plan form', async () => {
      const res = await fx.app.inject({ method: 'GET', url: '/admin/content/plans/new' });
      expect(res.statusCode).toBe(200);
    });

    it('renders the edit form for a known plan', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/plans/${fx.planId}/edit`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for an unknown plan edit', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/content/plans/no-such-plan/edit',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /admin/content/plans/:id and /all-interviews', () => {
    it('renders the plan detail fragment', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/plans/${fx.planId}`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('renders the all-interviews fragment', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/plans/${fx.planId}/all-interviews`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for an unknown plan detail', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/content/plans/missing-plan',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /admin/content/templates/:id', () => {
    it('renders the template detail fragment', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: `/admin/content/templates/${fx.templateId}`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for an unknown template', async () => {
      const res = await fx.app.inject({
        method: 'GET',
        url: '/admin/content/templates/missing-template',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /admin/api/templates — structured questions', () => {
    it('accepts a nested questions object and stores trimmed question text', async () => {
      // The two form shapes the admin UI can POST: `questions[0][text]=...` flat
      // keys, and a nested `questions` object. This covers the object branch of
      // buildDefaultContent, which sorts by key and drops blank questions. The
      // JSON `content` shortcut is bypassed here on purpose, so the form builder
      // is what runs.
      const res = await fx.app.inject({
        method: 'POST',
        url: '/admin/api/templates',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          name: '结构化模板',
          invitationPrompt: '请参加访谈',
          closingMessage: '感谢参与',
          llmPromptTemplate: '你是访谈员',
          questions: {
            b: { text: '  第二问  ' },
            a: { text: '第一问' },
            c: { text: '   ' },
          },
        }),
      });

      expect(res.statusCode).toBe(201);

      const created = await prisma.template.findFirst({ where: { name: '结构化模板' } });
      expect(created).not.toBeNull();
      const content = JSON.parse(created?.content ?? '{}') as Record<string, unknown>;
      // Sorted by key, blanks dropped, whitespace trimmed.
      expect(content['questions']).toEqual(['第一问', '第二问']);
      expect(content['closingMessage']).toBe('感谢参与');
      expect(content['llmPromptTemplate']).toBe('你是访谈员');
    });

    it('accepts flat questions[n][text] keys and keeps their order', async () => {
      const res = await fx.app.inject({
        method: 'POST',
        url: '/admin/api/templates',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          name: '扁平模板',
          invitationPrompt: '请参加访谈',
          'questions[0][text]': ' 甲 ',
          'questions[1][text]': '乙',
          'questions[2][text]': '   ',
        }),
      });

      expect(res.statusCode).toBe(201);

      const created = await prisma.template.findFirst({ where: { name: '扁平模板' } });
      const content = JSON.parse(created?.content ?? '{}') as Record<string, unknown>;
      // Indexed into position, blanks dropped, order preserved (not sorted).
      expect(content['questions']).toEqual(['甲', '乙']);
    });

    it('rejects a template with no questions', async () => {
      const res = await fx.app.inject({
        method: 'POST',
        url: '/admin/api/templates',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          name: '空模板',
          content: { invitationPrompt: '请参加访谈', questions: [] },
        }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('请至少添加一个问题');
    });

    it('rejects a template with no invitation prompt', async () => {
      const res = await fx.app.inject({
        method: 'POST',
        url: '/admin/api/templates',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          name: '无邀约',
          content: { invitationPrompt: '', questions: ['q'] },
        }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('请填写邀约提示词');
    });
  });

  describe('PUT /admin/api/templates/:id', () => {
    function form(overrides: Record<string, string> = {}): string {
      const params = new URLSearchParams({
        name: 'Updated Name',
        description: 'updated',
        invitationPrompt: '欢迎参加访谈',
        'questions[0][text]': '第一问',
        'questions[1][text]': '第二问',
        ...overrides,
      });
      return params.toString();
    }

    it('rejects a missing version with 422 and a stable message', async () => {
      const res = await fx.app.inject({
        method: 'PUT',
        url: `/admin/api/templates/${fx.templateId}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form(),
      });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('Version number is required');
    });

    it('rejects content that fails validation', async () => {
      const res = await fx.app.inject({
        method: 'PUT',
        url: `/admin/api/templates/${fx.templateId}?version=1`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        // An empty invitation prompt is the second validation rule.
        payload: form({ invitationPrompt: '   ' }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('请填写邀约提示词');
    });

    it('saves a valid update at the current version', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Editable',
          content: JSON.stringify({ questions: ['旧问题'] }),
          status: 'DRAFT',
        },
      });

      const res = await fx.app.inject({
        method: 'PUT',
        url: `/admin/api/templates/${template.id}?version=1`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({ name: 'Renamed' }),
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('保存成功');

      const updated = await prisma.template.findUnique({ where: { id: template.id } });
      expect(updated?.name).toBe('Renamed');
      expect(updated?.version).toBe(2);
    });

    it('reports a conflict when the version is stale', async () => {
      const template = await prisma.template.create({
        data: {
          name: 'Conflicting',
          content: JSON.stringify({ questions: ['q'] }),
          status: 'DRAFT',
        },
      });
      // Bump the row so the request's version is behind.
      await prisma.template.update({
        where: { id: template.id },
        data: { version: 5 },
      });

      const res = await fx.app.inject({
        method: 'PUT',
        url: `/admin/api/templates/${template.id}?version=1`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({ name: 'Loser' }),
      });

      expect(res.statusCode).toBe(409);
      expect(res.body).toContain('模板已被他人修改');
    });
  });

  describe('DELETE /admin/api/templates/:id', () => {
    it('deletes a draft template with no interviews', async () => {
      const template = await prisma.template.create({
        data: { name: 'Deletable', content: JSON.stringify({ questions: ['q'] }), status: 'DRAFT' },
      });

      const res = await fx.app.inject({
        method: 'DELETE',
        url: `/admin/api/templates/${template.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('模板已删除');
      expect(await prisma.template.findUnique({ where: { id: template.id } })).toBeNull();
    });

    it('refuses to delete a template that still has plans', async () => {
      // fx.templateId is referenced by fx.planId.
      const res = await fx.app.inject({
        method: 'DELETE',
        url: `/admin/api/templates/${fx.templateId}`,
      });
      expect(res.statusCode).toBe(409);
      expect(await prisma.template.findUnique({ where: { id: fx.templateId } })).not.toBeNull();
    });

    it('returns 404 for an unknown template', async () => {
      const res = await fx.app.inject({
        method: 'DELETE',
        url: '/admin/api/templates/nope',
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).toContain('Template not found');
    });
  });
});
