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

export function createVerifyApiKey(prisma: PrismaClient) {
  return async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required' });
    }

    const keyRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'API_KEY_CREATED',
        details: { contains: apiKey.substring(0, 8) },
      },
    });

    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    request.user = {
      userId: keyRecord.userId || 'unknown',
      role: 'user',
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
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      details: params.details ? JSON.stringify(params.details) : undefined,
      ipAddress: params.ipAddress,
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

    if (path.startsWith('/health') || path.startsWith('/webhook')) {
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