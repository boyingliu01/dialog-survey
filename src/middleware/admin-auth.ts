import type { FastifyReply, FastifyRequest } from 'fastify';
import { error, info } from '../utils/logger.js';

const UNPROTECTED_METHODS = new Set<string>(['GET', 'HEAD', 'OPTIONS']);

export async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (UNPROTECTED_METHODS.has(request.method)) {
    return;
  }

  const adminApiKey = process.env.ADMIN_API_KEY;
  const providedKey = request.headers['x-admin-key'];

  if (!adminApiKey) {
    error('Admin authentication failed: ADMIN_API_KEY not configured', {
      method: request.method,
      url: request.url,
    });
    void reply
      .code(500)
      .type('text/html')
      .send('<div class="text-red-600">服务器配置错误：ADMIN_API_KEY 未设置</div>');
    return;
  }

  if (providedKey !== adminApiKey) {
    error('Admin authentication failed', {
      method: request.method,
      url: request.url,
      hasKey: providedKey !== undefined,
    });
    void reply
      .code(401)
      .type('text/html')
      .send('<div class="text-red-600">认证失败：无效的 Admin API Key</div>');
    return;
  }

  info('Authenticated admin request', {
    method: request.method,
    url: request.url,
  });
}
