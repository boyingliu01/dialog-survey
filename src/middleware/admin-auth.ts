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
  const session = request.session.get('admin') as AdminSession | undefined;
  const maxAge = Number(process.env['SESSION_MAX_AGE']) || DEFAULT_SESSION_MAX_AGE;

  if (validateSession(session, maxAge)) {
    request.session.set('admin', session);
    request.user = {
      userId: session.userId,
      role: session.role,
    };
    request.adminAuthMode = 'session';
    return;
  }

  if (session) {
    request.session.delete();
  }

  const rawApiKey = request.headers['x-admin-key'];
  const apiKey = Array.isArray(rawApiKey) ? rawApiKey.join(',') : rawApiKey;

  if (apiKey !== undefined) {
    const adminApiKey = process.env['ADMIN_API_KEY'];
    if (!adminApiKey) {
      await reply
        .code(500)
        .type('text/html')
        .send('<div class="text-red-600">服务器配置错误：ADMIN_API_KEY 未设置</div>');
      return;
    }

    if (timingSafeEqualStrings(apiKey, adminApiKey)) {
      request.user = {
        userId: 'admin',
        role: 'admin',
      };
      request.adminAuthMode = 'api-key';
      return;
    }

    await reply
      .code(401)
      .type('text/html')
      .send('<div class="text-red-600">认证失败：无效的 Admin API Key</div>');
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    await reply.redirect('/admin/login');
    return;
  }

  await reply
    .code(401)
    .type('text/html')
    .send('<div class="text-red-600">认证失败：无效的 Admin API Key</div>');
}
