# Code Walkthrough — Stage B + M4 + M5 changeset (Prisma 6→7, issue #149) — Round 3

## Scope

- Repo: dialog-survey · Branch: sprint/2026-09-29-01
- Range: `eb707f9` → `194c9c3` (6 commits, 27 files, +587/−299)
- Previously walked: `0820555^` → `eb707f9` (Stage A, APPROVED 0.9233 @ R3) — already reviewed, not re-opened here
- This artifact covers everything since: spike argv fix, Stage B (PGlite test base + CI without PostgreSQL), M4 (release chain), M5 (governance + docs), and the R1→R2 walkthrough fixes.

| Commit | Milestone | Summary |
|---|---|---|
| `ad63e58` | spike fix | `db push` argv split + expected-failure exit semantics in `tools/spike/prisma7-pglite-spike.mjs` |
| `d413056` | M3/S3 Stage B | PGlite test base (per-file WASM database), `test-db.ts` rewrite, `global-setup`, CI `pr.yml` 7 jobs without PG service |
| `d85167c` | M4/S4 | release chain: Docker runner `public/` + `prisma.config.ts`, `cli.mjs`/`deploy.sh` Node alignment, `PRISMA_SKIP_GENERATE=1` db push pin, node-fetch healthcheck |
| `9dda5c3` | M5/S5 | `architecture.yaml` generated layer; `biome.json` files.ignore completion; docs refresh (AGENTS/README×2/DEPLOY/setup-guide/CHANGELOG) |
| `cdffb69` | walkthrough R2 fixes | PGlite template fallback hardening (`templateDisabled` latch + guarded read), lifecycle doc note, DEPLOY.md `ENCRYPTION_KEY` deprecation |
| `194c9c3` | walkthrough R3 fixes | fallback latch stderr diagnostic; AGENTS.md CI wording (6 consuming jobs, security-scan static-only) |

### R1 → R2 response (per-concern disposition)

Round 1 result: 3/3 experts APPROVED (architecture 0.95 / technical 0.75 / feasibility 0.78), aggregate REQUEST_CHANGES (mean 0.8267 < 0.90). Every R1 concern, with its disposition:

**Fixed in `cdffb69`**
- (technical-M1) poisoned `templatePromise` on the fallback path → `templateDisabled` latch: after a failed template init, later instances in the same process skip the memoized bad blob and go straight to the DDL-replay path.
- (feasibility-min2) `existsSync`/`readFileSync` race in `loadOrBuildTemplate` → read wrapped in try/catch, falls through to rebuild.
- (technical-M3) divergent lifecycle contracts between `test-db.ts` and `create-test-prisma.ts` → documented in the `createTestPrisma` docstring.
- (technical-min5 / feasibility-min1 name clause) DEPLOY.md `ENCRYPTION_KEY` vs setup-guide inconsistency → DEPLOY.md now lists it as optional/deprecated (not read at runtime), matching `docs/setup-guide.md` and `.env.example`.
- (technical-M2) stale-template cleanup comment → corrected ("cleanup deferred to the next successful write").
- (feasibility-min1 / technical-M5 evidence clause) "each of the 7 jobs runs `npx prisma generate`" was overstated → corrected below to 6 consuming jobs (security-scan runs no project code).

**Evidence added for R1 gaps**
- (feasibility-M2, MUST AC-PRISMA7-003-02 timing) probe executed against the shipped helper — `.sprint-state/phase-outputs/ac003-timing-and-memory-evidence.md`: cold first setup **3654 ms ≤ 5000 ms** (of which `prisma migrate diff` subprocess 1893 ms); warm p95 **230 / 232 ms ≤ 2000 ms** (n=20 × 2 processes); warm fresh-process first call 368–383 ms.
- (technical-M4, e2e memory) full e2e set with a process-tree sampler: peak **4441.8 MB** = node 2368.5 MB (5 procs) + chrome-headless-shell 2073.3 MB (20 procs); 11/11 files, 78 tests, EXIT=0 — no OOM (host 31.7 GB; CI 7 GB runner confirmation pending first PR run).
- (technical-M5 / feasibility-min1 branch-protection clause) the stale job names ARE pinned as required checks — verified `gh api repos/:owner/:repo/branches/master/protection`: exact contexts include `Unit Tests (mock, PrismaClient init needs DB)` and `Integration Tests (real PostgreSQL)`, `strict: true` → rename deferred as a coordinated change (see Recorded non-blocking items).

**Responded without code change** (evidence + rationale)
- (technical-M8 / feasibility-min5) `prisma:generate` script and `prisma.config.ts` in npm `files`: both present in `package.json` at HEAD (`"prisma:generate": "prisma generate"`; `files` includes `prisma.config.ts`) — unchanged by this range, verifiable in-repo.
- (architecture-min3) `npx prisma@7.10.0 db push` pin: `package.json` devDependency `prisma` is exactly `7.10.0` — the pin mirrors the validated version; #152 replaces `db push` with `migrate`.
- (architecture-min2 / technical-M7) Docker healthcheck: `--timeout=3s --start-period=5s --retries=3` predates this sprint (#57); M4 swapped only the probe (`curl` → `node fetch`, curl absent in node:20-alpine). `/health` probes: db `SELECT 1` (fast), LLM cached 60 s after success with a 30 s internal abort, DingTalk config-only (no network).
- (technical-min4) biome ignore scope: the 2 pre-fix `biome check` errors were in build output (`dist/src/server.d.ts`) and the generated `.architecture-baseline.json` — not masked source issues.
- (feasibility-min4) archlint 208 → 219 delta reconciled in `.sprint-state/phase-outputs/m5-archlint-evidence.md` §3: +11 low/medium test-domain smells (Unused Class Method +2, Unused file +3, Side-Effect Import +1, File length +1, complexity +2 incl. new cli e2e fn `c11_freshInstall`); High/Critical pair-diff 0 new / 0 lost.
- (technical-min7) spike `EXPECTED_FAILS` `PASS` vs `PASS#` nuance — spike harness only, non-blocking.
- (architecture-min1) parallel cold template builds across first-run workers: worst case one build per worker before process-level memoization; measured cold path is a single 3654 ms build; lock/single-writer optimization deferred as non-blocking.
- (feasibility-M1) no real-PG path in CI — spec-sanctioned (REQ-PRISMA7-003/004); tracked residual risk with a suggested nightly real-PG job.
- (feasibility-M3) executed-CI evidence — the first green run inherently requires a push; tracked post-push (PR CI + M1-CI backfill).

### R2 → R3 response

Round 2 result: 3/3 experts APPROVED (architecture 0.95 / technical 0.85 / feasibility 0.87), aggregate REQUEST_CHANGES (mean 0.89 < 0.90). The R2 feedback confirmed every R1 concern closed (technical: "Every R1 concern is either fixed in cdffb69 or answered with concrete evidence"; feasibility: all R1 majors closed, confidence 7→8); the sub-threshold mean reflected residual **post-push verification dependencies** plus two in-repo nits — now fixed:

**Fixed in `194c9c3`**
- (R2 feasibility-min1) AGENTS.md still claimed "every job runs `npx prisma generate`" → corrected to "the 6 consuming jobs run `npx prisma generate` before tsc/vitest (security-scan is static-only)".
- (R2 architecture-min1 / technical-M1 observability clause) the `templateDisabled` latch was silent → one-time stderr diagnostic when the latch trips; fallback behavior unchanged; helper contract tests re-run green.

**Post-push verification plan (SHIP gates — inherently not closable pre-push)**
- First PR run: all 7 jobs green on ubuntu with the reworked workflows, including the e2e job (AC "no OOM" clause on the CI runner) — tracked as the M1-CI backfill task and Phase-5 PR checks.
- Branch-protection rename decision (stale job names pinned as exact required contexts): surfaced to the repo owner at the SHIP user gate as a coordinated shared-infra change.

**Reaffirmed dispositions (unchanged from R2, evidence above)**
- Consumer-job generate placement (6/6 verified in pr.yml) · AC-PRISMA7-003-02 timing (cold 3654 ms, warm p95 230–232 ms) · e2e peak 4441.8 MB no-OOM locally · healthcheck timeouts pre-existing (#57); M4 only swapped curl→fetch · spike-harness nuances · no real-PG CI path spec-sanctioned with a nightly-job follow-up.

## Change detail by milestone

### Stage B — PostgreSQL-free test base (d413056)
- `tests/helpers/pglite-template.ts` (new): PGlite (WASM Postgres) template — DDL produced once via `prisma migrate diff` and cached under `node_modules/.cache/dialog-survey/` keyed by schema hash; per-test-file isolated instance cloned from the cached data dir; explicit dispose semantics. R2 revision adds the `templateDisabled` failure latch + guarded template read.
- `tests/helpers/test-db.ts`: rewritten from real-PG shared DB to PGlite template clones; `getSharedTestPrisma()` now DB-free; teardown adjusted.
- `tests/helpers/create-test-prisma.ts`: test client construction via PGlite adapter.
- `tests/global-setup.ts`: runs `prisma generate` once when `src/generated/prisma` is missing (cold checkout support).
- `vitest.config.ts`: globalSetup wiring + coverage exclude for generated client.
- `.github/workflows/pr.yml`: PostgreSQL service removed; 6 consuming jobs run `npx prisma generate` (security-scan is static-only and needs no generated client); e2e job = PGlite + real chromium.
- `tests/pglite-template.test.ts` (new contract tests), `tests/cli.test.ts` additions, small call-site fixes (admin-tree, server-lifecycle, e2e-server, cli-install e2e).

### M4 — release chain (d85167c)
- `Dockerfile` / `.dockerignore` / `docker-compose.yml`: runner image ships `public/` + `prisma.config.ts`; Node aligned to 20.19; node-fetch healthcheck (replaces curl).
- `scripts/cli.mjs`: Node >= 20.19 check; `prisma db push` invocation pinned with `prisma@7.10.0` + `PRISMA_SKIP_GENERATE=1`; installer steps adjusted.
- `scripts/deploy.sh`: Node version check aligned.
- `.github/workflows/publish.yml`: generate-step alignment.

### M5 — governance & docs (9dda5c3)
- `architecture.yaml`: new `generated` layer, `utils → generated` dependency (facade/factory ownership comments).
- `biome.json`: `files.ignore` completed (`dist/ build/ coverage/ .architecture-baseline.json`) — repo-wide `biome check` goes from 2 errors → 0.
- Docs: AGENTS.md / README.md / README.zh-CN.md / DEPLOY.md / docs/setup-guide.md / CHANGELOG.md refreshed (Prisma 7 facade+factory, PGlite no-PG tests, Node >= 20.19, env-var table corrections: removed dead `PUBLIC_URL`/`MAX_LLM_RETRIES`, added real admin/session vars).

## Verification evidence

- **Stage B**: full suite with **no PostgreSQL** — 117/117 files, 1266 passed | 1 skipped, EXIT=0; memory probe log; template contract tests.
- **R2 fix batch (`cdffb69`)**: targeted suites (`pglite-template.test.ts`, `create-test-prisma.test.ts`) 6/6 pass; `tsc --noEmit` clean; biome clean; 12-gate pre-commit hook PASS (10 pass / 2 skip, 8.3/10).
- **R3 fix batch (`194c9c3`)**: same targeted suites 6/6 pass after the stderr diagnostic; `tsc --noEmit` + biome clean; 12-gate pre-commit hook PASS (11 pass / 1 skip, 9.2/10).
- **AC-PRISMA7-003-02**: cold 3654 ms / warm p95 230–232 ms (n=20×2) against the shipped helper; full e2e peak 4441.8 MB with no OOM — `.sprint-state/phase-outputs/ac003-timing-and-memory-evidence.md`.
- **CI**: `pr.yml` has no postgres service; 6 consuming jobs run `npx prisma generate` before tsc/vitest; e2e job runs `npx playwright install --with-deps chromium` then `vitest run tests/e2e/*.e2e.test.ts`; e2e suite also executed locally — 11/11 files, 78 tests, EXIT=0 (25.8 s).
- **M4**: `npm pack` listing, builder-sim (simulated fresh install) log, docker-build baseline log; health endpoint contract verified against `src/api/health.ts` (200 healthy/degraded, 503 unhealthy).
- **M5**: archlint master vs worktree — 208 vs 219 smells, 10 vs 10 High/Critical, **pair-diff: 0 new / 0 lost**; `biome check` EXIT=0; `biome lint src` + `tsc --noEmit` clean.
- **Hook gates on final commit** `194c9c3`: 12-gate pre-commit chain PASS (11 pass / 1 skip, 9.2/10), Gate 11 Sprint Flow = delphi approval verified.

## Review focus (Round 3)

1. Are all R2 concerns resolved — fixed in `194c9c3` (verify against the diff) or covered by the post-push verification plan above?
2. Confirm the `194c9c3` diff (stderr diagnostic + AGENTS.md wording) is behavior-neutral for the fallback path.
3. Any remaining blocker to APPROVED at ≥ 0.90 consensus?

## Recorded non-blocking items (already tracked — do not re-report as new)

- `tools/spike/prisma7-pglite-spike.mjs` `c11_freshInstall` complexity — spike harness, not shipped code.
- `ecosystem.config.cjs` script path `dist/server.js` vs actual `dist/src/server.js` — design §1.3 explicitly record-only.
- README version badge (1.8.1 vs VERSION 1.8.9) — handed to issue #153 (version automation).
- Pre-commit biome `--staged` quirk on docs-only commits (global xp-gate hook) — mitigated repo-side via biome.json; tracked for CLOSE.
- Stale CI job names vs pinned branch-protection contexts — rename requires a coordinated branch-protection update; deferred, to be escalated at SHIP.
- No real-PG path in CI (spec-sanctioned) — residual risk; suggested follow-up: nightly real-PG job.
- Executed-CI green run + CI-runner memory confirmation — inherently post-push; tracked (PR run + M1-CI backfill).
