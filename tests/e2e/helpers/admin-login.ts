// @no-test-required: E2E login helper, exercised by every admin E2E suite that imports it
import type { Page } from 'playwright';
import { vi } from 'vitest';

export const E2E_ADMIN_USERNAME = 'e2e-admin';
export const E2E_ADMIN_PASSWORD = 'e2e-test-password';
export const E2E_ADMIN_API_KEY = 'test-admin-key';

const E2E_ADMIN_PASSWORD_HASH = '$2a$04$/n0nx2VL1x0uOwVndrujnufaskvd7PG9fLC.MsbejxijyJmoALqAG';

/**
 * Ceiling for waits on the admin shell. This is a bound for slow full-suite
 * concurrency, not an expected duration — the shell normally appears in well
 * under a second. Kept in one place so it can be tuned without hunting literals.
 */
export const ADMIN_SHELL_TIMEOUT_MS = 30_000;

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
  // Only the URL transition matters here; waiting for 'load' lets a slow
  // post-login page fetch outlast the budget on a loaded full-suite run.
  await Promise.all([
    page.waitForURL(`${baseUrl}/admin`, { waitUntil: 'commit', timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  // 'commit' resolves before the response body is parsed, so callers would
  // otherwise be handed a page that is still blank. Probed at this point, the
  // document was a partial render — `<!DOCTYPE html><html lang="zh-CN"><head>`
  // (~320-430 bytes) with zero <aside> nodes — i.e. the real admin page, mid
  // transfer, not an error or redirect stub.
  //
  // Invariant enforced here: when this function returns, the authenticated admin
  // shell is present and queryable. Login is not "done" until the caller can
  // actually use the page.
  await waitForAdminShell(page);
}

/**
 * Resolve once the authenticated admin shell is present in the DOM.
 *
 * `loginAdminViaForm` only guarantees the URL transition, not a parsed DOM;
 * tree/content queries must not assume the shell exists yet.
 *
 * `attached` (not `visible`) is deliberate: the shell and its tree body are
 * server-rendered inline — `src/views/layouts/admin-tree.njk:56` is
 * `{% block tree %}{% include "admin/tree-body.njk" %}{% endblock %}` inside the
 * `<aside>` (line 54). The `hx-get` attributes in `admin/tree-body.njk` are all
 * on buttons that target `#main-content` on user click; none use
 * `hx-trigger="load"`, so there is no client-side hydration of the tree to await
 * and the node arrives populated.
 *
 * This only guarantees the element exists. Callers that assert on tree *content*
 * should still assert the specific text (see plan-lifecycle.e2e.test.ts), which
 * is what makes the guarantee sufficient in practice.
 *
 * Scope note: this closes a real blank-page window (verified: the post-'commit'
 * body was a partial render with zero <aside> nodes). A controlled A/B run showed
 * the assertion-timeout bump alone also made the target test pass, so this wait is
 * not proven to be the sole cause of the original flake; it is kept because the
 * invariant above is worth enforcing regardless. See docs/handover-report.md §3.1.
 *
 * Contract note: `loginAdminViaForm` hard-waits for the URL `${baseUrl}/admin`
 * before returning, so every caller lands on the admin shell that contains this
 * `<aside>`. Callers must not be retargeted to a non-shell route without
 * revisiting this wait.
 */
export async function waitForAdminShell(page: Page): Promise<void> {
  await page.waitForSelector('aside', { state: 'attached', timeout: ADMIN_SHELL_TIMEOUT_MS });
}

export async function renderedShellCsrfToken(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) {
    throw new Error('Authenticated admin shell did not render a CSRF token');
  }
  return token;
}
