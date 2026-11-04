import type {} from '@fastify/secure-session';
import type { FastifyReply } from 'fastify';
import type { FastifyRequest } from 'fastify/types/request.js';
import { DEFAULT_SESSION_MAX_AGE } from '../config/constants.js';
import { timingSafeEqualStrings } from '../utils/security.js';
import type { AdminSession } from './session-auth.js';
import { validateSession } from './session-auth.js';

export type AdminAuthMode = 'session' | 'api-key';

declare module 'fastify' {
  interface FastifyRequest {
    adminAuthMode?: AdminAuthMode;
  }
}

export async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (acceptSession(request)) return;
  // A stale session is cleared before the API-key path runs: it is expired or
  // malformed, so leaving it lets the next request repeat the same rejection.
  if (request.session.get('admin')) request.session.delete();

  const apiKey = headerApiKey(request);
  if (apiKey !== undefined) return authenticateByApiKey(request, reply, apiKey);

  return rejectAnonymous(request, reply);
}

/**
 * Accept the request when its session is still valid, or false.
 *
 * Re-setting the session on success (rather than leaving it untouched) refreshes
 * the cookie's expiry, so an admin who keeps working is not logged out mid-edit.
 */
function acceptSession(request: FastifyRequest): boolean {
  const session = request.session.get('admin') as AdminSession | undefined;
  if (!validateSession(session, sessionMaxAgeMs())) return false;
  request.session.set('admin', session);
  request.user = { userId: session.userId, role: session.role };
  request.adminAuthMode = 'session';
  return true;
}

/** Configured session lifetime, falling back to the shipped default. */
function sessionMaxAgeMs(): number {
  return Number(process.env['SESSION_MAX_AGE']) || DEFAULT_SESSION_MAX_AGE;
}

/**
 * The `x-admin-key` header as a single string, or undefined when absent.
 *
 * A repeated header arrives as an array; joining it keeps the comparison against
 * ADMIN_API_KEY total rather than silently accepting the first value.
 */
function headerApiKey(request: FastifyRequest): string | undefined {
  const raw = request.headers['x-admin-key'];
  return Array.isArray(raw) ? raw.join(',') : raw;
}

/** Authenticate from an API key, or answer 401/500. */
async function authenticateByApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKey: string
): Promise<void> {
  const adminApiKey = process.env['ADMIN_API_KEY'];
  // A missing key on the SERVER is a deployment fault, not a credential problem:
  // answering 401 here would send an operator hunting for a bad token when the
  // real fix is to set the variable.
  if (!adminApiKey) return sendConfigError(reply);

  if (timingSafeEqualStrings(apiKey, adminApiKey)) {
    request.user = { userId: 'admin', role: 'admin' };
    request.adminAuthMode = 'api-key';
    return;
  }
  return sendUnauthorized(reply);
}

/**
 * Reject a request that presented no credentials at all.
 *
 * A GET or HEAD is a page load, so it is redirected to the login form; anything
 * else is a programmatic call with no browser to follow a redirect, so it gets a
 * 401 it can act on.
 */
async function rejectAnonymous(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    await reply.redirect('/admin/login');
    return;
  }
  await sendUnauthorized(reply);
}

/** 500: the server itself is misconfigured, so no credential can succeed. */
async function sendConfigError(reply: FastifyReply): Promise<void> {
  await reply
    .code(500)
    .type('text/html')
    .send('<div class="text-red-600">服务器配置错误：ADMIN_API_KEY 未设置</div>');
}

/** 401: a credential was presented and did not match. */
async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply
    .code(401)
    .type('text/html')
    .send('<div class="text-red-600">认证失败：无效的 Admin API Key</div>');
}
