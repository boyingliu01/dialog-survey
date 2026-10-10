import type { FastifyInstance } from 'fastify';
import type { DatabaseHealthRepository } from '../repositories/database-health.repository.js';
import { error, info } from '../utils/logger.js';
import { getAppVersion } from '../utils/app-version.js';
import { normalizeLlmBaseUrl } from '../integrations/llm/openai-compatible.js';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  timestamp: string;
  checks: {
    db: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    llm: {
      status: 'ok' | 'error' | 'degraded';
      latencyMs?: number;
      error?: string;
      endpoint?: string;
      detail?: string;
    };
    dingtalk: { status: 'ok' | 'error' | 'degraded'; error?: string };
  };
}

let llmCacheTime: number | null = null;

async function checkLLM(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  latencyMs?: number;
  error?: string;
  endpoint?: string;
  detail?: string;
}> {
  if (llmCacheTime && Date.now() - llmCacheTime < 60000) {
    return { status: 'ok' };
  }

  try {
    const apiKey = process.env['LLM_API_KEY'] || process.env['VOLCENGINE_API_KEY'];
    if (!apiKey) {
      return { status: 'degraded', error: 'API key not configured' };
    }

    const rawBaseUrl =
      process.env['LLM_BASE_URL'] ||
      process.env['VOLCENGINE_BASE_URL'] ||
      'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions';
    const baseUrl = normalizeLlmBaseUrl(rawBaseUrl);
    const model = process.env['LLM_MODEL'] || process.env['VOLCENGINE_MODEL'];

    if (!model) {
      return { status: 'degraded', error: 'LLM model not configured', endpoint: baseUrl };
    }

    const start = Date.now();
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'health check' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      llmCacheTime = Date.now();
      return { status: 'ok', latencyMs, endpoint: baseUrl };
    }
    // Surface the target URL and a short response-body snippet so operators can
    // tell a misconfigured URL (e.g. a gateway base instead of the full
    // endpoint) from an auth/quota failure at a glance (issue #189).
    let detail: string | undefined;
    try {
      const snippet = await response.text();
      if (snippet) detail = snippet.slice(0, 200);
    } catch {
      // ignore — detail is best-effort
    }
    const result: {
      status: 'degraded';
      latencyMs: number;
      error: string;
      endpoint: string;
      detail?: string;
    } = {
      status: 'degraded',
      latencyMs,
      error: `HTTP ${response.status}`,
      endpoint: baseUrl,
    };
    if (detail) result.detail = detail;
    return result;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    if (errMsg.includes('timeout') || errMsg.includes('abort')) {
      return { status: 'degraded', error: 'timeout' };
    }
    error('LLM health check failed', { error: errMsg });
    return { status: 'error', error: errMsg };
  }
}

async function checkDingTalk(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  error?: string;
}> {
  // Check Stream mode configuration (Stream client uses WebSocket, not webhook URL)
  const clientId = process.env['DINGTALK_CLIENT_ID'];
  const clientSecret = process.env['DINGTALK_CLIENT_SECRET'];
  const agentId = process.env['DINGTALK_AGENT_ID'];

  if (!clientId || !clientSecret || !agentId) {
    return {
      status: 'degraded',
      error:
        'DingTalk Stream credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or AGENT_ID)',
    };
  }

  if (clientId.includes('xxx') || clientSecret.includes('xxx')) {
    return {
      status: 'degraded',
      error: 'DingTalk Stream credentials contain placeholder values',
    };
  }

  return { status: 'ok' };
}

export async function healthRoutes(
  fastify: FastifyInstance,
  opts: { databaseHealth: DatabaseHealthRepository }
) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    info('Health check requested');

    const [dbCheck, llmCheck, dingtalkCheck] = await Promise.all([
      opts.databaseHealth.check(),
      checkLLM(),
      checkDingTalk(),
    ]);

    const dbOk = dbCheck.status === 'ok';
    const llmOk = llmCheck.status === 'ok';
    const dingtalkOk = dingtalkCheck.status === 'ok';

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (dbOk && llmOk && dingtalkOk) {
      status = 'healthy';
    } else if (dbOk) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    const response: HealthResponse = {
      status,
      version: getAppVersion(),
      timestamp: new Date().toISOString(),
      checks: {
        db: dbCheck,
        llm: llmCheck,
        dingtalk: dingtalkCheck,
      },
    };

    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
