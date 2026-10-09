// @no-test-required: manually/CI-driven harness; its correctness gate is the loadtest run itself (npm run loadtest)
import type { AutocannonOptions, AutocannonResult } from 'autocannon';
import type { BootedLoadtestApp } from './boot-loadtest-app.js';

/**
 * Loadtest runner (REQ-180 / DR-001 / design.md §Slice B).
 *
 * Usage:
 *   npm run loadtest [-- --quick]
 *
 * - S1-S5 are driven by autocannon (in-process, pure JS — chosen over k6/
 *   artillery because this machine blocks node-initiated child processes,
 *   see DR-001) over real loopback TCP against the booted production app.
 * - S6 drives the DingTalk message handler chain in-process (no HTTP hop,
 *   no spawn): auth/dedup/session/DB-write/reply-assembly, with the LLM on
 *   its credential-free fallback path and the outbound webhook stubbed by
 *   the SSRF allowlist (a .invalid URL fails fast without network I/O).
 * - Every scenario runs a warmup pass whose results are discarded (the
 *   first 5 s of a fresh tier are never measured), then the measured pass.
 *
 * Output: stdout table + docs/reports/loadtest-results-<timestamp>.json.
 * PGlite numbers are a relative-regression baseline only (single process,
 * no network, no pool); absolute sizing authority is the CI loadtest job
 * with real PostgreSQL (LOADTEST_USE_REAL_PG=1) and issue #183.
 */
interface ScenarioResult {
  scenario: string;
  tier: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errors: number;
  non2xx: number;
  seconds: number;
}

interface LoadtestReport {
  meta: {
    timestamp: string;
    db: 'pglite' | 'postgres';
    node: string;
    durationSec: number;
    warmupSec: number;
    tiers: number[];
    notes: string[];
  };
  results: ScenarioResult[];
  s6?: {
    tiers: Array<{
      tier: number;
      handlerCalls: number;
      rps: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
      successRate: number;
    }>;
  };
}

const FULL_TIERS = [10, 50, 100, 200];
const QUICK_TIERS = [10, 50];

function parseArgs(): { quick: boolean } {
  return { quick: process.argv.includes('--quick') };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * autocannon v8 latency histogram has no p95 bucket (nearest: p90, p97_5);
 * interpolate linearly between the two adjacent quantiles.
 */
function interpolateP95(lat: AutocannonResult['latency']): number {
  const p90 = lat.p90 ?? 0;
  const p975 = lat.p97_5 ?? p90;
  return p90 + ((95 - 90) / (97.5 - 90)) * (p975 - p90);
}

type AutocannonFn = (
  opts: AutocannonOptions,
  cb: (err: Error | null, result: AutocannonResult) => void
) => unknown;

const WARMUP_SEC = 5;

async function runAutocannonScenario(
  autocannon: AutocannonFn,
  scenario: string,
  tier: number,
  durationSec: number,
  baseOpts: Omit<AutocannonOptions, 'connections' | 'duration'>
): Promise<ScenarioResult> {
  const run = (tierConnections: number, duration: number): Promise<AutocannonResult> =>
    new Promise((resolve, reject) => {
      autocannon({ ...baseOpts, connections: tierConnections, duration }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

  // Warmup pass (5s) — discarded by design (skips JIT/socket/DB cold paths).
  await run(tier, WARMUP_SEC);
  const measured = await run(tier, durationSec);
  return {
    scenario,
    tier,
    rps: Math.round(measured.requests?.average ?? 0),
    p50Ms: Number((measured.latency?.p50 ?? 0).toFixed(2)),
    p95Ms: Number(interpolateP95(measured.latency).toFixed(2)),
    p99Ms: Number((measured.latency?.p99 ?? 0).toFixed(2)),
    errors: measured.errors ?? 0,
    non2xx: measured.non2xx ?? 0,
    seconds: durationSec,
  };
}

type ProcessMessageFn = (message: {
  data: string;
  headers: { messageId: string };
}) => Promise<{ success: boolean }>;

/** S6 — in-process handler-chain burst. Returns per-tier handler stats. */
async function runS6Tier(
  tier: number,
  durationSec: number,
  processMessage: ProcessMessageFn,
  runId: string,
  counter: { value: number }
): Promise<NonNullable<LoadtestReport['s6']>['tiers'][number]> {
  const latencies: number[] = [];
  let success = 0;
  let failure = 0;
  const endAt = Date.now() + durationSec * 1000;

  const worker = async (): Promise<void> => {
    while (Date.now() < endAt) {
      const n = counter.value++;
      const message = {
        headers: { messageId: `lt-${runId}-${n}` },
        data: JSON.stringify({
          senderStaffId: `loadtest-user-${n % tier}`,
          text: { content: '请简单介绍一下您的工作经历？' },
          // Disallowed host: the SSRF allowlist stubs the outbound reply
          // without any network I/O (fail-fast, zero sockets).
          sessionWebhook: 'https://stub.invalid/session-webhook',
        }),
      };
      const t0 = performance.now();
      try {
        const res = await processMessage(message);
        latencies.push(performance.now() - t0);
        if (res.success) success++;
        else failure++;
      } catch {
        // A genuine handler error counts as a failed call, never aborts the tier.
        latencies.push(performance.now() - t0);
        failure++;
      }
    }
  };

  await Promise.all(Array.from({ length: tier }, () => worker()));

  latencies.sort((a, b) => a - b);
  const total = success + failure;
  const rps = total / durationSec;
  return {
    tier,
    handlerCalls: total,
    rps: Math.round(rps),
    p50Ms: Number(percentile(latencies, 50).toFixed(2)),
    p95Ms: Number(percentile(latencies, 95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 99).toFixed(2)),
    successRate: total === 0 ? 0 : Number(((success / total) * 100).toFixed(2)),
  };
}

function writeOut(text: string): void {
  process.stdout.write(text);
}

async function runAllScenarios(
  app: BootedLoadtestApp,
  tiers: number[],
  durationSec: number
): Promise<LoadtestReport> {
  const authHeaders = { 'x-api-key': app.seed.apiKey };
  const metricsHeaders = { authorization: 'Bearer loadtest-metrics-token' };
  const postPlanBody = JSON.stringify({
    name: 'loadtest-plan-create',
    templateId: app.seed.templateId,
  });

  const [{ default: autocannon }] = await Promise.all([import('autocannon')]);

  const scenarios: Array<{
    name: string;
    opts: Omit<AutocannonOptions, 'connections' | 'duration'>;
  }> = [
    { name: 'S1-health', opts: { url: `${app.baseUrl}/health` } },
    {
      name: 'S2-metrics',
      opts: { url: `${app.baseUrl}/metrics`, headers: metricsHeaders },
    },
    {
      name: 'S3-template-list',
      opts: { url: `${app.baseUrl}/api/templates`, headers: authHeaders },
    },
    {
      name: 'S4-plan-detail',
      opts: { url: `${app.baseUrl}/api/plans/${app.seed.planId}`, headers: authHeaders },
    },
    {
      name: 'S5-plan-create',
      opts: {
        url: `${app.baseUrl}/api/plans`,
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: postPlanBody,
      },
    },
  ];

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    for (const tier of tiers) {
      writeOut(`[loadtest] ${scenario.name} tier=${tier} ...\n`);
      results.push(
        await runAutocannonScenario(autocannon, scenario.name, tier, durationSec, scenario.opts)
      );
    }
  }

  writeOut('[loadtest] S6 dingtalk-handler burst (in-process) ...\n');
  const { StreamMessageService } = await import('../../src/services/stream-message.service.js');
  const { InterviewStateRepository } = await import(
    '../../src/repositories/interview-state.repository.js'
  );
  const svc = new StreamMessageService(new InterviewStateRepository(app.prisma));
  const runId = Date.now().toString(36);
  const counter = { value: 0 };
  const s6Tiers: NonNullable<LoadtestReport['s6']>['tiers'] = [];
  for (const tier of tiers) {
    writeOut(`[loadtest] S6 tier=${tier} (warmup) ...\n`);
    await runS6Tier(
      tier,
      WARMUP_SEC,
      (m) => svc.processStreamMessage(m, 0, app.prisma),
      `${runId}-w`,
      counter
    );
    writeOut(`[loadtest] S6 tier=${tier} ...\n`);
    s6Tiers.push(
      await runS6Tier(
        tier,
        durationSec,
        (m) => svc.processStreamMessage(m, 0, app.prisma),
        runId,
        counter
      )
    );
  }

  return {
    meta: {
      timestamp: new Date().toISOString(),
      db: process.env['LOADTEST_USE_REAL_PG'] === '1' ? 'postgres' : 'pglite',
      node: process.version,
      durationSec,
      warmupSec: WARMUP_SEC,
      tiers,
      notes: [
        'PGlite runs in-process: client+server share one event loop/CPU; numbers are an upper-bound throughput / lower-bound latency baseline for relative regression only.',
        'S6 outbound DingTalk replies are stubbed via the SSRF allowlist; LLM runs the credential-free fallback path (LLM latency not included).',
        'Warmup passes (5 s per tier) are run and discarded before each measurement (S1-S6).',
        'Percentile provenance: S1-S5 p95 interpolated from the autocannon histogram (p90/p97_5); S6 nearest-rank over raw handler samples.',
      ],
    },
    results,
    s6: { tiers: s6Tiers },
  };
}

async function main(): Promise<void> {
  const { quick } = parseArgs();
  const tiers = quick ? QUICK_TIERS : FULL_TIERS;
  const durationSec = quick ? 8 : 30;

  writeOut('[loadtest] booting app (PGlite in-process; set LOADTEST_USE_REAL_PG=1 for real PG)\n');
  const { bootLoadtestApp } = await import('./boot-loadtest-app.js');
  const app = await bootLoadtestApp();
  writeOut(`[loadtest] app ready at ${app.baseUrl}\n`);

  let report: LoadtestReport;
  try {
    report = await runAllScenarios(app, tiers, durationSec);
  } finally {
    await app.close();
  }

  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const outDir = resolve(process.cwd(), 'docs/reports');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(
    outDir,
    `loadtest-results-${report.meta.timestamp.replaceAll(':', '-')}.json`
  );
  writeFileSync(outFile, JSON.stringify(report, null, 2));

  writeOut('\n=== Loadtest results ===\n');
  for (const r of report.results) {
    writeOut(
      `${r.scenario.padEnd(18)} tier=${String(r.tier).padEnd(4)} rps=${String(r.rps).padEnd(7)} p50=${String(r.p50Ms).padEnd(8)} p95=${String(r.p95Ms).padEnd(8)} p99=${String(r.p99Ms).padEnd(8)} err=${r.errors} non2xx=${r.non2xx}\n`
    );
  }
  for (const t of report.s6?.tiers ?? []) {
    writeOut(
      `S6-handler         tier=${String(t.tier).padEnd(4)} rps=${String(t.rps).padEnd(7)} p50=${String(t.p50Ms).padEnd(8)} p95=${String(t.p95Ms).padEnd(8)} p99=${String(t.p99Ms).padEnd(8)} ok=${t.successRate}%\n`
    );
  }
  writeOut(`\nJSON report: ${outFile}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[loadtest] FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
  );
  process.exitCode = 1;
});
