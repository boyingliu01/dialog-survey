import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const mockPrismaClient = vi.fn();
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

class MockPrismaClient {
  $queryRaw = mockPrismaClient;
  $disconnect = mockDisconnect;
}

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

const mockFetch = vi.fn();

async function rebuildApp(): Promise<FastifyInstance> {
  vi.resetModules();
  global.fetch = mockFetch;

  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });
  const { healthRoutes } = await import('../src/api/health.js');
  await app.register(healthRoutes, { prisma: new MockPrismaClient() as any });
  await app.ready();
  await app.ready();
  return app;
}

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await rebuildApp();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy when all checks pass', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.checks.db.status).toBe('ok');
    expect(body.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.llm.status).toBe('ok');
    expect(body.checks.llm.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.dingtalk.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('should return degraded when DB is ok but LLM is degraded (no API key)', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    vi.stubEnv('VOLCENGINE_API_KEY', '');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.db.status).toBe('ok');
    expect(body.checks.llm.status).toBe('degraded');
    expect(body.checks.llm.error).toBe('API key not configured');
    expect(body.checks.dingtalk.status).toBe('ok');
  });

  it('should return degraded when DB is ok but LLM has HTTP error', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.llm.status).toBe('degraded');
    expect(body.checks.llm.error).toBe('HTTP 429');
  });

  it('should return degraded when DB is ok but LLM times out', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.llm.status).toBe('degraded');
    expect(body.checks.llm.error).toBe('timeout');
  });

  it('should return degraded when DB is ok but LLM has generic error', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.llm.status).toBe('error');
    expect(body.checks.llm.error).toBe('Network error');
  });

  it('should return degraded when DB is ok but DingTalk is degraded (no credentials)', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.dingtalk.status).toBe('degraded');
    expect(body.checks.dingtalk.error).toBe(
      'DingTalk Stream credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or AGENT_ID)'
    );
  });

  it('should return degraded when DingTalk credentials contain placeholder', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'xxx');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.dingtalk.status).toBe('degraded');
    expect(body.checks.dingtalk.error).toBe('DingTalk Stream credentials contain placeholder values');
  });

  it('should return unhealthy when DB fails', async () => {
    mockPrismaClient.mockRejectedValueOnce(new Error('Connection refused'));
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.db.status).toBe('error');
    expect(body.checks.db.error).toBe('Connection refused');
  });

  it('should use llmCacheTime to skip LLM check within 60s', async () => {
    mockPrismaClient.mockResolvedValue([{ '1': 1 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubEnv('VOLCENGINE_API_KEY', 'valid-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');

    await app.close();
    app = await rebuildApp();

    const response1 = await app.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(response1.body).status).toBe('healthy');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const response2 = await app.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(response2.body).status).toBe('healthy');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should degrade when placeholder API key is provided (LLM request will fail)', async () => {
    mockPrismaClient.mockResolvedValueOnce([{ '1': 1 }]);
    vi.stubEnv('VOLCENGINE_API_KEY', 'your-dashscope-api-key');
    vi.stubEnv('DINGTALK_CLIENT_ID', 'valid-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'valid-client-secret');
    vi.stubEnv('DINGTALK_AGENT_ID', 'valid-agent-id');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await app.close();
    app = await rebuildApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.llm.status).toBe('degraded');
    expect(body.checks.llm.error).toBe('HTTP 401');
  });
});
