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

/**
 * Issue #227: the LLM probe cached only SUCCESSES and had no in-flight
 * deduplication, so a slow upstream turned every poll into another 30s request.
 * Measured on 2026-11-04: 36 health requests pending at once, and 8 pairs of
 * false "interrupted / recovered" alerts while the service was never down.
 *
 * These four cases exist because the fix is easy to write and easy to lose: a
 * mutation that caches failures was NOT caught by the 28 tests above, since
 * every one of them polls a healthy upstream exactly once.
 */
describe('LLM probe stampede control (issue #227)', () => {
  const apps: FastifyInstance[] = [];
  const mockFetch = vi.fn();

  async function app(): Promise<FastifyInstance> {
    const built = await buildHealthApp({ status: 'ok', latencyMs: 1 });
    apps.push(built);
    return built;
  }

  beforeEach(() => {
    resetHealthProbeCacheForTests();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  afterEach(async () => {
    for (const built of apps.splice(0)) await built.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('collapses concurrent probes into a single upstream request', async () => {
    stubEnv();
    // A gate that needs the outer fetch count to stay at 1: the promise is
    // resolved only after every request has started, so an implementation
    // without dedup would have issued (and awaited) three separate calls.
    let release: (value: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200 });
        })
    );

    const server = await app();
    const probes = [
      server.inject({ method: 'GET', url: '/health' }),
      server.inject({ method: 'GET', url: '/health' }),
      server.inject({ method: 'GET', url: '/health' }),
    ];

    // Let all three reach checkLLM before any of them resolves.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    release(undefined);
    const responses = await Promise.all(probes);
    for (const response of responses) {
      expect(JSON.parse(response.body).checks.llm.status).toBe('ok');
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reuses a recent FAILURE instead of re-probing immediately', async () => {
    stubEnv();
    mockFetch.mockRejectedValue(new Error('upstream exploded'));
    const server = await app();

    const first = await server.inject({ method: 'GET', url: '/health' });
    const second = await server.inject({ method: 'GET', url: '/health' });

    expect(JSON.parse(first.body).checks.llm.status).toBe('error');
    // The second poll reads the cached failure — it must NOT have probed again.
    // Without the failure cache this is 2, and every poll in an outage waits the
    // full timeout, which is the defect.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second.body).checks.llm.error).toBe('upstream exploded');
  });

  it('re-probes once the failure cache expires, so recovery is noticed', async () => {
    stubEnv();
    mockFetch.mockRejectedValueOnce(new Error('still down'));
    const server = await app();

    const first = await server.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(first.body).checks.llm.status).toBe('error');

    // Cross the 5s failure TTL. A cache that never expires would pin the
    // deployment as degraded forever, which is worse than the original bug.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.now() + 6000);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const second = await server.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(second.body).checks.llm.status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('clears the failure cache on success so a later failure is not suppressed', async () => {
    stubEnv();
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const server = await app();

    const healthy = await server.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(healthy.body).checks.llm.status).toBe('ok');

    resetHealthProbeCacheForTests();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'quota' });
    const failed = await server.inject({ method: 'GET', url: '/health' });
    expect(JSON.parse(failed.body).checks.llm.status).toBe('degraded');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
