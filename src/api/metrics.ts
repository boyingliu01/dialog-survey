import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  FastifyInstance,
  FastifyRequest,
  onRequestHookHandler,
  onResponseHookHandler,
} from 'fastify';
import { warn } from '../utils/logger.js';
import { httpRequestDurationMs, httpRequestsTotal, renderPrometheus } from '../utils/metrics.js';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

const elapsedStart = new WeakMap<FastifyRequest, bigint>();

/**
 * onRequest/onResponse hook pair recording per-request metrics.
 *
 * Registered at the ROOT Fastify context (see server.ts) so every route
 * registered in child plugins is covered. Labels are bounded: method +
 * route pattern (Fastify route URL, not raw path — no request ids, no
 * query strings, no PII). Unmatched requests are labeled `unmatched`.
 * Requests to /metrics itself are not counted — scrape frequency would
 * otherwise pollute the request counters (code-walkthrough F9).
 */
export const metricsOnRequest: onRequestHookHandler = async (request) => {
  elapsedStart.set(request, process.hrtime.bigint());
};

export const metricsOnResponse: onResponseHookHandler = async (request, reply) => {
  const route = request.routeOptions?.url ?? 'unmatched';
  if (route === '/metrics') {
    return;
  }
  const labels = { method: request.method, route, status: String(reply.statusCode) };
  httpRequestsTotal.inc(labels);
  const start = elapsedStart.get(request);
  if (start !== undefined) {
    httpRequestDurationMs.observe(labels, Number(process.hrtime.bigint() - start) / 1e6);
  }
};

/** Length-independent comparison: hash both sides to equal length first. */
function bearerTokenMatches(headerValue: string | undefined, token: string): boolean {
  if (headerValue === undefined) {
    return false;
  }
  const provided = createHash('sha256').update(headerValue).digest();
  const expected = createHash('sha256').update(`Bearer ${token}`).digest();
  return timingSafeEqual(provided, expected);
}

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  // Read once at registration; empty string means "no auth" (same as unset).
  // Changing METRICS_TOKEN requires a process restart.
  const token = process.env['METRICS_TOKEN'] ?? '';
  if (!token && process.env['NODE_ENV'] === 'production') {
    warn('/metrics is unauthenticated; set METRICS_TOKEN or restrict access at the network layer');
  }

  fastify.get('/metrics', async (request, reply) => {
    if (token && !bearerTokenMatches(request.headers.authorization, token)) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    return reply.header('content-type', PROMETHEUS_CONTENT_TYPE).send(renderPrometheus());
  });
}
