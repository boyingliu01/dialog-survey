import { randomUUID } from 'node:crypto';
import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createE2EServer } from './helpers/e2e-server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const TEST_USERNAME = 'e2e-admin';
const TEST_PASSWORD = 'e2e-test-password';
const TEST_API_KEY = 'test-admin-key';
const TEST_PASSWORD_HASH = '$2a$04$/n0nx2VL1x0uOwVndrujnufaskvd7PG9fLC.MsbejxijyJmoALqAG';
const HELPER_ENV_KEYS = [
  'NODE_ENV',
  'SESSION_SECRET',
  'SESSION_SALT',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
] as const;

type E2EServer = Awaited<ReturnType<typeof createE2EServer>>;

type HttpResult = {
  readonly status: number;
  readonly location: string | null;
};

async function renderedToken(page: Page, selector: string): Promise<string> {
  const token = await page.locator(selector).getAttribute('value');
  if (!token) {
    throw new Error(`Rendered CSRF token missing from ${selector}`);
  }
  return token;
}

async function shellToken(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) {
    throw new Error('Rendered CSRF token missing from authenticated shell');
  }
  return token;
}

async function login(page: Page, baseUrl: string): Promise<HttpResult> {
  const token = await renderedToken(page, 'input[name="_csrf"]');
  const response = await page.context().request.post(`${baseUrl}/admin/login`, {
    form: { username: TEST_USERNAME, password: TEST_PASSWORD, _csrf: token },
    maxRedirects: 0,
  });
  return {
    status: response.status(),
    location: response.headers()['location'] ?? null,
  };
}

describe('Admin Auth (Playwright E2E)', () => {
  let server: E2EServer | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let setupError: unknown;
  const templateMarkers: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('ADMIN_USERNAME', TEST_USERNAME);
    vi.stubEnv('ADMIN_PASSWORD_HASH', TEST_PASSWORD_HASH);
    vi.stubEnv('ADMIN_API_KEY', TEST_API_KEY);
    try {
      server = await createE2EServer();
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
      });
      page = await context.newPage();
    } catch (error) {
      setupError = error;
      throw error;
    }
  });

  beforeEach(async () => {
    if (!context) {
      throw new Error('Browser context was not created');
    }
    await context.clearCookies();
  });

  afterAll(async () => {
    try {
      try {
        if (page) await page.close();
      } finally {
        try {
          if (context) await context.close();
        } finally {
          try {
            if (browser) await browser.close();
          } finally {
            try {
              if (server && templateMarkers.length > 0) {
                await server.testDb.cleanup({ templateNames: templateMarkers });
              }
            } finally {
              if (server) await server.teardown();
            }
          }
        }
      }
    } catch (cleanupError) {
      if (setupError === undefined) throw cleanupError;
    } finally {
      vi.unstubAllEnvs();
    }
  });

  function resources(): { readonly server: E2EServer; readonly page: Page } {
    if (!server || !page) {
      throw new Error('E2E resources were not created');
    }
    return { server, page };
  }

  it('redirects an anonymous admin request to login', async () => {
    const { server: currentServer, page: currentPage } = resources();

    await currentPage.goto(`${currentServer.baseUrl}/admin`);

    expect(currentPage.url()).toBe(`${currentServer.baseUrl}/admin/login`);
    await playwrightExpect(currentPage.locator('form[action="/admin/login"]')).toBeVisible();
  });

  it('renders a non-empty login CSRF token', async () => {
    const { server: currentServer, page: currentPage } = resources();

    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);

    expect(await renderedToken(currentPage, 'input[name="_csrf"]')).not.toBe('');
  });

  it('logs in and renders the authenticated shell user and CSRF token', async () => {
    const { server: currentServer, page: currentPage } = resources();
    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);

    const result = await login(currentPage, currentServer.baseUrl);
    await currentPage.goto(`${currentServer.baseUrl}/admin`);

    expect(result).toEqual({ status: 302, location: '/admin' });
    await playwrightExpect(currentPage.getByText(TEST_USERNAME, { exact: true })).toBeVisible();
    expect(await shellToken(currentPage)).not.toBe('');
  });

  it('rejects tokenless login and authenticated mutation requests', async () => {
    const { server: currentServer, page: currentPage } = resources();
    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);
    const tokenlessLogin = await currentPage
      .context()
      .request.post(`${currentServer.baseUrl}/admin/login`, {
        form: { username: TEST_USERNAME, password: TEST_PASSWORD },
        maxRedirects: 0,
      });
    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);
    await login(currentPage, currentServer.baseUrl);
    const tokenlessMutation = await currentPage
      .context()
      .request.post(`${currentServer.baseUrl}/admin/api/templates/import`, {
        form: { json: '{}' },
      });

    expect(tokenlessLogin.status()).toBe(403);
    expect(tokenlessMutation.status()).toBe(403);
  });

  it('accepts a representative HTMX mutation with the shell token', async () => {
    const { server: currentServer, page: currentPage } = resources();
    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);
    await login(currentPage, currentServer.baseUrl);
    await currentPage.goto(`${currentServer.baseUrl}/admin`);
    const token = await shellToken(currentPage);
    const templateName = `E2E CSRF ${randomUUID()}`;
    templateMarkers.push(templateName);
    await currentPage.getByTitle('导入模板').click();
    await playwrightExpect(
      currentPage.locator('form[hx-post="/admin/api/templates/import"]')
    ).toBeVisible();
    await currentPage.locator('textarea[name="json"]').fill(
      JSON.stringify({
        name: templateName,
        content: { invitationPrompt: 'Welcome', questions: ['Question'] },
      })
    );
    const requestPromise = currentPage.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/admin/api/templates/import')
    );
    const responsePromise = currentPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/admin/api/templates/import')
    );

    await currentPage
      .locator('form[hx-post="/admin/api/templates/import"] button[type="submit"]')
      .click();
    const [request, response] = await Promise.all([requestPromise, responsePromise]);
    const template = await currentServer.prisma.template.findFirst({
      where: { name: templateName },
      select: { id: true },
    });

    expect(request.headers()['x-csrf-token']).toBe(token);
    expect(response.status()).toBe(201);
    expect(template).not.toBeNull();
  });

  it('logs out by invalidating the authenticated session and redirects future navigation', async () => {
    const { server: currentServer, page: currentPage } = resources();
    await currentPage.goto(`${currentServer.baseUrl}/admin/login`);
    await login(currentPage, currentServer.baseUrl);
    await currentPage.goto(`${currentServer.baseUrl}/admin`);
    const sessionCookie = (await currentPage.context().cookies()).find(
      (cookie) => cookie.name === 'session'
    );
    expect(sessionCookie).toBeDefined();

    await currentPage.getByRole('button', { name: '退出' }).click();

    expect(currentPage.url()).toBe(`${currentServer.baseUrl}/admin/login`);
    // Session-based CSRF means the login page always issues a fresh CSRF-only
    // session, so assert the authenticated session value is gone — not cookie absence.
    const sessionAfterLogout = (await currentPage.context().cookies()).find(
      (cookie) => cookie.name === 'session'
    );
    expect(sessionAfterLogout?.value).not.toBe(sessionCookie?.value);
    await currentPage.goto(`${currentServer.baseUrl}/admin`);
    expect(currentPage.url()).toBe(`${currentServer.baseUrl}/admin/login`);
    await playwrightExpect(currentPage.locator('form[action="/admin/login"]')).toBeVisible();
  });

  it('accepts the compatible X-Admin-Key without CSRF', async () => {
    const { server: currentServer, page: currentPage } = resources();

    const response = await currentPage.request.post(
      `${currentServer.baseUrl}/admin/api/templates/import`,
      {
        headers: { 'x-admin-key': TEST_API_KEY },
        form: { json: '{}' },
      }
    );

    expect(response.status()).toBe(422);
  });

  it('restores helper-owned environment after failed server construction', async () => {
    const { server: currentServer } = resources();
    const occupiedPort = Number(new URL(currentServer.baseUrl).port);
    const originalEnvironment = new Map(HELPER_ENV_KEYS.map((key) => [key, process.env[key]]));
    const originalDatabaseUrl = process.env['DATABASE_URL'];
    for (const key of HELPER_ENV_KEYS) delete process.env[key];
    process.env['DATABASE_URL'] = 'postgresql://environment-restore-sentinel/test';

    try {
      await expect(createE2EServer(occupiedPort)).rejects.toMatchObject({ code: 'EADDRINUSE' });

      for (const key of HELPER_ENV_KEYS) expect(process.env[key]).toBeUndefined();
      expect(process.env['DATABASE_URL']).toBe('postgresql://environment-restore-sentinel/test');
    } finally {
      for (const key of HELPER_ENV_KEYS) {
        const value = originalEnvironment.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (originalDatabaseUrl === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = originalDatabaseUrl;
    }
  });
});
