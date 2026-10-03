import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  E2E_ADMIN_API_KEY,
  loginAdminViaForm,
  renderedShellCsrfToken,
  stubE2EAdminCredentials,
} from './helpers/admin-login.js';
import { closeE2EResources, createE2EServer } from './helpers/e2e-server.js';

// Issue #154 acceptance matrix — one happy-path browser flow per admin page:
//   tree view (/admin)            → admin-core / admin-tree-refresh suites
//   template mgmt (create/edit/…) → admin-template-crud + Template Edit Save below
//   plan mgmt (create/detail/send)→ plan-lifecycle + Plan Create/Edit/Delete below
//   report pages (detail/reanalyze)→ report-viewing + Report Reanalysis Click below
//   batch ops (delete cascade)    → Batch Plan Deletion below
// This file closes the interaction-level gaps that other suites only covered at
// the API level (PUT forms, force-delete dialog, reanalyze button click).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

interface CleanupIds {
  templates: string[];
  plans: string[];
  interviews: string[];
}

describe('Admin UI Coverage Matrix (Playwright E2E, issue #154)', () => {
  let server: Awaited<ReturnType<typeof createE2EServer>>;
  let cleanupServer: Awaited<ReturnType<typeof createE2EServer>> | undefined;
  let browser: Browser;
  let cleanupBrowser: Browser | undefined;
  let context: BrowserContext;
  let cleanupContext: BrowserContext | undefined;
  let page: Page;
  let baseUrl: string;
  const cleanupIds: CleanupIds = { templates: [], plans: [], interviews: [] };

  async function createTemplateViaDb(
    name: string,
    status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED'
  ): Promise<string> {
    const template = await server.prisma.template.create({
      data: {
        name,
        description: `E2E coverage template: ${name}`,
        content: JSON.stringify({
          invitationPrompt: '您好，欢迎参与 E2E 覆盖测试访谈！',
          questions: ['问题一：请介绍您的工作经历', '问题二：您最大的成就是什么？'],
          closingMessage: '感谢参与！',
        }),
        status,
      },
    });
    cleanupIds.templates.push(template.id);
    return template.id;
  }

  async function createPlanViaDb(
    name: string,
    templateId: string,
    status: 'PENDING' | 'RUNNING' = 'PENDING'
  ): Promise<string> {
    const plan = await server.prisma.interviewPlan.create({
      data: { name, templateId, status },
    });
    cleanupIds.plans.push(plan.id);
    return plan.id;
  }

  /** Load the shell and swap a fragment into #main-content via htmx directly. */
  async function openFragment(url: string): Promise<void> {
    // page.evaluate runs in the browser — htmx is loaded by the admin shell.
    await page.evaluate((fragmentUrl: string) => {
      const w = globalThis as unknown as {
        htmx?: { ajax: (verb: string, path: string, opts: Record<string, string>) => void };
      };
      if (!w.htmx) throw new Error('htmx is not loaded on the admin shell');
      w.htmx.ajax('GET', fragmentUrl, { target: '#main-content', swap: 'innerHTML' });
    }, url);
  }

  async function waitForMainText(fragment: string, timeout = 15_000): Promise<void> {
    await vi.waitFor(
      async () => {
        expect(await page.textContent('#main-content')).toContain(fragment);
      },
      { timeout }
    );
  }

  beforeAll(async () => {
    stubE2EAdminCredentials();
    server = await createE2EServer(0);
    cleanupServer = server;
    baseUrl = server.baseUrl;

    browser = await chromium.launch({ headless: true });
    cleanupBrowser = browser;
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
      extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
    });
    cleanupContext = context;
    page = await context.newPage();
    await loginAdminViaForm(page, baseUrl);
  });

  afterAll(async () => {
    if (server?.prisma) {
      const prisma = server.prisma;
      if (cleanupIds.interviews.length > 0) {
        const ids = cleanupIds.interviews;
        await prisma.analysisReport
          .deleteMany({ where: { interviewId: { in: ids } } })
          .catch(() => {});
        await prisma.response.deleteMany({ where: { interviewId: { in: ids } } }).catch(() => {});
        await prisma.message.deleteMany({ where: { interviewId: { in: ids } } }).catch(() => {});
        await prisma.interview.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
      }
      if (cleanupIds.plans.length > 0) {
        // Plans may already be gone (deleted through the UI); deleteMany is safe.
        await prisma.interviewPlan
          .deleteMany({ where: { id: { in: cleanupIds.plans } } })
          .catch(() => {});
      }
      if (cleanupIds.templates.length > 0) {
        await prisma.template
          .deleteMany({ where: { id: { in: cleanupIds.templates } } })
          .catch(() => {});
      }
    }
    try {
      await closeE2EResources(cleanupServer, cleanupBrowser, cleanupContext);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('Template Management — edit save (happy path)', () => {
    it('should update a template through the edit form and bump its version', async () => {
      const templateId = await createTemplateViaDb('E2E-154 编辑保存模板');

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment(`/admin/content/templates/${templateId}/edit`);
      await waitForMainText('编辑模板');

      await page.fill('#name', 'E2E-154 编辑保存模板（已更新）');
      await page.fill('#invitationPrompt', '更新后的邀约提示词，欢迎参与访谈！');

      const putResponsePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/admin/api/templates/${templateId}`) &&
          res.request().method() === 'PUT',
        { timeout: 20_000 }
      );
      await page.click('button#submit-btn');
      const putResponse = await putResponsePromise;
      expect(putResponse.status()).toBe(200);

      // The PUT body carries form fields; verify persistence + optimistic-lock
      // version bump through the API (browser session authenticates the call).
      const apiResp = await page.request.get(`${baseUrl}/api/templates/${templateId}`, {
        headers: { 'X-Admin-Key': E2E_ADMIN_API_KEY },
      });
      expect(apiResp.status()).toBe(200);
      const tpl = (await apiResp.json()) as { name: string; version: number };
      expect(tpl.name).toBe('E2E-154 编辑保存模板（已更新）');
      expect(tpl.version).toBe(2);
    });
  });

  describe('Plan Management — create through the HTMX form', () => {
    it('should create a plan via the plan form and land on its detail page', async () => {
      const templateId = await createTemplateViaDb('E2E-154 计划表单模板');

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment('/admin/content/plans/new');
      await waitForMainText('新建访谈计划');

      await page.selectOption('#templateId', templateId);
      await page.fill('#planName', 'E2E-154 表单创建计划');

      const postResponsePromise = page.waitForResponse(
        (res) => res.url().endsWith('/api/plans') && res.request().method() === 'POST',
        { timeout: 20_000 }
      );
      await page.click('#plan-submit-btn');
      const postResponse = await postResponsePromise;
      expect(postResponse.status()).toBe(200);
      const created = (await postResponse.json()) as { id: string };
      cleanupIds.plans.push(created.id);

      // hx-on::after-request swaps the detail fragment into #main-content, then
      // refreshes the sidebar with htmx.ajax('GET', '/admin', {target:'aside'}).
      // That response is a full shell document: htmx's out-of-band handling
      // re-renders every matching element, so #main-content is replaced by the
      // (empty) shell placeholder — same reason plan-lifecycle reloads after a
      // create. Assert the tree node in the live DOM, then verify the detail
      // page renders by navigating to it directly.
      await vi.waitFor(
        async () => {
          expect(await page.textContent('aside')).toContain('E2E-154 表单创建计划');
        },
        { timeout: 15_000 }
      );
      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment(`/admin/content/plans/${created.id}`);
      await waitForMainText('E2E-154 表单创建计划');
      const detail = await page.textContent('#main-content');
      expect(detail).toContain('待处理');
    });
  });

  describe('Plan Management — edit through the HTMX form', () => {
    it('should rename a plan through the edit form and reload the detail view', async () => {
      const templateId = await createTemplateViaDb('E2E-154 编辑计划模板');
      const planId = await createPlanViaDb('E2E-154 待编辑计划', templateId);

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment(`/admin/content/plans/${planId}/edit`);
      await waitForMainText('编辑访谈计划');

      // The edit form must pre-fill the current name.
      expect(await page.inputValue('#planName')).toBe('E2E-154 待编辑计划');

      await page.fill('#planName', 'E2E-154 已重命名计划');

      const putResponsePromise = page.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === `/api/plans/${planId}` &&
          res.request().method() === 'PUT',
        { timeout: 20_000 }
      );
      await page.click('#plan-submit-btn');
      const putResponse = await putResponsePromise;
      expect(putResponse.status()).toBe(200);

      // isEdit branch re-fetches the detail fragment into #main-content.
      await waitForMainText('E2E-154 已重命名计划');
    });
  });

  describe('Batch Operations — high-risk plan deletion dialog', () => {
    it('should delete a plan with linked interviews through the two-step dialog', async () => {
      const templateId = await createTemplateViaDb('E2E-154 级联删除模板');
      const planId = await createPlanViaDb('E2E-154 级联删除计划', templateId, 'RUNNING');
      const interview = await server.prisma.interview.create({
        data: {
          userId: 'e2e-154-cascade-user',
          templateId,
          planId,
          status: 'PENDING',
        },
      });
      cleanupIds.interviews.push(interview.id);

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment(`/admin/content/plans/${planId}`);
      await waitForMainText('E2E-154 级联删除计划');

      // Step 1: open the dialog and acknowledge the warning.
      await page.click('button:has-text("删除")');
      await page.waitForSelector('text=高风险操作确认', { timeout: 10_000 });
      await page.click('button:has-text("继续")');

      // Step 2: the confirm button stays disabled until the exact phrase is typed.
      const confirmButton = page.locator('button:has-text("确认删除")');
      await playwrightExpect(confirmButton).toBeDisabled();
      await page.fill(
        'input[placeholder="输入确认文字"]',
        '我确认要删除此计划及其关联的所有访谈记录'
      );
      await playwrightExpect(confirmButton).toBeEnabled();

      await Promise.all([
        page.waitForResponse(
          (res) =>
            new URL(res.url()).pathname === `/admin/api/plans/${planId}` &&
            res.request().method() === 'DELETE',
          { timeout: 20_000 }
        ),
        confirmButton.click(),
      ]);

      // executeDelete reloads the page; the plan must be gone everywhere.
      await page.waitForLoadState('load');
      const sidebar = await page.textContent('aside');
      expect(sidebar ?? '').not.toContain('E2E-154 级联删除计划');
      const stillThere = await server.prisma.interviewPlan
        .findUnique({ where: { id: planId } })
        .catch(() => null);
      expect(stillThere).toBeNull();
      const orphanInterview = await server.prisma.interview
        .findUnique({ where: { id: interview.id } })
        .catch(() => null);
      expect(orphanInterview).toBeNull();
    });
  });

  describe('Report Pages — reanalyze button (happy path)', () => {
    it('should regenerate the report when 重新分析 is clicked', async () => {
      const templateId = await createTemplateViaDb('E2E-154 报告模板');
      const planId = await createPlanViaDb('E2E-154 报告计划', templateId, 'RUNNING');
      const interview = await server.prisma.interview.create({
        data: {
          userId: 'e2e-154-report-user',
          templateId,
          planId,
          status: 'COMPLETED',
        },
      });
      cleanupIds.interviews.push(interview.id);
      await server.prisma.message.createMany({
        data: [
          { interviewId: interview.id, role: 'assistant', content: '您对这个项目有什么看法？' },
          { interviewId: interview.id, role: 'user', content: '整体方向很好，细节需要完善。' },
        ],
      });
      await server.prisma.response.create({
        data: {
          interviewId: interview.id,
          questionId: 'q0',
          content: '整体方向很好，细节需要完善。',
          isFollowup: false,
        },
      });

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await openFragment(`/admin/content/reports/${interview.id}`);
      await waitForMainText('访谈对话记录');

      const csrfToken = await renderedShellCsrfToken(page);
      await server.prisma.analysisReport.create({
        data: {
          interviewId: interview.id,
          content: '旧版报告内容',
          sentiment: 'neutral',
          keyFindings: [],
          recommendations: [],
          emergentTags: [],
        },
      });

      // Reload so the fragment renders the (now existing) report with actions.
      await openFragment(`/admin/content/reports/${interview.id}`);
      await waitForMainText('重新分析');

      const reanalyzePromise = page.waitForResponse(
        (res) => res.url().includes(`/admin/api/reports/${interview.id}/reanalyze`),
        { timeout: 30_000 }
      );
      await page.click('#reanalyze-btn');
      const reanalyzeResponse = await reanalyzePromise;
      expect(reanalyzeResponse.status()).toBe(200);
      const body = (await reanalyzeResponse.json()) as { success: boolean; interviewId: string };
      expect(body.success).toBe(true);

      // The no-LLM fallback path must persist a fresh report replacing the old one.
      await vi.waitFor(
        async () => {
          const report = await server.prisma.analysisReport.findFirst({
            where: { interviewId: interview.id },
            orderBy: { createdAt: 'desc' },
          });
          expect(report).not.toBeNull();
          expect(report?.content).not.toBe('旧版报告内容');
        },
        { timeout: 15_000 }
      );

      // The client refreshes the fragment after 500ms; assert the action row again.
      await waitForMainText('重新分析');
      void csrfToken; // token exercised implicitly by every mutation above
    });
  });
});
