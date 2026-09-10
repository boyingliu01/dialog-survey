import type {} from '@fastify/csrf-protection';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { adminAuth } from './admin-auth.js';

type CsrfProtectionHook = FastifyInstance['csrfProtection'];

export function createAdminMutationGuard(
  csrfProtection: CsrfProtectionHook
): preHandlerAsyncHookHandler {
  return async function adminMutationGuard(request: FastifyRequest, reply: FastifyReply) {
    await adminAuth(request, reply);
    if (reply.sent || request.adminAuthMode === 'api-key') {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      // Fail closed: a callback error without a sent reply must reject, never fall through to the handler.
      const settle = (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };
      csrfProtection.call(this, request, reply, settle);
      if (reply.sent) {
        resolve();
      }
    });
  };
}
