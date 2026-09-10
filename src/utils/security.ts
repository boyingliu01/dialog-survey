import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

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

export function createVerifyApiKey(prisma: PrismaClient) {
  return async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
    // Only exempt public health endpoint from API key auth
    if (
      request.method === 'GET' &&
      (request.url === '/api/health' || request.url.startsWith('/api/health?'))
    ) {
      return;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const rawAdminKey = request.headers['x-admin-key'];
    const adminKey = Array.isArray(rawAdminKey) ? rawAdminKey.join(',') : rawAdminKey;

    // Allow admin UI requests authenticated via X-Admin-Key header
    const expectedAdminKey = process.env['ADMIN_API_KEY'];
    if (adminKey && expectedAdminKey && timingSafeEqualStrings(adminKey, expectedAdminKey)) {
      request.user = { userId: 'admin', role: 'admin' };
      return;
    }

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required' });
    }

    const ip = request.ip || 'unknown';
    if (!checkRateLimit(ip)) {
      return reply.status(429).send({ error: 'Too many failed attempts' });
    }

    const keyHash = hashApiKey(apiKey);
    const keyRecord = await prisma.apiKey.findFirst({
      where: { keyHash, revoked: false },
    });

    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    request.user = {
      userId: keyRecord.userId || 'unknown',
      role: keyRecord.role as 'admin' | 'user',
      apiKeyId: keyRecord.id,
    };
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
  const detailsStr = params.details ? JSON.stringify(params.details) : undefined;
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      ...(params.entityId != null ? { entityId: params.entityId } : {}),
      ...(params.userId != null ? { userId: params.userId } : {}),
      ...(detailsStr != null ? { details: detailsStr } : {}),
      ...(params.ipAddress != null ? { ipAddress: params.ipAddress } : {}),
    },
  });
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
    const path = request.url;

    // Skip logging for health checks and static assets
    if (path.startsWith('/health') || path.startsWith('/public/')) {
      return;
    }

    // Only log mutations (POST/PUT/DELETE) and admin paths
    // GET/HEAD/OPTIONS requests are not logged to reduce audit log volume
    const isMutation =
      request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE';
    const isAdmin = path.startsWith('/admin/');
    if (!isMutation && !isAdmin) {
      return;
    }

    const ipAddress = request.ip;

    await logSecurityEvent(prisma, {
      action: 'REQUEST',
      entityType: 'api',
      details: { method: request.method, path },
      ipAddress,
    });
  });
}
