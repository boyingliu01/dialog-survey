import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEFAULT_SESSION_MAX_AGE } from '../config/constants.js';
import { createAdminMutationGuard } from '../middleware/admin-csrf.js';
import type { AdminSession } from '../middleware/session-auth.js';
import { validateSession } from '../middleware/session-auth.js';
import { loginRateLimiter } from '../utils/security.js';

declare module '@fastify/secure-session' {
  interface SessionData {
    admin?: AdminSession;
  }
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/** A bcrypt hash as bcryptjs writes it: `$2b$12$` + 22-char salt + 31-char digest. */
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session.get('admin') as AdminSession | undefined;
    if (validateSession(session, sessionMaxAgeMs())) {
      request.session.set('admin', session);
      return reply.redirect('/admin');
    }
    if (session) request.session.delete();
    return renderLogin(reply, 200, null);
  });

  fastify.post(
    '/admin/login',
    { preHandler: fastify.csrfProtection },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const outcome = await attemptLogin(fastify, request);
      if ('error' in outcome) return renderLogin(reply, outcome.status, outcome.error);
      return completeLogin(fastify, outcome.username, request, reply);
    }
  );

  fastify.post(
    '/admin/logout',
    { preHandler: createAdminMutationGuard(fastify.csrfProtection) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.info('Admin logout');
      request.session.delete();
      return reply.redirect('/admin/login');
    }
  );
}

/** Configured session lifetime, falling back to the shipped default. */
function sessionMaxAgeMs(): number {
  return Number(process.env['SESSION_MAX_AGE']) || DEFAULT_SESSION_MAX_AGE;
}

/** A login attempt that must not proceed, and how to report it. */
interface LoginRefusal {
  status: number;
  error: string;
}

/** A login attempt that succeeded, carrying the authenticated username. */
interface LoginSuccess {
  username: string;
}

/** The outcome of a login attempt: either a username or a refusal. */
type LoginOutcome = LoginSuccess | LoginRefusal;

/**
 * Everything that can stop a login attempt, checked in the order an operator
 * would want to hear about it.
 *
 * Every branch returns a message rather than sending the reply, so the caller owns
 * rendering -- and so this whole policy can be read as a list instead of nested
 * through five `return reply...view(...)` calls that all take the same shape.
 */
async function attemptLogin(
  fastify: FastifyInstance,
  request: FastifyRequest
): Promise<LoginOutcome> {
  if (loginRateLimiter.isBlocked(request.ip)) {
    fastify.log.warn('Admin login blocked: too many failed attempts');
    return { status: 429, error: '尝试次数过多，请稍后再试' };
  }

  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    fastify.log.warn('Admin login failed: invalid request body');
    return { status: 400, error: '无效的请求格式' };
  }

  const credentials = configuredCredentials(fastify);
  if (!credentials) {
    return { status: 500, error: '服务器配置错误：管理员凭据未设置' };
  }

  // Issue #214: a bcrypt hash mangled by docker compose's env_file interpolation
  // (`$2b`/`$12` eaten) used to surface as an ordinary "wrong password" 401
  // forever. Name it instead: the operator's next twenty minutes would otherwise
  // go into retyping a correct password.
  if (!BCRYPT_HASH_PATTERN.test(credentials.hash)) {
    fastify.log.error(
      'ADMIN_PASSWORD_HASH is not a valid bcrypt hash — check for `$` interpolation by docker compose (write `$$` in .env)'
    );
    return {
      status: 500,
      error:
        '服务器配置错误：ADMIN_PASSWORD_HASH 不是有效的 bcrypt 哈希（compose 的 env_file 会吃掉 $）',
    };
  }

  return credentialRefusal(fastify, request, parsed.data, credentials);
}

/** The configured admin identity, or null when the deployment has not set one. */
function configuredCredentials(
  fastify: FastifyInstance
): { username: string; hash: string } | null {
  const username = process.env['ADMIN_USERNAME'];
  const hash = process.env['ADMIN_PASSWORD_HASH'];
  if (!username || !hash) {
    fastify.log.error('Admin credentials not configured');
    return null;
  }
  return { username, hash };
}

/**
 * Compare the submitted credentials against the configured ones.
 *
 * Both failures produce the same 401 message on purpose: distinguishing "no such
 * user" from "wrong password" would tell an attacker which usernames exist. Both
 * also record a failure so the rate limiter sees every attempt.
 */
async function credentialRefusal(
  fastify: FastifyInstance,
  request: FastifyRequest,
  submitted: { username: string; password: string },
  expected: { username: string; hash: string }
): Promise<LoginOutcome> {
  if (submitted.username !== expected.username) return rejectBadCredentials(fastify, request);
  const isValid = await bcrypt.compare(submitted.password, expected.hash);
  if (!isValid) return rejectBadCredentials(fastify, request);
  return { username: submitted.username };
}

/** Record a failed attempt and answer with the generic 401. */
function rejectBadCredentials(fastify: FastifyInstance, request: FastifyRequest): LoginRefusal {
  loginRateLimiter.recordFailure(request.ip);
  fastify.log.warn('Admin login failed: invalid credentials');
  return { status: 401, error: '用户名或密码错误' };
}

/** Open the session and send the admin to the dashboard. */
async function completeLogin(
  fastify: FastifyInstance,
  username: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  fastify.log.info({ userId: username }, 'Admin login successful');
  loginRateLimiter.reset(request.ip);

  const session: AdminSession = {
    userId: username,
    role: 'admin',
    loginTime: Date.now(),
    lastActivity: Date.now(),
  };
  request.session.set('admin', session);
  return reply.redirect('/admin');
}

/**
 * Render the login page with an optional error.
 *
 * A fresh CSRF token is generated on every render -- including a failed one --
 * because the token is consumed per render and a stale one would make the retry
 * look like a CSRF attack rather than a wrong password.
 */
async function renderLogin(
  reply: FastifyReply,
  status: number,
  error: string | null
): Promise<void> {
  const payload = { error, csrfToken: reply.generateCsrf() };
  await reply.status(status).view('admin/login.njk', payload);
}
