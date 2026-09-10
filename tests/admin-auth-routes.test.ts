import fastifyCsrfProtection from '@fastify/csrf-protection';
import fastifyFormbody from '@fastify/formbody';
import secureSession from '@fastify/secure-session';
import fastifyView from '@fastify/view';
import bcrypt from 'bcryptjs';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import nunjucks from 'nunjucks';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSession } from '../src/middleware/session-auth.js';
import { adminAuthRoutes } from '../src/routes/admin-auth.js';
import { loginRateLimiter } from '../src/utils/security.js';

const testUsername = 'testadmin';
const testPassword = 'testpassword123';
let testHash: string;

type CsrfState = {
  readonly token: string;
  readonly cookie: string;
};

function cookieHeader(...setCookieHeaders: (string | string[] | undefined)[]): string {
  const cookies = new Map<string, string>();
  for (const setCookieHeader of setCookieHeaders) {
    const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const value of values) {
      const pair = value?.split(';')[0];
      const name = pair?.split('=')[0];
      if (pair && name) {
        cookies.set(name, pair);
      }
    }
  }
  return [...cookies.values()].join('; ');
}

function formBody(values: Readonly<Record<string, string>>): string {
  return new URLSearchParams(values).toString();
}

describe('adminAuthRoutes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testHash = await bcrypt.hash(testPassword, 4);
  });

  beforeEach(async () => {
    loginRateLimiter.clear();
    app = Fastify();
    await app.register(secureSession, {
      secret: 'a'.repeat(32),
      salt: 'b'.repeat(16),
    });
    await app.register(fastifyCsrfProtection);
    await app.register(fastifyFormbody);
    await app.register(fastifyView, {
      engine: { nunjucks },
      templates: 'src/views',
      options: { autoescape: true, noCache: true },
    });
    await app.register(adminAuthRoutes);
    app.get('/probe', async (request: FastifyRequest) => ({
      admin: (request.session.get('admin') as AdminSession | undefined) ?? null,
    }));
    process.env['ADMIN_USERNAME'] = testUsername;
    process.env['ADMIN_PASSWORD_HASH'] = testHash;
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    delete process.env['ADMIN_USERNAME'];
    delete process.env['ADMIN_PASSWORD_HASH'];
    delete process.env['SESSION_MAX_AGE'];
  });

  async function getCsrfState(): Promise<CsrfState> {
    const response = await app.inject({ method: 'GET', url: '/admin/login' });
    const token = /name="_csrf" value="([^"]+)"/.exec(response.body)?.[1];
    if (!token) {
      throw new Error('Login page did not render a CSRF token');
    }
    return { token, cookie: cookieHeader(response.headers['set-cookie']) };
  }

  async function login(
    csrf: CsrfState,
    username = testUsername,
    password = testPassword
  ): Promise<Awaited<ReturnType<typeof app.inject>>> {
    return app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: {
        cookie: csrf.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({ username, password, _csrf: csrf.token }),
    });
  }

  it('renders a CSRF-protected login page', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/login' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="_csrf"');
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('rejects a tokenless login', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: testUsername, password: testPassword },
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a login whose token does not match its cookie', async () => {
    const csrf = await getCsrfState();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: {
        cookie: csrf.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({ username: testUsername, password: testPassword, _csrf: 'invalid' }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('rejects a login whose token and storage cookie come from different sessions', async () => {
    const firstSession = await getCsrfState();
    const secondSession = await getCsrfState();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: {
        cookie: firstSession.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({
        username: testUsername,
        password: testPassword,
        _csrf: secondSession.token,
      }),
    });

    expect(response.statusCode).toBe(403);
  });

  it('logs in with a matching token and cookie', async () => {
    const response = await login(await getCsrfState());

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/admin');
  });

  it('reaches invalid-credential outcomes with valid CSRF', async () => {
    const response = await login(await getCsrfState(), testUsername, 'wrong-password');

    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('用户名或密码错误');
  });

  it('does not log the submitted username on a failed login', async () => {
    const warnSpy = vi.spyOn(app.log, 'warn');
    const submittedUsername = 'attacker-probe-username';

    const response = await login(await getCsrfState(), submittedUsername, 'wrong-password');

    expect(response.statusCode).toBe(401);
    const loggedText = JSON.stringify(warnSpy.mock.calls);
    expect(loggedText).not.toContain(submittedUsername);
  });

  it('clears an expired session when the login page is requested', async () => {
    const csrf = await getCsrfState();
    const loginResponse = await login(csrf);
    const sessionCookie = cookieHeader(csrf.cookie, loginResponse.headers['set-cookie']);

    process.env['SESSION_MAX_AGE'] = '10';
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    const loginPageResponse = await app.inject({
      method: 'GET',
      url: '/admin/login',
      headers: { cookie: sessionCookie },
    });
    nowSpy.mockRestore();

    expect(loginPageResponse.statusCode).toBe(200);

    const probeResponse = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: {
        cookie: cookieHeader(sessionCookie, loginPageResponse.headers['set-cookie']),
      },
    });

    expect(probeResponse.statusCode).toBe(200);
    expect(JSON.parse(probeResponse.body).admin).toBeNull();
  });

  it('reaches configuration errors with valid CSRF', async () => {
    delete process.env['ADMIN_USERNAME'];
    delete process.env['ADMIN_PASSWORD_HASH'];

    const response = await login(await getCsrfState());

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('管理员凭据未设置');
  });

  it('reaches request validation with valid CSRF', async () => {
    const csrf = await getCsrfState();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: {
        cookie: csrf.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({ username: '', password: '', _csrf: csrf.token }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('无效的请求格式');
  });

  it('uses inactivity rather than absolute login age for the login-page redirect', async () => {
    const currentTime = new Date('2026-08-20T00:00:00Z').getTime();
    const expiredLoginTime = currentTime - 12_000;
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(expiredLoginTime)
      .mockReturnValueOnce(currentTime)
      .mockReturnValue(currentTime);
    process.env['SESSION_MAX_AGE'] = '10';
    const csrf = await getCsrfState();
    const loginResponse = await login(csrf);
    const sessionCookie = cookieHeader(csrf.cookie, loginResponse.headers['set-cookie']);
    const response = await app.inject({
      method: 'GET',
      url: '/admin/login',
      headers: { cookie: sessionCookie },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/admin');
  });

  it('rejects a tokenless logout', async () => {
    const csrf = await getCsrfState();
    const loginResponse = await login(csrf);
    const authenticatedCookie = cookieHeader(csrf.cookie, loginResponse.headers['set-cookie']);
    const response = await app.inject({
      method: 'POST',
      url: '/admin/logout',
      headers: { cookie: authenticatedCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it('logs out an authenticated session with matching CSRF and clears it', async () => {
    const csrf = await getCsrfState();
    const loginResponse = await login(csrf);
    const authenticatedCookie = cookieHeader(csrf.cookie, loginResponse.headers['set-cookie']);
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/admin/logout',
      headers: {
        cookie: authenticatedCookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({ _csrf: csrf.token }),
    });

    const loggedOutCookie = cookieHeader(authenticatedCookie, logoutResponse.headers['set-cookie']);
    const loginPageResponse = await app.inject({
      method: 'GET',
      url: '/admin/login',
      headers: { cookie: loggedOutCookie },
    });

    expect(logoutResponse.statusCode).toBe(302);
    expect(logoutResponse.headers.location).toBe('/admin/login');
    expect(loginPageResponse.statusCode).toBe(200);
  });

  it.each([
    ['GET', '/admin/content/change-password'],
    ['POST', '/admin/change-password'],
  ] as const)('returns 404 for removed password route %s %s', async (method, url) => {
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(404);
  });

  it('returns 429 after repeated failed logins from the same IP', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failure = await login(await getCsrfState(), testUsername, 'wrong-password');
      expect(failure.statusCode).toBe(401);
    }

    const blocked = await login(await getCsrfState(), testUsername, testPassword);

    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toContain('尝试次数过多');
  });

  it('does not count request-validation failures toward the rate limit', async () => {
    const csrf = await getCsrfState();
    const invalidBody = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: {
        cookie: csrf.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody({ username: '', password: '', _csrf: csrf.token }),
    });
    expect(invalidBody.statusCode).toBe(400);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failure = await login(await getCsrfState(), testUsername, 'wrong-password');
      expect(failure.statusCode).toBe(401);
    }

    const success = await login(await getCsrfState());
    expect(success.statusCode).toBe(302);
  });

  it('clears the failure counter after a successful login', async () => {
    await login(await getCsrfState(), testUsername, 'wrong-password');
    await login(await getCsrfState(), testUsername, 'wrong-password');
    const success = await login(await getCsrfState());
    expect(success.statusCode).toBe(302);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failure = await login(await getCsrfState(), testUsername, 'wrong-password');
      expect(failure.statusCode).toBe(401);
    }
  });
});
