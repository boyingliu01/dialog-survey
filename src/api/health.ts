import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
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

let prisma: PrismaClient | null = null;
let llmCacheTime: number | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

async function checkDatabase(): Promise<{
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    const db = getPrisma();
    await db.$queryRaw`SELECT 1`;
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
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey || apiKey === 'your-dashscope-api-key') {
      return { status: 'degraded', error: 'API key not configured' };
    }

    const start = Date.now();
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-v3',
          input: 'health check',
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

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
  const webhookUrl = process.env.DINGTALK_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('xxx')) {
    return { status: 'degraded', error: 'Webhook not configured' };
  }
  return { status: 'ok' };
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    info('Health check requested');

    const [dbCheck, llmCheck, dingtalkCheck] = await Promise.all([
      checkDatabase(),
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
