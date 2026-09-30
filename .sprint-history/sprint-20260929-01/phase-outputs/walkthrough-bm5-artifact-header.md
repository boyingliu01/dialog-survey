# Code Walkthrough — Stage B + M4 + M5 changeset (Prisma 6→7, issue #149)

## Scope

- Repo: dialog-survey · Branch: sprint/2026-09-29-01
- Range: `eb707f9` → `9dda5c3` (4 commits, 27 files, +570/−297)
- Previously walked: `0820555^` → `eb707f9` (Stage A, APPROVED 0.9233 @ R3) — **already reviewed, not re-opened here**
- This artifact covers everything since: spike argv fix, Stage B (PGlite test base + CI without PostgreSQL), M4 (release chain), M5 (governance + docs).

| Commit | Milestone | Summary |
|---|---|---|
| `ad63e58` | spike fix | `db push` argv split + expected-failure exit semantics in `tools/spike/prisma7-pglite-spike.mjs` |
| `d413056` | M3/S3 Stage B | PGlite test base (per-file WASM database), `test-db.ts` rewrite, `global-setup`, CI `pr.yml` 7 jobs without PG service |
| `d85167c` | M4/S4 | release chain: Docker runner `public/` + `prisma.config.ts`, `cli.mjs`/`deploy.sh` Node alignment, `PRISMA_SKIP_GENERATE=1` db push pin, healthcheck |
| `9dda5c3` | M5/S5 | `architecture.yaml` generated layer; `biome.json` files.ignore completion; docs refresh (AGENTS/README×2/DEPLOY/setup-guide/CHANGELOG) |

## Change detail by milestone

### Stage B — PostgreSQL-free test base (d413056)
- `tests/helpers/pglite-template.ts` (new, 205 lines): PGlite (WASM Postgres) template — DDL produced once via `prisma migrate diff` and cached under `node_modules/.cache/dialog-survey/` keyed by schema hash; per-test-file isolated instance cloned from the cached data dir; explicit dispose semantics.
- `tests/helpers/test-db.ts`: rewritten from real-PG shared DB to PGlite template clones; `getSharedTestPrisma()` now DB-free; teardown adjusted.
- `tests/helpers/create-test-prisma.ts`: test client construction via PGlite adapter.
- `tests/global-setup.ts`: runs `prisma generate` once when `src/generated/prisma` is missing (cold checkout support).
- `vitest.config.ts`: globalSetup wiring + coverage exclude for generated client.
- `.github/workflows/pr.yml`: PostgreSQL service removed; all 7 jobs run `npx prisma generate`; e2e job = PGlite + real chromium.
- `tests/pglite-template.test.ts` (new contract tests), `tests/cli.test.ts` additions, small call-site fixes (admin-tree, server-lifecycle, e2e-server, cli-install e2e).

### M4 — release chain (d85167c)
- `Dockerfile` / `.dockerignore` / `docker-compose.yml`: runner image ships `public/` + `prisma.config.ts`; Node aligned to 20.19; healthcheck exercises the full boot path.
- `scripts/cli.mjs`: Node >= 20.19 check; `prisma db push` invocation pinned with `PRISMA_SKIP_GENERATE=1`; installer steps adjusted.
- `scripts/deploy.sh`: Node version check aligned.
- `.github/workflows/publish.yml`: generate-step alignment.

### M5 — governance & docs (9dda5c3)
- `architecture.yaml`: new `generated` layer, `utils → generated` dependency (facade/factory ownership comments).
- `biome.json`: `files.ignore` completed (`dist/ build/ coverage/ .architecture-baseline.json`) — aligns with existing linter/formatter ignores; repo-wide `biome check` goes from 2 errors → 0.
- Docs: AGENTS.md / README.md / README.zh-CN.md / DEPLOY.md / docs/setup-guide.md / CHANGELOG.md refreshed (Prisma 7 facade+factory, PGlite no-PG tests, Node >= 20.19, env-var table corrections: removed dead `PUBLIC_URL`/`MAX_LLM_RETRIES`, added real admin/session vars).

## Verification evidence

- **Stage B**: full suite with **no PostgreSQL** — 117/117 files, 1266 passed | 1 skipped, EXIT=0; memory probe log; template contract tests.
- **CI**: `pr.yml` has no postgres service; 7 jobs (static-analysis, unit-tests, integration-tests, security-scan, coverage, smoke, e2e-tests); each runs `npx prisma generate`; e2e job runs `npx playwright install --with-deps chromium` then `vitest run tests/e2e/*.e2e.test.ts`.
- **M4**: `npm pack` listing, builder-sim (simulated fresh install) log, docker-build baseline log; health endpoint contract verified against `src/api/health.ts` (200 healthy/degraded, 503 unhealthy).
- **M5**: archlint master vs worktree — 208 vs 219 smells, 10 vs 10 High/Critical, **pair-diff: 0 new / 0 lost**; `biome check` EXIT=0; `biome lint src` + `tsc --noEmit` clean.
- **Hook gates on final commit** `9dda5c3`: 12-gate pre-commit chain PASS (9 pass / 3 skip), Gate 11 Sprint Flow = delphi approval verified.

## Review focus (code-walkthrough dimensions)

1. **Stage B correctness**: PGlite template lifecycle (clone/dispose, cache invalidation by schema hash, failed-init edge cases), concurrency safety with `fileParallelism: true`, global-setup generate fallback, double-close/disposal behavior.
2. **CI semantics**: does removing the PG service leave any path silently unexercised? Is `npx prisma generate` placed before consumption in every job? Names/steps vs required checks.
3. **M4 release chain**: Docker runner file list correctness; `PRISMA_SKIP_GENERATE=1` semantics on db push paths; CLI Node check; healthcheck path; deploy.sh.
4. **M5 governance**: `architecture.yaml` declarations truthful (generated layer, utils dependency); biome ignore scope sane; docs claims match code (no stale env vars / versions / paths).
5. **Test quality**: no weakened assertions; contract tests meaningful; no real-network or credential reliance in the no-PG suite.

## Recorded non-blocking items (already tracked — do not re-report as new)

- `tools/spike/prisma7-pglite-spike.mjs` `c11_freshInstall` complexity — spike harness, not shipped code.
- `ecosystem.config.cjs` script path `dist/server.js` vs actual `dist/src/server.js` — design §1.3 explicitly record-only.
- README version badge (1.8.1 vs VERSION 1.8.9) — handed to issue #153 (version automation).
- Pre-commit biome `--staged` quirk on docs-only commits (global xp-gate hook) — mitigated repo-side via biome.json; tracked for CLOSE.

## Full diff (eb707f9..9dda5c3)

```diff
