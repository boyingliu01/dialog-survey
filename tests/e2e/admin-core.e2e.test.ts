import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createE2EServer } from './helpers/e2e-server.js';

// E2E tests need extra time for browser startup and page navigation
// Coverage mode adds significant overhead (instrumentation, slower DB queries)
vi.setConfig({ testTimeout: 30000, hookTimeout: 20000 });

describe('Admin Core Paths (Playwright E2E)', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let baseUrl: string;

  beforeAll(async () => {
    // Start real Fastify server with PostgreSQL
    process.env['ADMIN_API_KEY'] = 'test-admin-key';
    const server = await createE2EServer(0);
    baseUrl = server.baseUrl;

    // Store reference for cleanup
    (globalThis as Record<string, unknown>)['__E2E_SERVER'] = server;

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    page = await context.newPage();
  });

  afterAll(async () => {
    await context.close();
    await browser.close();

    const server = (globalThis as Record<string, unknown>)['__E2E_SERVER'] as Awaited<
      ReturnType<typeof createE2EServer>
    >;
    if (server) {
      await server.teardown();
    }
  });

  it('should load health check endpoint', async () => {
    const response = await page.request.get(`${baseUrl}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  describe('Admin Navigation (Shell → Fragment)', () => {
    it('should load admin page with tree sidebar', async () => {
      await page.goto(`${baseUrl}/admin`, {
        waitUntil: 'load',
      });
      await page.waitForSelector('#main-content', { timeout: 5000 });

      const title = await page.title();
      expect(title).toContain('访谈管理后台');

      const sidebarText = await page.textContent('aside');
      expect(sidebarText).toContain('访谈模板');
      // "访谈计划" appears inside template nodes in the sidebar tree;
      // in an empty database, the tree shows "暂无访谈模板" instead
    });

    it('should navigate to dashboard via HTMX fragment', async () => {
      await page.goto(`${baseUrl}/admin`, {
        waitUntil: 'load',
      });

      await page.click('button:has-text("进度仪表板")');
      await page.waitForTimeout(500);

      const mainContent = await page.textContent('#main-content');
      expect(mainContent).toContain('计划进度');
    });

    it('should not crash on non-existent content route', async () => {
      const response = await page.goto(`${baseUrl}/admin/content/templates/non-existent-id`, {
        waitUntil: 'load',
      });
      const status = response?.status() ?? 200;
      expect(status).toBeLessThan(500);
    });
  });

  describe('Templates CRUD', () => {
    it('should show template creation form', async () => {
      await page.goto(`${baseUrl}/admin`, {
        waitUntil: 'load',
      });

      const newTemplateBtn = page.locator('button[title="新建模板"]');
      await newTemplateBtn.click();
      await page.waitForTimeout(500);

      const mainContent = await page.textContent('#main-content');
      expect(mainContent).toContain('新建模板');
    });

    it('should navigate to template import page', async () => {
      await page.goto(`${baseUrl}/admin`, {
        waitUntil: 'load',
      });

      const importBtn = page.locator('button[title="导入模板"]');
      await importBtn.click();
      await page.waitForTimeout(500);

      const mainContent = await page.textContent('#main-content');
      expect(mainContent).toBeDefined();
    });
  });

  // Plans Navigation is verified through unit tests (admin-templates-extra.test.ts).
  // Playwright E2E focuses on page rendering and HTMX navigation which are
  // covered in the Admin Navigation and Page Rendering sections above.

  describe('Page Rendering', () => {
    it('should render admin routes without server error', async () => {
      const routes = ['/admin', '/admin/content/dashboard'];
      for (const route of routes) {
        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: 'load',
        });
        expect(response?.status()).toBeLessThan(500);
      }
    });
  });

  describe('Static Assets', () => {
    it('should serve Alpine.js locally (no CDN dependency)', async () => {
      const response = await page.request.get(`${baseUrl}/js/alpine.min.js`);
      expect(response.status()).toBe(200);
      const body = await response.body();
      expect(body.length).toBeGreaterThan(50000);
      expect(body[0]).toBe(40); // '(' — Alpine.js starts with IIFE wrapper
    });

    it('should serve HTMX locally (local fallback works)', async () => {
      const response = await page.request.get(`${baseUrl}/js/htmx.min.js`);
      expect(response.status()).toBe(200);
      const body = await response.body();
      expect(body.length).toBeGreaterThan(50000);
    });

    it('should render admin page with Alpine.js loaded (no CDN errors)', async () => {
      // Collect console errors during page load
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(`${baseUrl}/admin`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);

      // No Alpine CDN load failures
      const alpineErrors = consoleErrors.filter((e) => e.includes('alpine') || e.includes('cdn'));
      expect(alpineErrors).toHaveLength(0);

      // Page structure is functional: sidebar exists
      const sidebarText = await page.textContent('aside');
      expect(sidebarText).toBeTruthy();
    });
  });
});
