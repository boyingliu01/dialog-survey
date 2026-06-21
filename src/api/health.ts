import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { error, info } from '../utils/logger.js';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    db: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    llm: {
      status: 'ok' | 'error' | 'degraded';
      latencyMs?: number;
      error?: string;
    };
    dingtalk: { status: 'ok' | 'error' | 'degraded'; error?: string };
  };
}

let llmCacheTime: number | null = null;

async function checkDatabase(prisma: PrismaClient): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;
    return { status: 'ok', latencyMs };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error';
    error('Database health check failed', { error: errMsg });
    return { status: 'error', error: errMsg };
  }
}

async function checkLLM(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  latencyMs?: number;
  error?: string;
}> {
  if (llmCacheTime && Date.now() - llmCacheTime < 60000) {
    return { status: 'ok' };
  }

  try {
    const apiKey = process.env.LLM_API_KEY || process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
      return { status: 'degraded', error: 'API key not configured' };
    }

    const baseUrl =
      process.env.LLM_BASE_URL ||
      process.env.VOLCENGINE_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/coding';
    const model = process.env.LLM_MODEL || process.env.VOLCENGINE_MODEL || 'deepseek-v3.2';

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
      return { status: 'ok', latencyMs };
    }
    return {
      status: 'degraded',
      latencyMs,
      error: `HTTP ${response.status}`,
    };
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
  const clientId = process.env.DINGTALK_CLIENT_ID;
  const clientSecret = process.env.DINGTALK_CLIENT_SECRET;
  const agentId = process.env.DINGTALK_AGENT_ID;

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

export async function healthRoutes(fastify: FastifyInstance, opts: { prisma: PrismaClient }) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    info('Health check requested');

    const [dbCheck, llmCheck, dingtalkCheck] = await Promise.all([
      checkDatabase(opts.prisma),
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
