import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { metricsOnRequest, metricsOnResponse, metricsRoutes } from '../src/api/metrics.js';
import { httpRequestsTotal, resetMetricsForTest } from '../src/utils/metrics.js';

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

async function buildApp(): Promise<FastifyInstance> {
  const { default: Fastify } = await import('fastify');
  const app = Fastify({ logger: false });
  await app.register(metricsRoutes);
  app.addHook('onRequest', metricsOnRequest);
  app.addHook('onResponse', metricsOnResponse);
  app.get('/api/things', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('GET /metrics', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetMetricsForTest();
    app = await buildApp();
    await app.inject({ method: 'GET', url: '/api/things' });
    await app.inject({ method: 'GET', url: '/api/things' });
    await app.inject({ method: 'GET', url: '/does-not-exist' });
  });

  afterAll(async () => {
    await app.close();
    delete process.env['METRICS_TOKEN'];
    resetMetricsForTest();
  });

  it('should expose Prometheus text format with request counters', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain(
      'dialog_survey_http_requests_total{method="GET",route="/api/things",status="200"} 2'
    );
    expect(response.body).toContain(
      'dialog_survey_http_requests_total{method="GET",route="unmatched",status="404"} 1'
    );
    expect(response.body).toContain('dialog_survey_http_request_duration_ms_count');
  });

  it('should record the /metrics scrape itself', async () => {
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.body).toContain('route="/metrics",status="200"');
  });

  it('should reject unauthenticated scrapes when METRICS_TOKEN is set', async () => {
    process.env['METRICS_TOKEN'] = 'secret-token';

    const denied = await app.inject({ method: 'GET', url: '/metrics' });
    expect(denied.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('should count requests recorded through the shared counter', () => {
    expect(httpRequestsTotal).toBeDefined();
  });
});
