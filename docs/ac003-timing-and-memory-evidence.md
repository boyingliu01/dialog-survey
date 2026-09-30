# AC-PRISMA7-003-02 evidence — cold/warm timing + e2e memory peak (walkthrough R2)

> 2026-09-29/30 · Sprint #149 (Prisma 7) · Phase 4 VERIFY · closes R1 feasibility M2 + technical M4
>
> Committed copy (walkthrough final, T1): the numeric budgets live in this tracked file,
> not only in gitignored `.sprint-state/` output. The probe scripts/logs referenced below
> are working-session artifacts under `.sprint-state/phase-outputs/`.

## Environment

- Windows 10.0.26300 (Git Bash), Node v24.18.0, 31.7 GB RAM (12.8 GB free at run time)
- Probe target: shipped helper `tests/helpers/pglite-template.ts` (R1-fixed revision, pre-commit working tree)
- Caches: `node_modules/.cache/dialog-survey/` (DDL JSON + template tar), deleted for cold runs

## 1. Timing probe — `npx tsx .sprint-state/phase-outputs/ac003-timing-probe.ts <mode>`

Log: `.sprint-state/phase-outputs/ac003-timing-probe.log`

| Measure | Value | Budget | Verdict |
|---|---|---|---|
| **Cold first setup** (cache deleted → first `createTestPglite()`, includes `prisma migrate diff` subprocess + template build + first boot) | **3654 ms** | ≤ 5000 ms | **PASS** |
| DDL subprocess alone (cold cache, `getTestSchemaDdl()`) | 1893 ms | — (breakdown) | — |
| Template build + first boot (cold total − DDL subprocess) | ≈ 1761 ms | — (breakdown) | — |
| **Warm p95**, in-process memoized boots, n=20 × 2 processes | **230 ms / 232 ms** | ≤ 2000 ms | **PASS** |
| Warm fresh-process first call (disk tar read + boot) — represents a new vitest worker | 383 ms / 368 ms | ≤ 2000 ms | **PASS** |

Warm samples were tightly clustered (209–263 ms across both runs); no retry/outlier tail.

## 1b. Contention caveat — warm p95 under the FULL parallel suite (Phase 4, 2026-09-30)

A first draft of `tests/prisma7-spec-invariants.test.ts` asserted the warm p95 ≤ 2 s budget
in-suite. Under `fileParallelism: true` + `maxWorkers = 4` with the e2e/chromium files running
concurrently, the same measurement came out **2356 ms and 2712 ms** (vitest `retry: 1` re-ran it
once; both attempts exceeded budget) while the identical assertion in isolation measured ~230 ms.

- Cause: wall-clock boot latency of a WASM instance under CPU/IO contention, not a change in the
  mechanism (template memoization and disk-tar reuse still hit).
- Consequence: the numeric SLA is **not** assertable inside the parallel suite. The in-repo test
  asserts the mechanism instead (one memoized template Blob per process + that template carries
  the schema, i.e. `template.count() === 0` on a booted instance); the 5 s / 2 s budgets remain
  **isolated measurements** as tabulated above.
- Residual risk carried to SHIP/CLOSE: if the AC's warm p95 budget is meant to apply under CI
  parallelism, it is currently **unmet by observation** (2.4–2.7 s on a 12-core Windows host at
  full suite load) and must be confirmed on the ubuntu runner by the first PR run (task M1-CI
  backfill). Options if it must hold in-suite: raise `testTimeout`-independent budget to the
  measured contention band, or reserve the SLA for the cold-path contract it came from.

## 2. E2E memory probe — full e2e set with process-tree sampler

Command: `bash .sprint-state/phase-outputs/run-e2e-mem-probe.sh` (runs `vitest run tests/e2e/*.e2e.test.ts`;
sampler walks the vitest process tree every 500 ms and records peak total WorkingSet).
Logs: `e2e-memory-run.log`, `.e2e-mem-peak.txt` (2 runs)

| Run | Peak total | Split | Suite result |
|---|---|---|---|
| #1 | 4369.7 MB | (counts only: 5 node + 20 chrome-headless-shell) | 11/11 files, 78 tests, 25.8 s, EXIT=0 |
| #2 | **4441.8 MB** | **node.exe = 2368.5 MB (n=5) + chrome-headless-shell.exe = 2073.3 MB (n=20)** | 11/11 files, 78 tests, 25.9 s, EXIT=0 |

- Node side: vitest main + 4 workers (maxWorkers = min(4, cpus)) with in-process PGlite instances → ~474 MB/process avg.
- Browser side: 20 headless-shell processes → ~104 MB each; this is the pre-existing Playwright cost, not PGlite.
- No OOM on a 31.7 GB host; peak 4.4 GB vs CI ubuntu 7 GB runner budget leaves ~2.6 GB headroom (Linux numbers subject to the first CI run — tracked post-push).
- Cross-ref: PGlite-only probes `T-M4`/`T-m3` (stageB-memory-probe.log) show per-instance ~210 MB and a stable single-worker RSS curve (Δ=15.8 MB over 29 lifecycles → no leak accumulation).

## Verdict

AC-PRISMA7-003-02 numeric SLAs are met on the shipped helper **measured in isolation**:
**cold ≤ 5 s (3654 ms) and warm p95 ≤ 2 s (230/232 ms, n=20×2)**; the full e2e job
(chromium + PGlite coexistence) completes with peak 4.4 GB and no OOM on a 31.7 GB host.
Scope of the claim is bounded by §1b: under full-suite parallelism the warm path measured
2.4–2.7 s, so the 2 s budget is verified only on an uncontended process and stays open for
CI confirmation.
