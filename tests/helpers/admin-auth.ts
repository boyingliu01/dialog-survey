import csrfProtection from '@fastify/csrf-protection';
import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';

export async function registerTestAdminAuth(
  fastify: FastifyInstance,
  defaultAdminKey?: string
): Promise<void> {
  await fastify.register(secureSession, {
    secret: 'a'.repeat(32),
    salt: 'b'.repeat(16),
  });
  await fastify.register(csrfProtection);
  if (defaultAdminKey) {
    fastify.addHook('onRequest', async (request) => {
      if (
        request.headers['x-test-anonymous'] !== 'true' &&
        request.headers['x-admin-key'] === undefined
      ) {
        request.headers['x-admin-key'] = defaultAdminKey;
      }
    });
  }
}
