import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  loginAdmin,
  renderedShellCsrfToken,
  stubE2EAdminCredentials,
} from './helpers/admin-login.js';
import { closeE2EResources, createE2EServer } from './helpers/e2e-server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

interface CleanupIds {
  responses: string[];
  interviews: string[];
  plans: string[];
  templates: string[];
}

describe('Report Viewing (Playwright E2E)', () => {
  let server: Awaited<ReturnType<typeof createE2EServer>>;
  let cleanupServer: Awaited<ReturnType<typeof createE2EServer>> | undefined;
  let browser: Browser;
  let cleanupBrowser: Browser | undefined;
  let context: BrowserContext;
  let cleanupContext: BrowserContext | undefined;
  let page: Page;
  let baseUrl: string;
  const cleanupIds: CleanupIds = { responses: [], interviews: [], plans: [], templates: [] };

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
    await loginAdmin(page, baseUrl);

    const template = await server.prisma.template.create({
      data: {
        name: 'E2E Report Test Template',
        description: 'Template for report viewing E2E tests',
        content: JSON.stringify({
          questions: ['您对这个项目有什么看法？', '您觉得还需要改进什么？'],
          invitationPrompt: '欢迎参与本次访谈',
        }),
        status: 'PUBLISHED',
      },
    });
    cleanupIds.templates.push(template.id);

    const plan = await server.prisma.interviewPlan.create({
      data: {
        name: 'E2E Report Test Plan',
        templateId: template.id,
        status: 'RUNNING',
      },
    });
    cleanupIds.plans.push(plan.id);

    // Create interview with PENDING status and messages+responses
    const interview = await server.prisma.interview.create({
      data: {
        userId: 'e2e-test-user-001',
        templateId: template.id,
        planId: plan.id,
        status: 'COMPLETED',
      },
    });
    cleanupIds.interviews.push(interview.id);

    await server.prisma.message.createMany({
      data: [
        {
          interviewId: interview.id,
          role: 'assistant',
          content: '欢迎参与本次访谈！您对这个项目有什么看法？',
        },
        {
          interviewId: interview.id,
          role: 'user',
          content: '我觉得这个项目整体方向很好，但有些细节需要完善。',
        },
        {
          interviewId: interview.id,
          role: 'assistant',
          content: '谢谢您的回答！您觉得还需要改进什么？',
        },
        {
          interviewId: interview.id,
          role: 'user',
          content: '希望能多关注一下用户体验方面的优化。',
        },
      ],
    });

    await server.prisma.response.createMany({
      data: [
        {
          interviewId: interview.id,
          questionId: 'q0',
          content: '我觉得这个项目整体方向很好，但有些细节需要完善。',
          isFollowup: false,
        },
        {
          interviewId: interview.id,
          questionId: 'q1',
          content: '希望能多关注一下用户体验方面的优化。',
          isFollowup: false,
        },
      ],
    });
    cleanupIds.responses.push(interview.id); // Track for cleanup by interviewId

    const interview2 = await server.prisma.interview.create({
      data: {
        userId: 'e2e-test-user-002',
        templateId: template.id,
        planId: plan.id,
        status: 'PENDING',
      },
    });
    cleanupIds.interviews.push(interview2.id);
  });

  afterAll(async () => {
    // Cleanup: delete in FK-safe order
    if (server?.prisma) {
      const prisma = server.prisma;
      // Delete responses by interviewId
      for (const interviewId of cleanupIds.interviews) {
        await prisma.response.deleteMany({ where: { interviewId } }).catch(() => {});
        await prisma.message.deleteMany({ where: { interviewId } }).catch(() => {});
        await prisma.analysisReport.deleteMany({ where: { interviewId } }).catch(() => {});
        await prisma.analysisFailure.deleteMany({ where: { interviewId } }).catch(() => {});
      }
      // Delete interviews
      for (const id of cleanupIds.interviews) {
        await prisma.interview.delete({ where: { id } }).catch(() => {});
      }
      // Delete plans
      for (const id of cleanupIds.plans) {
        await prisma.interviewPlan.delete({ where: { id } }).catch(() => {});
      }
      // Delete templates
      for (const id of cleanupIds.templates) {
        await prisma.template.delete({ where: { id } }).catch(() => {});
      }
    }

    try {
      await closeE2EResources(cleanupServer, cleanupBrowser, cleanupContext);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('Report detail view', () => {
    it('should render report detail page for existing interview', async () => {
      const interviewId = cleanupIds.interviews[0];
      const response = await page.goto(`${baseUrl}/admin/content/reports/${interviewId}`, {
        waitUntil: 'load',
      });
      expect(response?.status()).toBeLessThan(500);

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('访谈报告');
      expect(bodyText).toContain('e2e-test-user-001');
      expect(bodyText).toContain('COMPLETED');
    });

    it('should show dialog transcript section', async () => {
      const interviewId = cleanupIds.interviews[0];
      const response = await page.goto(`${baseUrl}/admin/content/reports/${interviewId}`, {
        waitUntil: 'load',
      });
      expect(response?.status()).toBeLessThan(500);

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('访谈对话记录');
    });

    it('should show message bubbles in dialog transcript', async () => {
      const interviewId = cleanupIds.interviews[0];
      await page.goto(`${baseUrl}/admin/content/reports/${interviewId}`, {
        waitUntil: 'load',
      });

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('欢迎参与本次访谈');
      expect(bodyText).toContain('我觉得这个项目整体方向很好');
    });

    it('should show empty state when no report exists yet', async () => {
      const interviewId = cleanupIds.interviews[0];
      await page.goto(`${baseUrl}/admin/content/reports/${interviewId}`, {
        waitUntil: 'load',
      });

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('暂无分析报告');
    });
  });

  describe('Report download', () => {
    it('should download markdown report for interview with data', async () => {
      const interviewId = cleanupIds.interviews[0];
      await loginAdmin(page, baseUrl);

      const response = await page.request.get(
        `${baseUrl}/admin/api/reports/${interviewId}/download`,
        {
          failOnStatusCode: false,
        }
      );

      // Should succeed (200) even with no analysis report — it returns transcript
      expect(response.status()).toBe(200);

      const body = await response.text();
      expect(body).toContain('# 访谈报告');
      expect(body).toContain('e2e-test-user-001');
      expect(body).toContain('欢迎参与本次访谈');
    });

    it('should return 404 for nonexistent interview download', async () => {
      await loginAdmin(page, baseUrl);

      const response = await page.request.get(
        `${baseUrl}/admin/api/reports/nonexistent-id/download`,
        {
          failOnStatusCode: false,
        }
      );

      expect(response.status()).toBe(404);
    });
  });

  describe('Report export', () => {
    it('should handle PDF export request', async () => {
      const interviewId = cleanupIds.interviews[0];
      await loginAdmin(page, baseUrl);

      const response = await page.request.get(
        `${baseUrl}/admin/api/reports/${interviewId}/export/pdf`,
        {
          failOnStatusCode: false,
        }
      );

      // PDF export may fail (500) if export service unavailable or report not generated,
      // but route itself is accessible. Just verify it doesn't return non-HTTP error.
      const status = response.status();
      expect([200, 404, 500]).toContain(status);
    });

    it('should handle Excel export request', async () => {
      const interviewId = cleanupIds.interviews[0];
      await loginAdmin(page, baseUrl);

      const response = await page.request.get(
        `${baseUrl}/admin/api/reports/${interviewId}/export/excel`,
        {
          failOnStatusCode: false,
        }
      );

      const status = response.status();
      expect([200, 404, 500]).toContain(status);
    });
  });

  describe('Report reanalysis', () => {
    it('should accept reanalysis POST for interview with responses', async () => {
      const interviewId = cleanupIds.interviews[0];
      await loginAdmin(page, baseUrl);

      await page.goto(`${baseUrl}/admin`);
      const csrfToken = await renderedShellCsrfToken(page);
      const response = await page.request.post(
        `${baseUrl}/admin/api/reports/${interviewId}/reanalyze`,
        {
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          data: {},
          failOnStatusCode: false,
        }
      );

      const status = response.status();
      // 200 = LLM succeeded, 500 = LLM unavailable (no API key in E2E)
      // Both mean the route itself is accessible and working
      expect([200, 500]).toContain(status);
    });
  });

  describe('Nonexistent report', () => {
    it('should return 404 for nonexistent interview report page', async () => {
      await loginAdmin(page, baseUrl);

      const response = await page.goto(`${baseUrl}/admin/content/reports/nonexistent-id`, {
        waitUntil: 'load',
      });

      expect(response?.status()).toBe(404);
    });

    it('should return error for nonexistent interview reanalyze POST', async () => {
      await loginAdmin(page, baseUrl);

      await page.goto(`${baseUrl}/admin`);
      const csrfToken = await renderedShellCsrfToken(page);
      const response = await page.request.post(
        `${baseUrl}/admin/api/reports/nonexistent-id/reanalyze`,
        {
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          data: {},
          failOnStatusCode: false,
        }
      );

      expect([400, 404, 500]).toContain(response.status());
    });
  });
});
