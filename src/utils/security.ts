import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from './prisma-client.js';

export interface AuthUser {
  userId: string;
  role: 'admin' | 'user';
  apiKeyId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const failedAttempts = new Map<string, { count: number; windowStart: number }>();

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/** Hashing normalizes length first: timingSafeEqual throws on unequal lengths and length itself must not leak. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function checkRateLimit(ipAddress: string): boolean {
  if (process.env['NODE_ENV'] === 'test') {
    return true;
  }
  const now = Date.now();
  const entry = failedAttempts.get(ipAddress);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.set(ipAddress, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_FAILED_ATTEMPTS;
}

export interface LoginRateLimiterOptions {
  readonly maxFailures?: number;
  readonly windowMs?: number;
  readonly now?: () => number;
}

export interface LoginRateLimiter {
  isBlocked(ip: string): boolean;
  recordFailure(ip: string): void;
  reset(ip: string): void;
  clear(): void;
}

const DEFAULT_LOGIN_MAX_FAILURES = 5;
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60_000;

/** Security contract: only failed attempts count; a successful login resets the counter. */
export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}): LoginRateLimiter {
  const maxFailures = options.maxFailures ?? DEFAULT_LOGIN_MAX_FAILURES;
  const windowMs = options.windowMs ?? DEFAULT_LOGIN_WINDOW_MS;
  const now = options.now ?? Date.now;
  const failures = new Map<string, { count: number; windowStart: number }>();

  return {
    isBlocked(ip: string): boolean {
      const entry = failures.get(ip);
      if (!entry) {
        return false;
      }
      if (now() - entry.windowStart > windowMs) {
        failures.delete(ip);
        return false;
      }
      return entry.count >= maxFailures;
    },
    recordFailure(ip: string): void {
      const timestamp = now();
      const entry = failures.get(ip);
      if (!entry || timestamp - entry.windowStart > windowMs) {
        failures.set(ip, { count: 1, windowStart: timestamp });
        return;
      }
      entry.count += 1;
    },
    reset(ip: string): void {
      failures.delete(ip);
    },
    clear(): void {
      failures.clear();
    },
  };
}

export const loginRateLimiter: LoginRateLimiter = createLoginRateLimiter();

/**
 * True for the public health endpoint, the only route exempt from API-key auth.
 *
 * Matched on an exact path or a query string, so a path merely *containing*
 * `/api/health` (e.g. `/api/health-admin`) still requires a key.
 */
function isPublicHealthRequest(request: FastifyRequest): boolean {
  if (request.method !== 'GET') return false;
  return request.url === '/api/health' || request.url.startsWith('/api/health?');
}

/**
 * Constant-time comparison of the request's X-Admin-Key against the configured
 * one, returning true when the request should be treated as the admin user.
 *
 * Both sides must be present: an unset `ADMIN_API_KEY` never authenticates.
 */
function matchesAdminKey(request: FastifyRequest): boolean {
  const rawAdminKey = request.headers['x-admin-key'];
  const adminKey = Array.isArray(rawAdminKey) ? rawAdminKey.join(',') : rawAdminKey;
  const expectedAdminKey = process.env['ADMIN_API_KEY'];
  if (!adminKey || !expectedAdminKey) return false;
  return timingSafeEqualStrings(adminKey, expectedAdminKey);
}

export function createVerifyApiKey(prisma: PrismaClient) {
  return async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
    // Two ways to be let in BEFORE a key is looked up: a public health probe, and
    // an admin UI request already authenticated by its own header. Both must run
    // before the rate limiter, or a healthy deployment's probes would consume the
    // admin's failed-attempt budget.
    if (isPublicHealthRequest(request)) return;
    if (matchesAdminKey(request)) {
      request.user = { userId: 'admin', role: 'admin' };
      return;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const earlyRefusal = apiKeyRefusal(apiKey, request.ip);
    if (earlyRefusal) return deny(reply, earlyRefusal.status, earlyRefusal.error);

    // `apiKey` is non-null once apiKeyRefusal returned undefined; the assertion
    // restates a fact the guard just established.
    const keyRecord = await prisma.apiKey.findFirst({
      where: { keyHash: hashApiKey(apiKey as string), revoked: false },
    });
    if (!keyRecord) return deny(reply, 401, 'Invalid API key');

    grantAccess(request, keyRecord);
  };
}

/**
 * The refusal reason for a request that cannot even be looked up, if any.
 *
 * Missing key first, then the rate limit: an unauthenticated request must not
 * consume the budget reserved for a caller that HAS a key and is being throttled.
 * Returning the reason instead of sending keeps this pure and testable.
 */
function apiKeyRefusal(
  apiKey: string | undefined,
  ip: string | undefined
): { status: number; error: string } | undefined {
  if (!apiKey) return { status: 401, error: 'API key required' };
  if (!checkRateLimit(ip || 'unknown')) {
    return { status: 429, error: 'Too many failed attempts' };
  }
  return undefined;
}

/** Refuse the request with a JSON error body. */
function deny(reply: FastifyReply, status: number, error: string): FastifyReply {
  return reply.status(status).send({ error });
}

/**
 * Attach the identity implied by a matched key.
 *
 * `userId` falls back to `'unknown'` rather than refusing: the key row IS
 * authentic, so a null userId means the row was created oddly, not that the
 * caller is untrusted. `apiKeyId` is recorded so an audit trail can point at the
 * exact key that made the call.
 */
function grantAccess(
  request: FastifyRequest,
  keyRecord: { userId: string | null; role: string; id: string }
): void {
  request.user = {
    userId: keyRecord.userId || 'unknown',
    role: keyRecord.role as 'admin' | 'user',
    apiKeyId: keyRecord.id,
  };
}

export async function logSecurityEvent(
  prisma: PrismaClient,
  params: {
    action: string;
    entityType: string;
    entityId?: string;
    userId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      ...optionalAuditFields(params),
    },
  });
}

/** Audit columns that are only written when the caller supplied them. */
const OPTIONAL_AUDIT_FIELDS = ['entityId', 'userId', 'ipAddress'] as const;

/**
 * The optional half of an audit row.
 *
 * Omitted rather than sent as `null`: a null would overwrite a column an earlier
 * entry had set, and these fields are absent far more often than present, so the
 * entries stay small. `details` is stringified because the column is text.
 */
function optionalAuditFields(params: {
  entityId?: string;
  userId?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of OPTIONAL_AUDIT_FIELDS) {
    const value = params[key];
    if (value != null) fields[key] = value;
  }
  if (params.details) fields['details'] = JSON.stringify(params.details);
  return fields;
}

export function anonymizeData(data: string): string {
  const patterns = [
    { regex: /1[3-9]\d{9}/g, replacement: '1XXXXXXXXXX' },
    {
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: 'xxx@xxx.xxx',
    },
    { regex: /\b\d{17}[\dXx]\b/g, replacement: 'XXXXXXXXXXXXXXXXX' },
  ];

  let result = data;
  for (const { regex, replacement } of patterns) {
    result = result.replace(regex, replacement);
  }
  return result;
}

export function generateApiKey(): string {
  return `ib_${crypto.randomBytes(32).toString('hex')}`;
}

export async function securityMiddleware(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.addHook('onRequest', async (request, _reply) => {
    if (!shouldAuditRequest(request.method, request.url)) return;

    await logSecurityEvent(prisma, {
      action: 'REQUEST',
      entityType: 'api',
      details: { method: request.method, path: request.url },
      ipAddress: request.ip,
    });
  });
}

/** Methods whose requests are audited regardless of path. */
const AUDITED_METHODS = new Set(['POST', 'PUT', 'DELETE']);

/**
 * Whether this request belongs in the audit log.
 *
 * Read requests are SKIPPED everywhere except /admin/, because the audit table is
 * written on every insert and a page of admin GETs would otherwise bury the
 * mutations it exists to record. Health probes and static assets are skipped
 * entirely -- they are neither interesting nor rare.
 */
function shouldAuditRequest(method: string, path: string): boolean {
  if (path.startsWith('/health') || path.startsWith('/public/')) return false;
  return AUDITED_METHODS.has(method) || path.startsWith('/admin/');
}
