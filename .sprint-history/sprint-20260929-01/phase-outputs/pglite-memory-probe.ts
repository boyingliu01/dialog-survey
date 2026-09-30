/**
 * T-M4 / T-m3 memory probes for the PGlite test substrate (DD-005, design §3.6 / §4.1 #12).
 *
 * T-M4: maximum number of simultaneously-alive PGlite+Prisma instances inside ONE process
 *       (worst-case single test file) — measures per-instance RSS cost until a safety cap.
 * T-m3: RSS curve of a single worker walking N sequential file lifecycles
 *       (setup = createTestPglite() + new PrismaClient(adapter); teardown = $disconnect + close)
 *       — detects per-file leaks and establishes steady-state worker RSS for the maxWorkers decision.
 *
 * Run:  npx tsx .sprint-state/phase-outputs/pglite-memory-probe.ts [--cycles=N] [--max=N]
 * Best run WITHOUT a concurrent test suite so timings are not skewed.
 */
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '../../src/utils/prisma-client.js';
import { createTestPglite } from '../../tests/helpers/pglite-template.js';

const toMB = (bytes: number): number => Math.round((bytes / 1024 / 1024) * 10) / 10;
const rssMB = (): number => toMB(process.memoryUsage().rss);
const memLine = (): string => {
  const usage = process.memoryUsage();
  return `RSS=${toMB(usage.rss)}MB heap=${toMB(usage.heapUsed)}MB ext=${toMB(usage.external)}MB`;
};
const log = (label: string): void => console.log(`[mem] ${label.padEnd(34)} ${memLine()}`);

const argValue = (name: string, fallback: number): number => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

interface LiveInstance {
  pglite: PGlite;
  prisma: PrismaClient;
}

async function startLifecycle(): Promise<LiveInstance> {
  const pglite = await createTestPglite();
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
  await prisma.$queryRawUnsafe('SELECT 1');
  return { pglite, prisma };
}

async function stopLifecycle({ pglite, prisma }: LiveInstance): Promise<void> {
  await prisma.$disconnect();
  await pglite.close();
}

async function probeMaxAlive(): Promise<void> {
  console.log('\n=== T-M4: max simultaneously-alive instances in ONE process ===');
  const MAX = argValue('max', 16);
  const SAFETY_CAP_MB = 3500;
  const gc = typeof (globalThis as { gc?: () => void }).gc === 'function' ? ' (--expose-gc)' : '';
  console.log(`[mem] config: max=${String(MAX)} safetyCap=${String(SAFETY_CAP_MB)}MB${gc}`);
  log('baseline');
  const alive: LiveInstance[] = [];
  try {
    for (let i = 1; i <= MAX; i += 1) {
      const before = rssMB();
      const started = Date.now();
      alive.push(await startLifecycle());
      const perInstance = rssMB() - before;
      log(`instance ${String(i).padStart(2)} alive (+${String(perInstance)}MB, ${String(Date.now() - started)}ms)`);
      if (rssMB() > SAFETY_CAP_MB) {
        console.log(`[mem] safety cap ${String(SAFETY_CAP_MB)}MB hit after ${String(i)} instances`);
        break;
      }
    }
  } finally {
    for (const instance of alive) await stopLifecycle(instance);
    log('after teardown of all');
  }
}

async function probeSequentialLifecycles(): Promise<void> {
  console.log('\n=== T-m3: single-worker sequential file lifecycles (RSS curve) ===');
  const CYCLES = argValue('cycles', 30);
  console.log(`[mem] config: cycles=${String(CYCLES)} (≈105 test files / 4 workers ≈ 27 files per worker)`);
  log('baseline');
  let firstCycleRss = 0;
  for (let i = 1; i <= CYCLES; i += 1) {
    const started = Date.now();
    const instance = await startLifecycle();
    await stopLifecycle(instance);
    if (i === 1) firstCycleRss = rssMB();
    log(`after lifecycle ${String(i).padStart(2)} (${String(Date.now() - started)}ms)`);
  }
  const last = rssMB();
  log('end');
  console.log(
    `[mem] drift: first-cycle=${String(firstCycleRss)}MB -> last=${String(last)}MB ` +
      `(Δ=${String(Math.round((last - firstCycleRss) * 10) / 10)}MB over ${String(CYCLES - 1)} cycles)`
  );
}

await probeMaxAlive();
await probeSequentialLifecycles();
console.log('\n[mem] probe complete');
