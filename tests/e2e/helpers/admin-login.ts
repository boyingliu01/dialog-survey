// @no-test-required: E2E login helper, exercised by every admin E2E suite that imports it
import type { Page } from 'playwright';
import { vi } from 'vitest';

export const E2E_ADMIN_USERNAME = 'e2e-admin';
export const E2E_ADMIN_PASSWORD = 'e2e-test-password';
export const E2E_ADMIN_API_KEY = 'test-admin-key';

const E2E_ADMIN_PASSWORD_HASH = '$2a$04$/n0nx2VL1x0uOwVndrujnufaskvd7PG9fLC.MsbejxijyJmoALqAG';

export function stubE2EAdminCredentials(): void {
  vi.stubEnv('ADMIN_USERNAME', E2E_ADMIN_USERNAME);
  vi.stubEnv('ADMIN_PASSWORD_HASH', E2E_ADMIN_PASSWORD_HASH);
  vi.stubEnv('ADMIN_API_KEY', E2E_ADMIN_API_KEY);
}

export async function loginAdmin(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'load' });
  if (page.url() === `${baseUrl}/admin`) return;
  const csrfToken = await page.locator('input[name="_csrf"]').getAttribute('value');
  if (!csrfToken) {
    throw new Error('Login page did not render a CSRF token');
  }

  const response = await page.context().request.post(`${baseUrl}/admin/login`, {
    form: {
      username: E2E_ADMIN_USERNAME,
      password: E2E_ADMIN_PASSWORD,
      _csrf: csrfToken,
    },
    maxRedirects: 0,
  });
  const location = response.headers()['location'];
  if (response.status() !== 302 || location !== '/admin') {
    throw new Error(`Admin login failed: ${response.status()} ${location ?? 'no location'}`);
  }
}

export async function loginAdminViaForm(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'load' });
  await page.fill('#username', E2E_ADMIN_USERNAME);
  await page.fill('#password', E2E_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(`${baseUrl}/admin`, { timeout: 10_000 }),
    page.click('button[type="submit"]'),
  ]);
}

export async function renderedShellCsrfToken(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) {
    throw new Error('Authenticated admin shell did not render a CSRF token');
  }
  return token;
}
