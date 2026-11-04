import type { FastifyInstance } from 'fastify';
import { normalizeLlmBaseUrl } from '../integrations/llm/openai-compatible.js';
import type { DatabaseHealthRepository } from '../repositories/database-health.repository.js';
import { getAppVersion } from '../utils/app-version.js';
import { error, info } from '../utils/logger.js';

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

/**
 * A degraded dependency means "the process answers HTTP but cannot do the job"
 * — a missing LLM key, a placeholder DingTalk credential. Issue #218: `/health`
 * reported that as 200, so `docker compose` (which only looked at `r.ok`) showed
 * `healthy` for a deployment that could not hold a single interview.
 *
 * Two routes, two questions:
 *   - `/health`        liveness  — is the process up and talking? degraded is 200.
 *   - `/health/ready`  readiness — can it actually work? only `healthy` is 200.
 * Containers, orchestrators and monitors ask the second one; flipping `/health`
 * to 503 instead would have broken its documented use as an availability probe.
 */
export const READINESS_PATH = '/health/ready';

type HealthStatus = HealthResponse['status'];

/** Status code per route: liveness tolerates `degraded`, readiness does not. */
function statusCodeFor(status: HealthStatus, readiness: boolean): number {
  if (readiness) {
    return status === 'healthy' ? 200 : 503;
  }
  return status === 'unhealthy' ? 503 : 200;
}

let llmCacheTime: number | null = null;

/**
 * Drop the 60s LLM probe cache.
 *
 * Without this, a suite that asserts "no key means degraded" passes only by
 * ordering luck: an earlier `healthy` case caches its verdict for a minute and
 * every later assertion reads the cached `ok` instead of re-resolving the
 * configuration. Same shape as `resetCjkFontWarningForTests()` in
 * export.service.ts.
 */
export function resetHealthProbeCacheForTests(): void {
  llmCacheTime = null;
}

type LlmCheckResult = HealthResponse['checks']['llm'];

/** How long a successful LLM probe stays authoritative. */
const LLM_CACHE_MS = 60000;

const DEFAULT_LLM_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions';

interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Read LLM settings from the environment, or explain why they are unusable. */
function resolveLlmConfig(): LlmConfig | LlmCheckResult {
  const apiKey = firstEnv(['LLM_API_KEY', 'VOLCENGINE_API_KEY']);
  if (!apiKey) return { status: 'degraded', error: 'API key not configured' };

  const baseUrl =
    normalizeLlmBaseUrl(firstEnv(['LLM_BASE_URL', 'VOLCENGINE_BASE_URL'])) || DEFAULT_LLM_ENDPOINT;
  const model = firstEnv(['LLM_MODEL', 'VOLCENGINE_MODEL']);
  if (!model) {
    return { status: 'degraded', error: 'LLM model not configured', endpoint: baseUrl };
  }
  return { apiKey, baseUrl, model };
}

/** The first non-empty environment value among `names`, or `''`. */
function firstEnv(names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return '';
}

function isLlmConfig(value: LlmConfig | LlmCheckResult): value is LlmConfig {
  return 'apiKey' in value;
}

/**
 * Turn a non-2xx response into a degraded result, appending a short body snippet
 * so operators can tell a misconfigured URL from an auth/quota failure (issue
 * #189).
 */
async function degradeFromResponse(
  response: Response,
  latencyMs: number,
  baseUrl: string
): Promise<LlmCheckResult> {
  let detail: string | undefined;
  try {
    const snippet = await response.text();
    if (snippet) detail = snippet.slice(0, 200);
  } catch {
    // ignore — detail is best-effort
  }

  const result: LlmCheckResult = {
    status: 'degraded',
    latencyMs,
    error: `HTTP ${response.status}`,
    endpoint: baseUrl,
  };
  if (detail) result.detail = detail;
  return result;
}

async function checkLLM(): Promise<LlmCheckResult> {
  if (isLlmCacheFresh()) return { status: 'ok' };

  const config = resolveLlmConfig();
  if (!isLlmConfig(config)) return config;

  try {
    const { response, latencyMs } = await probeLlm(config);
    if (!response.ok) return degradeFromResponse(response, latencyMs, config.baseUrl);
    llmCacheTime = Date.now();
    return { status: 'ok', latencyMs, endpoint: config.baseUrl };
  } catch (e) {
    return classifyLlmError(e);
  }
}

/**
 * Whether the last successful probe is still authoritative.
 *
 * Cached because /health is polled by the container healthcheck every few
 * seconds: without this, a 30s LLM timeout per probe would exhaust the provider
 * quota on health checks alone.
 */
function isLlmCacheFresh(): boolean {
  if (!llmCacheTime) return false;
  return Date.now() - llmCacheTime < LLM_CACHE_MS;
}

/** Issue the probe request and time it. */
async function probeLlm(config: LlmConfig): Promise<{ response: Response; latencyMs: number }> {
  const start = Date.now();
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'health check' }],
      max_tokens: 10,
    }),
    signal: AbortSignal.timeout(30000),
  });
  return { response, latencyMs: Date.now() - start };
}

/**
 * Classify a thrown probe failure.
 *
 * A timeout is `degraded`, not `error`: the endpoint is reachable and correctly
 * configured, it is merely slow. Anything else is a hard `error` and is logged,
 * because a DNS failure or a revoked key needs an operator rather than patience.
 */
function classifyLlmError(e: unknown): LlmCheckResult {
  const errMsg = e instanceof Error ? e.message : 'Unknown error';
  if (errMsg.includes('timeout') || errMsg.includes('abort')) {
    return { status: 'degraded', error: 'timeout' };
  }
  error('LLM health check failed', { error: errMsg });
  return { status: 'error', error: errMsg };
}

async function checkDingTalk(): Promise<{
  status: 'ok' | 'error' | 'degraded';
  error?: string;
}> {
  // Check Stream mode configuration (Stream client uses WebSocket, not webhook URL)
  const credentials = {
    clientId: process.env['DINGTALK_CLIENT_ID'],
    clientSecret: process.env['DINGTALK_CLIENT_SECRET'],
    agentId: process.env['DINGTALK_AGENT_ID'],
  };

  if (hasMissingCredential(credentials)) {
    return {
      status: 'degraded',
      error:
        'DingTalk Stream credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or AGENT_ID)',
    };
  }

  // A placeholder is worse than an empty value: the deployment LOOKS configured,
  // so it is reported as degraded rather than silently treated as absent.
  if (hasPlaceholder(credentials)) {
    return { status: 'degraded', error: 'DingTalk Stream credentials contain placeholder values' };
  }

  return { status: 'ok' };
}

/** True when any required DingTalk credential is absent. */
function hasMissingCredential(creds: Record<string, string | undefined>): boolean {
  return Object.values(creds).some((value) => !value);
}

/**
 * True when a credential still carries the `xxx` placeholder from a sample file.
 *
 * Only the two secrets are checked; the agent id is an opaque number and an `xxx`
 * in it would be a typo rather than a copied template.
 */
function hasPlaceholder(creds: {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
}): boolean {
  const values = [creds.clientId, creds.clientSecret];
  return values.some((value) => value?.includes('xxx'));
}

/**
 * Run the three probes once and classify the deployment.
 *
 * `unhealthy` is reserved for a failing database: without it the process cannot
 * serve anything. Every other failing dependency degrades the deployment — it
 * still answers HTTP, it just cannot do the job.
 */
async function probeHealth(databaseHealth: DatabaseHealthRepository): Promise<HealthResponse> {
  const [dbCheck, llmCheck, dingtalkCheck] = await Promise.all([
    databaseHealth.check(),
    checkLLM(),
    checkDingTalk(),
  ]);

  const dbOk = dbCheck.status === 'ok';
  const dependenciesOk = dbOk && llmCheck.status === 'ok' && dingtalkCheck.status === 'ok';

  let status: HealthStatus;
  if (!dbOk) {
    status = 'unhealthy';
  } else if (dependenciesOk) {
    status = 'healthy';
  } else {
    status = 'degraded';
  }

  return {
    status,
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
    checks: {
      db: dbCheck,
      llm: llmCheck,
      dingtalk: dingtalkCheck,
    },
  };
}

export async function healthRoutes(
  fastify: FastifyInstance,
  opts: { databaseHealth: DatabaseHealthRepository }
) {
  // Liveness: 200 for healthy and degraded, 503 only when the DB is down.
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    info('Health check requested');
    const response = await probeHealth(opts.databaseHealth);
    // Never cached: a stale `healthy` is exactly the failure this route exists
    // to prevent (a monitor caching 200 while the deployment is broken).
    return reply
      .header('Cache-Control', 'no-store')
      .status(statusCodeFor(response.status, false))
      .send(response);
  });

  // Readiness: 200 only when every check passes, 503 otherwise. This is what
  // container healthchecks, orchestrators and uptime monitors should poll.
  fastify.get<{ Reply: HealthResponse }>(READINESS_PATH, async (_request, reply) => {
    const response = await probeHealth(opts.databaseHealth);
    return reply
      .header('Cache-Control', 'no-store')
      .status(statusCodeFor(response.status, true))
      .send(response);
  });
}
