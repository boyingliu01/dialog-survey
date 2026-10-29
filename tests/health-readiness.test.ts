import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READINESS_PATH, healthRoutes, resetHealthProbeCacheForTests } from '../src/api/health.js';
import type { DatabaseHealthRepository } from '../src/repositories/database-health.repository.js';
import type { DbHealthResult } from '../src/repositories/database-health.repository.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

/**
 * Issue #218: `/health` answered 200 for `degraded`, and `docker-compose.yml`
 * decided container health from `r.ok` alone — so a deployment with no LLM key
 * and placeholder DingTalk credentials showed as `healthy` while it could not
 * hold a single interview. The fix is two routes with different semantics:
 *
 *   /health        liveness  — 200 for healthy AND degraded, 503 only if the DB is down
 *   /health/ready  readiness — 200 only for healthy
 *
 * Both must keep answering the same body, so a monitor can read either.
 */

const VALID_ENV = {
  LLM_API_KEY: 'valid-key',
  LLM_MODEL: 'test-model',
  DINGTALK_CLIENT_ID: 'valid-client-id',
  DINGTALK_CLIENT_SECRET: 'valid-client-secret',
  DINGTALK_AGENT_ID: 'valid-agent-id',
} as const;

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  // `vi.stubEnv(key, '')` sets an EMPTY STRING, and `resolveLlmConfig` uses
  // `||`, so an empty LLM_API_KEY falls through to ANTHROPIC_AUTH_TOKEN and the
  // "no key configured" case silently becomes a working one. Delete the
  // variables that must be absent instead of blanking them.
  for (const key of [
    'VOLCENGINE_API_KEY',
    'VOLCENGINE_MODEL',
    'VOLCENGINE_BASE_URL',
    'LLM_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function buildHealthApp(db: DbHealthResult): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const databaseHealth = {
    check: vi.fn().mockResolvedValue(db),
  } as unknown as DatabaseHealthRepository;
  await app.register(healthRoutes, { databaseHealth });
  await app.ready();
  return app;
}

describe('health readiness vs liveness (issue #218)', () => {
  const apps: FastifyInstance[] = [];
  const mockFetch = vi.fn();

  async function app(
    db: DbHealthResult = { status: 'ok', latencyMs: 1 }
  ): Promise<FastifyInstance> {
    const built = await buildHealthApp(db);
    apps.push(built);
    return built;
  }

  beforeEach(() => {
    // The module caches a successful LLM probe for 60s; without dropping it, a
    // "no key configured" test would read the previous test's cached `ok` and
    // pass or fail on ordering luck.
    resetHealthProbeCacheForTests();
    // The LLM probe uses the global fetch, not an injectable one: stub it so
    // this suite never reaches a real provider.
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(async () => {
    for (const built of apps.splice(0)) await built.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exports the readiness path the healthchecks point at', () => {
    // The compose service and the Dockerfile HEALTHCHECK both hardcode this
    // path; a rename here must not silently leave them probing a 404 (which
    // docker treats as unhealthy forever — noisy, but for the wrong reason).
    expect(READINESS_PATH).toBe('/health/ready');
  });

  it('returns 200 healthy on both routes when every dependency works', async () => {
    stubEnv();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const server = await app();

    const live = await server.inject({ method: 'GET', url: '/health' });
    const ready = await server.inject({ method: 'GET', url: READINESS_PATH });

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(JSON.parse(live.body).status).toBe('healthy');
    expect(JSON.parse(ready.body).status).toBe('healthy');
  });

  it('keeps /health at 200 for a degraded deployment (liveness stays usable)', async () => {
    stubEnv({ LLM_API_KEY: '' });
    const server = await app();

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('degraded');
  });

  it('reports a degraded deployment as not-ready (503) on /health/ready', async () => {
    // The exact scenario the issue measured: DB fine, no LLM key.
    stubEnv({ LLM_API_KEY: '' });
    const server = await app();

    const response = await server.inject({ method: 'GET', url: READINESS_PATH });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.llm.error).toBe('API key not configured');
    expect(body.checks.db.status).toBe('ok');
  });

  it('reports placeholder DingTalk credentials as not-ready', async () => {
    stubEnv({ DINGTALK_CLIENT_ID: 'xxx', DINGTALK_CLIENT_SECRET: 'xxx', DINGTALK_AGENT_ID: 'xxx' });
    const server = await app();

    const response = await server.inject({ method: 'GET', url: READINESS_PATH });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).checks.dingtalk.status).toBe('degraded');
  });

  it('returns 503 on both routes when the database is down', async () => {
    stubEnv();
    const server = await app({ status: 'error', error: 'Connection refused' });

    const live = await server.inject({ method: 'GET', url: '/health' });
    const ready = await server.inject({ method: 'GET', url: READINESS_PATH });

    expect(live.statusCode).toBe(503);
    expect(ready.statusCode).toBe(503);
    expect(JSON.parse(ready.body).status).toBe('unhealthy');
  });

  it('never lets a cache serve a stale healthy verdict', async () => {
    stubEnv();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const server = await app();

    for (const url of ['/health', READINESS_PATH]) {
      const response = await server.inject({ method: 'GET', url });
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('emits the same body on both routes for the same state', async () => {
    stubEnv({ LLM_API_KEY: '' });
    const server = await app();

    const live = JSON.parse((await server.inject({ url: '/health' })).body);
    const ready = JSON.parse((await server.inject({ url: READINESS_PATH })).body);

    expect({ ...live, timestamp: '<t>' }).toEqual({ ...ready, timestamp: '<t>' });
  });
});
