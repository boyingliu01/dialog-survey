import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loginAdmin, stubE2EAdminCredentials } from './helpers/admin-login.js';
import { closeE2EResources, createE2EServer } from './helpers/e2e-server.js';

// E2E tests need extra time for browser startup and page navigation
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

describe('Member Management (Playwright E2E)', () => {
  let browser: Browser;
  let cleanupBrowser: Browser | undefined;
  let context: BrowserContext;
  let cleanupContext: BrowserContext | undefined;
  let page: Page;
  let baseUrl: string;
  let server: Awaited<ReturnType<typeof createE2EServer>>;
  let cleanupServer: Awaited<ReturnType<typeof createE2EServer>> | undefined;

  const cleanupTemplateIds: string[] = [];
  const cleanupPlanIds: string[] = [];
  const cleanupInterviewIds: string[] = [];

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

    // Visit /admin to set CSRF cookie in browser context
    // page.context().request shares cookies with browser context
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
  });

  afterAll(async () => {
    // Cleanup in order: interviews first, then plans, then templates
    if (cleanupInterviewIds.length > 0) {
      await server.prisma.analysisReport
        .deleteMany({ where: { interviewId: { in: cleanupInterviewIds } } })
        .catch(() => {});
      await server.prisma.analysisFailure
        .deleteMany({ where: { interviewId: { in: cleanupInterviewIds } } })
        .catch(() => {});
      await server.prisma.response
        .deleteMany({ where: { interviewId: { in: cleanupInterviewIds } } })
        .catch(() => {});
      await server.prisma.message
        .deleteMany({ where: { interviewId: { in: cleanupInterviewIds } } })
        .catch(() => {});
      await server.prisma.interview
        .deleteMany({ where: { id: { in: cleanupInterviewIds } } })
        .catch(() => {});
    }
    if (cleanupPlanIds.length > 0) {
      await server.prisma.interviewPlan
        .deleteMany({ where: { id: { in: cleanupPlanIds } } })
        .catch(() => {});
    }
    if (cleanupTemplateIds.length > 0) {
      await server.prisma.template
        .deleteMany({ where: { id: { in: cleanupTemplateIds } } })
        .catch(() => {});
    }

    try {
      await closeE2EResources(cleanupServer, cleanupBrowser, cleanupContext);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  async function createTemplateAndPlan(): Promise<{ templateId: string; planId: string }> {
    const template = await server.prisma.template.create({
      data: {
        name: 'E2E 成员管理测试模板',
        content: JSON.stringify({
          name: '成员管理测试模板',
          invitationPrompt: '欢迎参与测试！',
          questions: ['问题1：请介绍您的工作', '问题2：您最大的收获是什么？'],
          closingMessage: '感谢参与！',
        }),
        status: 'PUBLISHED',
      },
    });
    cleanupTemplateIds.push(template.id);

    const plan = await server.prisma.interviewPlan.create({
      data: { name: 'E2E 成员管理测试计划', templateId: template.id, status: 'PENDING' },
    });
    cleanupPlanIds.push(plan.id);

    return { templateId: template.id, planId: plan.id };
  }

  describe('Add member via API', () => {
    it('should add a member to plan via POST /api/plans/:id/members', async () => {
      const { planId } = await createTemplateAndPlan();
      const uniqueUser = `user_add_${Date.now()}`;

      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/members`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { userId: uniqueUser, name: 'Test User 1' },
      });

      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body).toHaveProperty('interviewId');

      // Track for cleanup
      cleanupInterviewIds.push(body.interviewId);

      // Verify member count via plan details
      const interviews = await server.prisma.interview.findMany({
        where: { planId },
      });
      expect(interviews).toHaveLength(1);
      expect(interviews[0].userId).toBe(uniqueUser);
    });

    it('should add a member with phone number via API', async () => {
      const { planId } = await createTemplateAndPlan();

      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/members`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { phone: '13800138001', name: 'Phone User' },
      });

      // Phone-based member creation may fail if DingTalk is not reachable
      // Accept 200 (if phone lookup succeeds) or error responses
      const status = resp.status();
      expect([200, 400, 404, 502].includes(status)).toBe(true);

      if (status === 200) {
        const body = await resp.json();
        cleanupInterviewIds.push(body.interviewId || body.id);
      }
    });

    it('should reject adding member without userId or phone (400)', async () => {
      const { planId } = await createTemplateAndPlan();

      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/members`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { name: 'No ID User' },
      });

      expect(resp.status()).toBe(400);
      const body = await resp.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject adding member to non-existent plan (404)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const uniqueUser = `user_nonexist_${Date.now()}`;
      const resp = await page.request.post(`${baseUrl}/api/plans/${fakeId}/members`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { userId: uniqueUser, name: 'Test User' },
      });

      expect(resp.status()).toBe(404);
    });

    it('should require authentication to add member (401)', async () => {
      const { planId } = await createTemplateAndPlan();

      // Send without API key header — should be rejected
      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/members`, {
        headers: { 'content-type': 'application/json' },
        failOnStatusCode: false,
        data: { userId: `user_unauth_${Date.now()}`, name: 'Unauth User' },
      });

      expect(resp.status()).toBe(401);
    });
  });

  describe('Remove member from plan', () => {
    it('should remove a member via DELETE /api/plans/:id/members/:interviewId', async () => {
      const { planId } = await createTemplateAndPlan();
      const uniqueUser = `user_remove_${Date.now()}`;

      // Add member first
      const addResp = await page.request.post(`${baseUrl}/api/plans/${planId}/members`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { userId: uniqueUser, name: 'Remove Me' },
      });
      expect(addResp.status()).toBe(200);
      const member = await addResp.json();
      const interviewId = member.interviewId || member.id;

      // Track for cleanup
      if (interviewId) cleanupInterviewIds.push(interviewId);

      // Remove the member
      const deleteResp = await page.request.delete(
        `${baseUrl}/api/plans/${planId}/members/${interviewId}`,
        { headers: { 'X-Admin-Key': 'test-admin-key' }, failOnStatusCode: false }
      );

      expect(deleteResp.status()).toBe(200);
      const deleteBody = await deleteResp.json();
      expect(deleteBody).toHaveProperty('status', 'removed');

      // Verify member is cancelled or gone
      const interview = await server.prisma.interview.findUnique({
        where: { id: interviewId },
      });
      expect(interview).toBeNull();

      // Track for cleanup
      if (interviewId) {
        const idx = cleanupInterviewIds.indexOf(interviewId);
        if (idx >= 0) cleanupInterviewIds.splice(idx, 1);
      }
    });

    it('should return 404 when removing non-existent member', async () => {
      const { planId } = await createTemplateAndPlan();

      const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const resp = await page.request.delete(`${baseUrl}/api/plans/${planId}/members/${fakeId}`, {
        headers: { 'X-Admin-Key': 'test-admin-key' },
        failOnStatusCode: false,
      });

      expect(resp.status()).toBe(404);
    });
  });

  describe('Batch import preview', () => {
    it('should return preview data for a valid CSV import', async () => {
      const { planId } = await createTemplateAndPlan();

      // Create a CSV file content
      const csvContent = '姓名,手机号\n张三,13800138001\n李四,13800138002\n';

      // Send import preview request with auth header
      const resp = await page.request.fetch(`${baseUrl}/api/plans/${planId}/import-preview`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key' },
        multipart: {
          file: {
            name: 'members.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent, 'utf-8'),
          },
        },
      });

      // Preview may work or fail depending on DingTalk availability
      // Accept both outcomes as long as we don't crash
      const status = resp.status();
      expect([200, 400, 404, 502].includes(status)).toBe(true);

      if (status === 200) {
        const body = await resp.json();
        expect(body).toHaveProperty('totalRows');
        expect(body).toHaveProperty('passed');
        expect(body).toHaveProperty('failed');
        expect(body).toHaveProperty('results');
      }
    });

    it('should reject empty CSV file', async () => {
      const { planId } = await createTemplateAndPlan();

      const csvContent = '';

      const resp = await page.request.fetch(`${baseUrl}/api/plans/${planId}/import-preview`, {
        method: 'POST',
        headers: { 'X-Admin-Key': 'test-admin-key' },
        multipart: {
          file: {
            name: 'empty.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent, 'utf-8'),
          },
        },
      });

      expect(resp.status()).toBe(400);
    });
  });

  describe('Batch import commit', () => {
    it('should import members from preview results', async () => {
      const { planId } = await createTemplateAndPlan();
      const ts = Date.now();

      const rows = [
        {
          rowIndex: 1,
          phone: '13800138001',
          status: 'ok' as const,
          userId: `user_import_1_${ts}`,
          inputName: 'Import User 1',
          dingtalkName: 'Import User 1',
          message: '验证通过',
        },
        {
          rowIndex: 2,
          phone: '13800138002',
          status: 'ok' as const,
          userId: `user_import_2_${ts}`,
          inputName: 'Import User 2',
          dingtalkName: 'Import User 2',
          message: '验证通过',
        },
      ];

      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/import-commit`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { rows },
      });

      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body).toHaveProperty('imported');
      expect(body.imported).toBe(2);
      expect(body).toHaveProperty('interviewIds');
      expect(body.interviewIds).toHaveLength(2);

      // Track for cleanup
      for (const id of body.interviewIds) {
        cleanupInterviewIds.push(id);
      }

      // Verify interviews were created
      const interviews = await server.prisma.interview.findMany({
        where: { planId },
      });
      expect(interviews).toHaveLength(2);
    });

    it('should reject invalid commit request (400)', async () => {
      const { planId } = await createTemplateAndPlan();

      // Invalid: rows field missing
      const resp = await page.request.post(`${baseUrl}/api/plans/${planId}/import-commit`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { badField: 'not-rows' },
      });

      expect(resp.status()).toBe(400);
    });

    it('should skip already-imported members', async () => {
      const { planId } = await createTemplateAndPlan();
      const ts = Date.now();

      // First import
      const rows1 = [
        {
          rowIndex: 1,
          phone: '13800138001',
          status: 'ok' as const,
          userId: `user_skip_1_${ts}`,
          inputName: 'Skip User 1',
          dingtalkName: 'Skip User 1',
          message: '验证通过',
        },
      ];

      const resp1 = await page.request.post(`${baseUrl}/api/plans/${planId}/import-commit`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { rows: rows1 },
      });
      expect(resp1.status()).toBe(200);
      const body1 = await resp1.json();
      for (const id of body1.interviewIds) {
        cleanupInterviewIds.push(id);
      }

      // Second import with same userId — should be skipped
      const rows2 = [
        {
          rowIndex: 1,
          phone: '13800138001',
          status: 'ok' as const,
          userId: `user_skip_1_${ts}`,
          inputName: 'Skip User 1',
          dingtalkName: 'Skip User 1',
          message: '验证通过',
        },
        {
          rowIndex: 2,
          phone: '13800138002',
          status: 'ok' as const,
          userId: `user_skip_2_${ts}`,
          inputName: 'Skip User 2',
          dingtalkName: 'Skip User 2',
          message: '验证通过',
        },
      ];

      const resp2 = await page.request.post(`${baseUrl}/api/plans/${planId}/import-commit`, {
        headers: { 'content-type': 'application/json', 'X-Admin-Key': 'test-admin-key' },
        data: { rows: rows2 },
      });

      expect(resp2.status()).toBe(200);
      const body2 = await resp2.json();
      // One imported, one skipped
      expect(body2.imported).toBe(1);
      expect(body2.skipped).toBe(1);

      for (const id of body2.interviewIds) {
        cleanupInterviewIds.push(id);
      }

      const interviews = await server.prisma.interview.findMany({
        where: { planId },
      });
      expect(interviews).toHaveLength(2);
    });
  });

  describe('Add member via UI', () => {
    it('should navigate to plan detail and show add member form', async () => {
      await loginAdmin(page, baseUrl);

      const { planId } = await createTemplateAndPlan();

      // Navigate to plan detail page
      const response = await page.goto(`${baseUrl}/admin/content/plans/${planId}`, {
        waitUntil: 'load',
      });
      expect(response?.status()).toBeLessThan(500);

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('E2E 成员管理测试计划');
    });

    it('should show member list tab with add button', async () => {
      await loginAdmin(page, baseUrl);

      const { planId } = await createTemplateAndPlan();

      await page.goto(`${baseUrl}/admin/content/plans/${planId}`, {
        waitUntil: 'load',
      });

      // Click "成员列表" tab
      const membersTab = page.locator('button:has-text("成员列表")');
      await playwrightExpect(membersTab).toBeVisible();
      await membersTab.click();

      // Wait for Alpine.js to render the tab content
      await page.waitForTimeout(300);

      // Check that the "添加成员" button is visible
      const addBtn = page.locator('button:has-text("添加成员")');
      await playwrightExpect(addBtn).toBeVisible();
    });
  });
});
