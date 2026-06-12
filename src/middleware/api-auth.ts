import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * API Key authentication middleware for /api/* routes.
 *
 * Checks x-api-key header against stored audit logs.
 * Returns 401 if missing or invalid.
 */
export function createApiKeyAuthMiddleware(prisma: PrismaClient) {
  return async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required' });
    }

    // Check if API key exists in audit logs (stored during API_KEY_CREATED events)
    const keyRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'API_KEY_CREATED',
        details: { contains: apiKey.substring(0, 8) },
      },
    });

    if (!keyRecord) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // Attach user context to request
    (request as FastifyRequest & { user?: { userId: string; role: string } }).user = {
      userId: keyRecord.userId || 'unknown',
      role: 'user',
    };
  };
}
