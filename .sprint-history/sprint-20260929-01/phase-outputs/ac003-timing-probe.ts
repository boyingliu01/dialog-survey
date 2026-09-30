/**
 * AC-PRISMA7-003-02 timing probe against the shipped helper.
 *
 *   npx tsx .sprint-state/phase-outputs/ac003-timing-probe.ts <cold|warm|ddl> [n]
 *
 * cold: deletes node_modules/.cache/dialog-survey, then times the first
 *       createTestPglite() — includes the `prisma migrate diff` subprocess,
 *       template build (DDL apply + dumpDataDir) and first PGlite boot.
 * warm: cache present; times a fresh-process first call (disk read + boot)
 *       and n memoized per-instance boots.
 * ddl:  cache deleted; times getTestSchemaDdl() alone (subprocess only).
 *       Run last so it does not disturb warm samples.
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestPglite, getTestSchemaDdl } from '../../tests/helpers/pglite-template.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey');

const mode = process.argv[2];
const n = Number(process.argv[3] ?? 20);
if (mode !== 'cold' && mode !== 'warm' && mode !== 'ddl') {
  throw new Error(`unknown mode: ${String(mode)}`);
}

if (mode === 'cold') {
  rmSync(CACHE_DIR, { recursive: true, force: true });
  const t0 = performance.now();
  const db = await createTestPglite();
  const ms = performance.now() - t0;
  await db.close();
  console.log(JSON.stringify({ mode, coldFirstSetupMs: Math.round(ms) }));
} else if (mode === 'ddl') {
  rmSync(CACHE_DIR, { recursive: true, force: true });
  const t0 = performance.now();
  await getTestSchemaDdl();
  const ms = performance.now() - t0;
  console.log(JSON.stringify({ mode, ddlSubprocessMs: Math.round(ms) }));
} else {
  const t0 = performance.now();
  const first = await createTestPglite();
  await first.close();
  const firstInProcessMs = Math.round(performance.now() - t0);
  const times: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = performance.now();
    const db = await createTestPglite();
    times.push(performance.now() - t);
    await db.close();
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] ?? 0;
  console.log(
    JSON.stringify({
      mode,
      n,
      freshProcessFirstCallMs: firstInProcessMs,
      timesMs: sorted.map((v) => Math.round(v)),
      p95Ms: Math.round(p95),
    })
  );
}
