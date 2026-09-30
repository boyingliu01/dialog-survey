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
diff --git a/.dockerignore b/.dockerignore
index 6ed3372..f883a56 100644
--- a/.dockerignore
+++ b/.dockerignore
@@ -25,6 +25,17 @@ env/
 .git/
 .gitignore
 
+# Node.js
+node_modules/
+coverage/
+playwright-report/
+test-results/
+.stryker-tmp/
+
+# Sprint artifacts
+.worktrees/
+.sprint-state/
+
 # Testing
 .pytest_cache/
 .coverage
@@ -33,8 +44,8 @@ htmlcov/
 
 # Environment files
 .env
-.env.local
-.env.*.local
+.env.*
+!.env.example
 
 # Docker
 Dockerfile
diff --git a/.github/workflows/pr.yml b/.github/workflows/pr.yml
index b70bab5..db15f00 100644
--- a/.github/workflows/pr.yml
+++ b/.github/workflows/pr.yml
@@ -20,7 +20,7 @@ jobs:
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -42,27 +42,13 @@ jobs:
     name: Unit Tests (mock, PrismaClient init needs DB)
     runs-on: ubuntu-latest
     timeout-minutes: 10
-    services:
-      postgres:
-        image: postgres:16
-        env:
-          POSTGRES_USER: test
-          POSTGRES_PASSWORD: test
-          POSTGRES_DB: dialog_survey_test
-        ports:
-          - 5432:5432
-        options: >-
-          --health-cmd pg_isready
-          --health-interval 10s
-          --health-timeout 5s
-          --health-retries 5
     steps:
       - uses: actions/checkout@v4
 
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -74,17 +60,10 @@ jobs:
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
-      - name: Push Prisma schema
-        run: npx prisma db push
-        env:
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-
       - name: Run unit tests
         run: npx vitest run --exclude '**/*.integration.test.ts' --exclude 'tests/e2e/**'
         env:
           NODE_ENV: test
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
           DINGTALK_CLIENT_ID: ${{ secrets.DINGTALK_CLIENT_ID || 'dummy-ci-client-id' }}
           DINGTALK_CLIENT_SECRET: ${{ secrets.DINGTALK_CLIENT_SECRET || 'dummy-ci-client-secret' }}
 
@@ -92,27 +71,13 @@ jobs:
     name: Integration Tests (real PostgreSQL)
     runs-on: ubuntu-latest
     timeout-minutes: 15
-    services:
-      postgres:
-        image: postgres:16
-        env:
-          POSTGRES_USER: test
-          POSTGRES_PASSWORD: test
-          POSTGRES_DB: dialog_survey_test
-        ports:
-          - 5432:5432
-        options: >-
-          --health-cmd pg_isready
-          --health-interval 10s
-          --health-timeout 5s
-          --health-retries 5
     steps:
       - uses: actions/checkout@v4
 
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -124,16 +89,10 @@ jobs:
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
-      - name: Push Prisma schema
-        run: npx prisma db push
-        env:
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-
       - name: Run integration tests
         run: npx vitest run tests/*.integration.test.ts
         env:
           NODE_ENV: test
-          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
           LLM_API_KEY: ${{ secrets.LLM_API_KEY || '' }}
           LLM_BASE_URL: ${{ secrets.LLM_BASE_URL || '' }}
           LLM_MODEL: ${{ secrets.LLM_MODEL || '' }}
@@ -152,7 +111,7 @@ jobs:
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -179,27 +138,13 @@ jobs:
     # Run regardless of integration test failures (known pre-existing data residue issue)
     runs-on: ubuntu-latest
     timeout-minutes: 10
-    services:
-      postgres:
-        image: postgres:16
-        env:
-          POSTGRES_USER: test
-          POSTGRES_PASSWORD: test
-          POSTGRES_DB: dialog_survey_test
-        ports:
-          - 5432:5432
-        options: >-
-          --health-cmd pg_isready
-          --health-interval 10s
-          --health-timeout 5s
-          --health-retries 5
     steps:
       - uses: actions/checkout@v4
 
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -211,17 +156,10 @@ jobs:
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
 
-      - name: Push Prisma schema
-        run: npx prisma db push
-        env:
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-
       - name: Run all tests with coverage
         run: npx vitest --coverage
         env:
           NODE_ENV: test
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
           LLM_API_KEY: ${{ secrets.LLM_API_KEY || '' }}
           LLM_BASE_URL: ${{ secrets.LLM_BASE_URL || '' }}
           LLM_MODEL: ${{ secrets.LLM_MODEL || '' }}
@@ -238,32 +176,18 @@ jobs:
           retention-days: 7
 
   e2e-tests:
-    name: E2E Tests (Playwright, real PostgreSQL)
+    name: E2E Tests (Playwright, PGlite)
     if: always()
     needs: [static-analysis, unit-tests, integration-tests, security-scan]
     runs-on: ubuntu-latest
     timeout-minutes: 10
-    services:
-      postgres:
-        image: postgres:16
-        env:
-          POSTGRES_USER: test
-          POSTGRES_PASSWORD: test
-          POSTGRES_DB: dialog_survey_test
-        ports:
-          - 5432:5432
-        options: >-
-          --health-cmd pg_isready
-          --health-interval 10s
-          --health-timeout 5s
-          --health-retries 5
     steps:
       - uses: actions/checkout@v4
 
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
@@ -275,17 +199,10 @@ jobs:
       - name: Install Playwright
         run: npx playwright install --with-deps chromium
 
-      - name: Push Prisma schema
-        run: npx prisma db push
-        env:
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-
       - name: Run E2E tests
         run: npx vitest run tests/e2e/*.e2e.test.ts --reporter=verbose --test-timeout=30000
         env:
           NODE_ENV: test
-          DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
-          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
           LLM_API_KEY: ${{ secrets.LLM_API_KEY || '' }}
           LLM_BASE_URL: ${{ secrets.LLM_BASE_URL || '' }}
           LLM_MODEL: ${{ secrets.LLM_MODEL || '' }}
@@ -304,7 +221,7 @@ jobs:
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
 
       - name: Install dependencies
diff --git a/.github/workflows/publish.yml b/.github/workflows/publish.yml
index a4fb32f..a2a97a6 100644
--- a/.github/workflows/publish.yml
+++ b/.github/workflows/publish.yml
@@ -13,21 +13,6 @@ jobs:
       contents: read
       id-token: write
 
-    services:
-      postgres:
-        image: postgres:16
-        env:
-          POSTGRES_USER: postgres
-          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
-          POSTGRES_DB: dialog_survey_test
-        ports:
-          - 5432:5432
-        options: >-
-          --health-cmd pg_isready
-          --health-interval 10s
-          --health-timeout 5s
-          --health-retries 5
-
     steps:
 
       - uses: actions/checkout@v4
@@ -35,17 +20,15 @@ jobs:
       - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version-file: '.nvmrc'
           cache: 'npm'
           registry-url: https://registry.npmjs.org
 
       - name: Install dependencies
         run: npm ci
 
-      - name: Setup database
-        run: npx prisma db push
-        env:
-          DATABASE_URL: ${{ secrets.DATABASE_URL }}
+      - name: Generate Prisma client
+        run: npx prisma generate
 
       - name: Install Playwright for PDF export tests
         run: npx playwright install --with-deps chromium
@@ -53,7 +36,6 @@ jobs:
       - name: Run tests
         run: npm run test:coverage
         env:
-          DATABASE_URL: ${{ secrets.DATABASE_URL }}
           LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
           LLM_BASE_URL: ${{ secrets.LLM_BASE_URL }}
           LLM_MODEL: ${{ secrets.LLM_MODEL }}
diff --git a/AGENTS.md b/AGENTS.md
index 37eb9b9..e359141 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,10 +1,10 @@
 # AGENTS.md — Dialog Survey Project Knowledge Base
 
-> Generated: 2026-07-08. Commit: `073e69e` (v1.8.0). 50 source TS files, 92 test files, ~930 tests.
+> Updated: 2026-09-30 (v1.8.9). Sprint #149 (Prisma 7 migration). 58 source TS files, 117 test files, ~1266 tests. Tests need no PostgreSQL (PGlite).
 
 ## Overview
 
-AI-powered survey dialog bot — async multi-turn conversations via DingTalk with LLM-driven follow-ups and context memory. Fastify 5 + PostgreSQL + Prisma + custom LangGraph workflow.
+AI-powered survey dialog bot — async multi-turn conversations via DingTalk with LLM-driven follow-ups and context memory. Fastify 5 + PostgreSQL + Prisma 7 (driver adapters) + custom LangGraph workflow.
 
 ## Where to Look
 
@@ -17,7 +17,8 @@ AI-powered survey dialog bot — async multi-turn conversations via DingTalk wit
 | DingTalk + LLM | `src/integrations/` | DingTalk REST/Stream, OpenAI-compatible LLM |
 | Nunjucks views | `src/views/` | Admin UI via HTMX fragments + Alpine.js |
 | Utilities | `src/utils/` | Logger, security, retry, markdown, PII |
-| Tests | `tests/` | 92 files, flat structure, Vitest 4.x |
+| Prisma client | `src/generated/prisma` (generated, gitignored) | Facade `src/utils/prisma-client.ts` + factory `src/utils/prisma-factory.ts`; run `npx prisma generate` after checkout |
+| Tests | `tests/` | 117 files, flat structure, Vitest 4.x; needs no PostgreSQL |
 
 ## Code Map (Top-Level Symbols)
 
@@ -35,6 +36,7 @@ AI-powered survey dialog bot — async multi-turn conversations via DingTalk wit
 | `LLMClient` | class | `src/integrations/llm/base.ts` | OpenAI-compatible interface |
 | `PromptService` | class | `src/services/prompt.service.ts` | LLM prompt templates |
 | `ExportService` | class | `src/services/export.service.ts` | PDF (Playwright) + Excel export |
+| `createPrismaClient()` | fn | `src/utils/prisma-factory.ts` | Sole PrismaClient construction point (Prisma 7 adapter; throws without DATABASE_URL) |
 
 ## Conventions
 
@@ -51,25 +53,23 @@ AI-powered survey dialog bot — async multi-turn conversations via DingTalk wit
 | **HTMX auth** | Global via `htmx:configRequest` in `admin-tree.njk`, NEVER per-button `hx-headers` |
 | **HTMX POST body** | `values: {}`, NEVER `body: JSON.stringify()` |
 | **HTMX URLs** | Shell: `/admin/*`, Fragments: `/admin/content/*` |
+| **Prisma client** | Import `PrismaClient` from facade `src/utils/prisma-client.js` (NEVER `src/generated/` directly); construct only via `createPrismaClient()` |
 
 ## Anti-Patterns (This Project)
 
 | Pattern | Severity | Detail |
 |---------|----------|--------|
-| `new PrismaClient()` in services/routes | ERROR | Use DI via Fastify register opts |
+| `new PrismaClient()` outside `prisma-factory.ts` | ERROR | Construct via `createPrismaClient()`; services receive `prisma` via DI |
 | `prisma.$MODEL.$METHOD()` in API layer | ERROR | Route through repositories |
 | Public `prisma` getter on services | ERROR | Encapsulate with discriminated unions |
-| `dead-letter.service.ts` own PrismaClient | ISSUE | Should inject |
-| `export.service.ts` own PrismaClient | ISSUE | Should inject |
-| `batch-aggregation.service.ts` biome disable | ISSUE | `noExplicitAny` disabled |
-| `as InterviewState` cast in graph.ts | ISSUE | Spread merge loses type safety |
 
 ## Commands
 
 ```bash
+npx prisma generate   # generate src/generated/prisma (run after checkout; CI does it per job)
 npm run dev           # tsx --watch, port 3001
 npm run build         # tsc → dist/
-npm run test          # npx vitest run
+npm run test          # vitest (watch); CI uses npx vitest run
 npm run test:coverage # coverage (80/80/70/80 threshold)
 npm run smoke         # type-check + lint + ~44 key tests
 npm run lint          # biome lint src/
@@ -80,11 +80,11 @@ npm run check:fix     # biome check + auto-fix
 
 ## Notes
 
-- **PG required**: Full `vitest run` needs PostgreSQL. `PrismaClientInitializationError` = DB not running, not a code bug.
-- **Shared test DB (interim, until Stage B PGlite isolation)**: the full suite runs against one PostgreSQL database with `fileParallelism: true`. On a gate failure, rerun the failing file in isolation first; for suspected cross-file collisions triage with `npx vitest run <file> --no-file-parallelism`, then fix by scoping fixtures (file-unique ids, cleanup predicates) — never by weakening assertions.
+- **No DB for tests**: full `vitest run` uses PGlite (WASM) per test file — no PostgreSQL required. DDL + data-dir caches live in `node_modules/.cache/dialog-survey/` (invalidated by schema hash); the first cold setup spawns `prisma migrate diff` (~2-4s). `globalSetup` auto-runs `prisma generate` once if `src/generated/prisma` is missing.
+- **Test parallel safety**: suites run with `fileParallelism: true`; each file gets an isolated PGlite instance. On a gate failure, rerun the failing file in isolation first; fix cross-file collisions by scoping fixtures (file-unique ids, cleanup predicates) — never by weakening assertions.
 - **Vitest async suites**: Vitest 4 awaits async `describe` callbacks — several suites rely on a describe-level `await getSharedTestPrisma()`. Re-verify async-suite semantics when upgrading Vitest.
-- **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → `fuser -k 3001/tcp` first.
-- **Test layers**: Unit (mock Prisma, no DB) / Integration (real PG, 3+ files) / E2E (Playwright, future).
-- **CI**: PRs run 7 jobs (analysis, unit, integration, security, coverage, smoke).
+- **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → find the PID (`netstat -ano | findstr :3001` on Windows, `fuser -k 3001/tcp` on WSL/Linux) and kill it first.
+- **Test layers**: Unit (mock Prisma) / Integration (PGlite in-process, parallel-safe) / E2E in `tests/e2e/` (11 files: in-process Fastify + real chromium via Playwright).
+- **CI**: PRs run 7 jobs (static-analysis, unit-tests, integration-tests, security-scan, coverage, smoke, e2e-tests). No PostgreSQL service; every job runs `npx prisma generate` (generated client is gitignored).
 - **API bug triage**: curl → isolate backend first. htmx.ajax() `.then()` fires on 4xx with `undefined` arg.
 
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 2e76d79..a350c64 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -1,5 +1,21 @@
 # Changelog
 
+## Unreleased
+
+### Changed
+- chore: upgrade Prisma 6 → 7 with driver adapters (#149)
+  - `prisma` / `@prisma/client` / `@prisma/adapter-pg` pinned to 7.10.0; client generated as TypeScript source into `src/generated/prisma` (gitignored, excluded from biome/vitest coverage)
+  - `src/utils/prisma-client.ts` facade (pure re-export) + `src/utils/prisma-factory.ts` factory (`createPrismaClient()`, sole `new PrismaClient()` site, 5s connect timeout, fails loudly when `DATABASE_URL` is missing)
+  - Node.js requirement raised to `>= 20.19.0` (engines, `.nvmrc`, CLI/deploy checks, CI `node-version-file`)
+
+### Added
+- test: PostgreSQL-free test suite via PGlite (per-file isolated WASM database, schema DDL + data-dir caches under `node_modules/.cache/dialog-survey/`)
+- ci: `npx prisma generate` step in all PR jobs (generated client is not committed)
+- docs: architecture.yaml declares the generated layer and utils dependency; AGENTS.md / README / README.zh-CN / DEPLOY / Windows setup guide refreshed for Prisma 7
+
+### Fixed
+- fix(release): Docker runner image ships `public/` and `prisma.config.ts`; CLI/deploy Node versions aligned to 20.19; `prisma db push` pinned with `PRISMA_SKIP_GENERATE=1`; healthcheck covers the full boot path
+
 ## 1.8.9 - 2026-07-29
 
 ### Added
diff --git a/DEPLOY.md b/DEPLOY.md
index 7aa4100..7745c7e 100644
--- a/DEPLOY.md
+++ b/DEPLOY.md
@@ -2,7 +2,7 @@
 
 ## Overview
 
-Dialog Survey supports **one-click deployment** to any Linux machine with Node.js 20+ and PostgreSQL 14+.
+Dialog Survey supports **one-click deployment** to any Linux machine with Node.js 20.19+ and PostgreSQL 14+.
 
 ## Quick Deploy
 
@@ -13,16 +13,16 @@ npx dialog-survey start
 ```
 
 The installer will:
-1. ✓ Check Node.js version
+1. ✓ Check Node.js version (>= 20.19.0)
 2. ✓ Verify PostgreSQL connectivity
 3. ✓ Check port availability (3001)
 4. ✓ Install PM2 process manager
 5. ✓ Copy application files to `~/.dialog-survey/`
 6. ✓ Generate admin credentials (auto-generated password shown once)
 7. ✓ Generate `.env` from your configuration (including session keys)
-8. ✓ Install production dependencies
-9. ✓ Generate Prisma client and sync schema
-10. ✓ Build the production bundle
+8. ✓ Install production dependencies (`npm install --omit=dev`)
+9. ✓ Install the Playwright Chromium browser (PDF export)
+10. ✓ Sync the schema with `prisma db push` (Prisma 7)
 11. ✓ Start the service via PM2
 12. ✓ Verify health endpoint
 
@@ -30,7 +30,7 @@ The installer will:
 
 | Component | Version | Notes |
 |-----------|---------|-------|
-| Node.js | >= 20.0.0 | Use `nvm` for version management |
+| Node.js | >= 20.19.0 | Use `nvm` for version management |
 | PostgreSQL | 14+ | Dedicated database recommended |
 | RAM | >= 512MB | 1GB+ recommended |
 | Disk | ~200MB | For code + node_modules + logs |
@@ -108,9 +108,7 @@ SESSION_SALT=<YOUR_32_CHAR_HEX>         # Generate: node -e "console.log(require
 | `SESSION_MAX_AGE` | `28800` | Admin session inactivity limit (seconds; 28800 = 8 hours) |
 | `ADMIN_API_KEY` | — | Optional header-based admin access (`X-Admin-Key`) for automation only |
 | `REPORTS_DIR` | `./reports` | Report storage path |
-| `MAX_LLM_RETRIES` | `2` | LLM retry attempts |
 | `LLM_TIMEOUT` | `30000` | LLM request timeout (ms) |
-| `PUBLIC_URL` | — | Public callback URL |
 
 ### Admin Authentication
 
@@ -207,8 +205,9 @@ sudo certbot --nginx -d interview.example.com
 # Basic health
 curl http://localhost:3001/health
 
-# Expected response:
-# {"status":"ok","database":"connected","timestamp":"..."}
+# Expected response (example):
+# {"status":"healthy","timestamp":"...","checks":{"db":{"status":"ok","latencyMs":0},"llm":{"status":"ok"},"dingtalk":{"status":"ok"}}}
+# status is "healthy" | "degraded" | "unhealthy"; a failing db check returns HTTP 503.
 ```
 
 ## Monitoring
@@ -294,7 +293,7 @@ pg_isready
 echo $NODE_ENV
 
 # Test manually
-npm run build && node dist/src/server.ts
+npm run build && node dist/src/server.js
 ```
 
 ### Port already in use
diff --git a/Dockerfile b/Dockerfile
index ce5b291..fa51c2e 100644
--- a/Dockerfile
+++ b/Dockerfile
@@ -32,6 +32,10 @@ COPY --from=builder /app/package.json ./package.json
 # Copy runtime files
 COPY --from=builder /app/prisma ./prisma
 COPY --from=builder /app/src/views ./src/views
+COPY --from=builder /app/public ./public
+
+# Runtime files needed by the Prisma CLI (container-side db push, DD-009)
+COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
 
 # Copy environment template
 COPY --from=builder /app/.env.example ./.env.example
@@ -39,9 +43,9 @@ COPY --from=builder /app/.env.example ./.env.example
 # Switch to non-root user
 USER nodejs
 
-# Health check
+# Health check — node fetch, not curl (curl is absent from node:20-alpine)
 HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
-  CMD curl -f http://localhost:3001/health || exit 1
+  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
 
 EXPOSE 3001
 
diff --git a/README.md b/README.md
index d541c8a..b9a76b8 100644
--- a/README.md
+++ b/README.md
@@ -5,7 +5,7 @@
 > An AI-powered survey dialog bot that conducts async multi-turn conversations via DingTalk — with LLM-driven follow-ups, context memory, and automated report generation.
 
 [![Version](https://img.shields.io/badge/version-1.8.1-blue)](https://github.com/boyingliu01/dialog-survey)
-[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)]()
+[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)]()
 [![License](https://img.shields.io/badge/license-MIT-green)]()
 
 ---
@@ -22,7 +22,7 @@ npx dialog-survey start
 # That's it. Your dialog bot is live on DingTalk.
 ```
 
-**Prerequisites:** Node.js >= 20, PostgreSQL 14+, a DingTalk application (Client ID/Secret/Agent ID).
+**Prerequisites:** Node.js >= 20.19, PostgreSQL 14+, a DingTalk application (Client ID/Secret/Agent ID).
 
 ---
 
@@ -70,7 +70,7 @@ Dialog Survey is an **async survey dialog bot** that lives inside DingTalk. You
 | **Conversation Engine** | Custom LangGraph-inspired workflow (not StateGraph API) |
 | **LLM** | OpenAI-compatible API — ollama / vLLM / LocalAI / cloud |
 | **Messaging** | DingTalk Stream Mode (WebSocket) |
-| **Database** | PostgreSQL + Prisma ORM |
+| **Database** | PostgreSQL + Prisma 7 (driver adapters) |
 | **Web Framework** | Fastify 5.x |
 | **Templates** | Nunjucks (admin UI) |
 | **Language** | TypeScript (strict mode, ESM) |
@@ -93,7 +93,7 @@ npx dialog-survey install \
   --dingtalk-agent-id "xxx"
 ```
 
-This generates `.env`, runs `prisma generate` + `db push`, and sets up PM2 (Linux/macOS) or direct node launch (Windows).
+This generates `.env`, syncs the schema with `prisma db push` (Prisma 7), and sets up PM2 (Linux/macOS) or direct node launch (Windows).
 
 #### Option B: Docker Compose (recommended for evaluation)
 
@@ -250,9 +250,10 @@ Health check: `curl http://localhost:3001/health`
 ### Development Commands
 
 ```bash
+npx prisma generate  # Generate Prisma client (required after checkout)
 npm run dev          # Hot-reload dev server on :3001
 npm run type-check   # TypeScript check (tsc --noEmit)
-npm test             # Run tests (Vitest)
+npm test             # Vitest watch; npx vitest run for one-shot — no PostgreSQL needed (PGlite)
 npm run lint         # Biome lint
 npm run build        # Compile to dist/
 npm run smoke        # Quick sanity check (type-check + lint + key tests)
@@ -272,8 +273,9 @@ dialog-survey/
 │   ├── integrations/ # DingTalk + LLM clients
 │   ├── middleware/   # Fastify middleware
 │   ├── views/        # Nunjucks admin UI (HTMX + Alpine.js)
-│   └── utils/        # Helpers (logger, security, PII, etc.)
-├── tests/            # 92 files, ~930 tests (Vitest)
+│   ├── generated/    # Prisma client output (gitignored; npx prisma generate)
+│   └── utils/        # Helpers (logger, security, PII, etc.) + Prisma facade/factory
+├── tests/            # 117 files, ~1266 tests (Vitest + PGlite, no PostgreSQL needed)
 ├── scripts/          # CLI binary + deploy scripts
 ├── prisma/           # Schema + migrations + seeds
 └── docs/             # Architecture & design docs
diff --git a/README.zh-CN.md b/README.zh-CN.md
index 619efdf..a053f92 100644
--- a/README.zh-CN.md
+++ b/README.zh-CN.md
@@ -5,7 +5,7 @@
 > 一款 AI 驱动的异步对话机器人，通过钉钉自动进行多轮问卷对话——具备 LLM 智能追问、跨消息上下文记忆、以及自动化报告生成能力。
 
 [![Version](https://img.shields.io/badge/version-1.8.1-blue)](https://github.com/boyingliu01/dialog-survey)
-[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)]()
+[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)]()
 [![License](https://img.shields.io/badge/license-MIT-green)]()
 
 ---
@@ -22,7 +22,7 @@ npx dialog-survey start
 # 完成。你的对话机器人已经在钉钉上就绪。
 ```
 
-**环境要求：** Node.js >= 20、PostgreSQL 14+、一个钉钉应用（Client ID / Secret / Agent ID）
+**环境要求：** Node.js >= 20.19、PostgreSQL 14+、一个钉钉应用（Client ID / Secret / Agent ID）
 
 ---
 
@@ -70,7 +70,7 @@ Dialog Survey 是一个**驻留在钉钉里的异步对话机器人**。你设
 | **对话引擎** | 自研 LangGraph 工作流 |
 | **LLM** | OpenAI 兼容 API——ollama / vLLM / LocalAI / 云端 |
 | **消息平台** | 钉钉 Stream Mode (WebSocket) |
-| **数据库** | PostgreSQL + Prisma ORM |
+| **数据库** | PostgreSQL + Prisma 7（driver adapters） |
 | **Web 框架** | Fastify 5.x |
 | **模板引擎** | Nunjucks（管理后台 UI） |
 | **语言** | TypeScript（严格模式，ESM） |
@@ -93,7 +93,7 @@ npx dialog-survey install \
   --dingtalk-agent-id "xxx"
 ```
 
-CLI 会自动生成 `.env`、运行 `prisma generate` + `db push`、并配置 PM2（Linux/macOS）或直接 node 启动（Windows）。
+CLI 会自动生成 `.env`、通过 `prisma db push` 同步表结构（Prisma 7）、并配置 PM2（Linux/macOS）或直接 node 启动（Windows）。
 
 #### 方式 B：Docker Compose（评估推荐）
 
@@ -176,9 +176,10 @@ docker compose logs -f app
 ### 开发命令
 
 ```bash
+npx prisma generate  # 生成 Prisma Client（检出后必跑）
 npm run dev          # 热重载开发服务器，端口 :3001
 npm run type-check   # TypeScript 类型检查
-npm test             # 运行测试 (Vitest)
+npm test             # Vitest watch 模式；一次性运行用 npx vitest run — 不需要 PostgreSQL（PGlite）
 npm run lint         # Biome 代码检查
 npm run build        # 编译到 dist/
 npm run smoke        # 快速验证（类型检查 + lint + 核心测试）
@@ -198,8 +199,9 @@ dialog-survey/
 │   ├── integrations/ # 钉钉 + LLM 客户端
 │   ├── middleware/   # Fastify 中间件
 │   ├── views/        # Nunjucks 管理后台 (HTMX + Alpine.js)
-│   └── utils/        # 工具函数（日志、安全、PII 等）
-├── tests/            # 92 个测试文件，~930 个测试用例
+│   ├── generated/    # Prisma Client 生成物（gitignore；npx prisma generate）
+│   └── utils/        # 工具函数（日志、安全、PII 等）+ Prisma 门面/工厂
+├── tests/            # 117 个测试文件，~1266 个测试用例（Vitest + PGlite，无需 PostgreSQL）
 ├── scripts/          # CLI 入口 + 部署脚本
 ├── prisma/           # Schema + 迁移 + 种子数据
 └── docs/             # 架构与设计文档
diff --git a/architecture.yaml b/architecture.yaml
index 9c75b7b..1db86f9 100644
--- a/architecture.yaml
+++ b/architecture.yaml
@@ -16,5 +16,11 @@ layers:
     pattern: "src/integrations/**"
     depends: []
   utils:
+    # 门面 src/utils/prisma-client.ts 纯 re-export src/generated 符号；
+    # src/utils/prisma-factory.ts 是 PrismaClient 唯一构造点（内部从门面导入）
     pattern: "src/utils/**"
+    depends: [generated]
+  generated:
+    # Prisma 7 生成物（.ts 源码，gitignore 排除）；唯一消费方为 src/utils 门面
+    pattern: "src/generated/**"
     depends: []
diff --git a/biome.json b/biome.json
index e0386b4..5ed667f 100644
--- a/biome.json
+++ b/biome.json
@@ -8,6 +8,10 @@
       ".xp-gate/",
       ".code-walkthrough-result.json",
       ".quality-history.jsonl",
+      ".architecture-baseline.json",
+      "coverage/",
+      "dist/",
+      "build/",
       "docs/sprints/",
       "src/generated/",
       "public/js/*.min.js"
diff --git a/docker-compose.yml b/docker-compose.yml
index d95908a..662c6e7 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -36,7 +36,11 @@ services:
     ports:
       - "3001:3001"
     healthcheck:
-      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
+      test:
+        - CMD
+        - node
+        - -e
+        - "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
       interval: 30s
       timeout: 10s
       retries: 3
diff --git a/docs/setup-guide.md b/docs/setup-guide.md
index 17b64d1..5b24b3a 100644
--- a/docs/setup-guide.md
+++ b/docs/setup-guide.md
@@ -7,7 +7,7 @@
 | 组件 | 最低版本 | 推荐版本 | 说明 |
 |------|----------|----------|------|
 | Windows | 10/11 | 11 | 需支持 PowerShell 5.1+ |
-| Node.js | >= 20.0.0 | 20 LTS | 必须 20+ (项目使用 `tsx --env-file` 特性) |
+| Node.js | >= 20.19.0 | 20 LTS | 项目 `engines` 要求 `>= 20.19.0`（`.nvmrc` 为 20.19） |
 | PostgreSQL | 14+ | 16 | 数据存储 |
 | Git | 2.40+ | 最新 | 版本控制 |
 | jq | 任意 | 最新 | pre-push hook 依赖 |
@@ -151,20 +151,23 @@ HOST=0.0.0.0
 # Database
 DATABASE_URL="postgresql://postgres:your_password@localhost:5432/dialog_survey?schema=public"
 
-# LLM Configuration
-DASHSCOPE_API_KEY=sk-your-dashscope-api-key
-MAX_LLM_RETRIES=2
+# LLM Configuration (OpenAI 兼容)
+LLM_API_KEY=your-llm-api-key
+LLM_MODEL=qwen2.5
 LLM_TIMEOUT=30000
+# LLM_BASE_URL=http://localhost:11434/v1/chat/completions
+# DASHSCOPE_API_KEY=sk-your-dashscope-api-key   # 仅特定集成（embedding 等）需要
 
-# DingTalk Configuration
-DINGTALK_APP_KEY=your-dingtalk-app-key
-DINGTALK_APP_SECRET=your-dingtalk-app-secret
+# DingTalk Configuration（Stream 模式，无需公网回调地址）
+DINGTALK_CLIENT_ID=your-dingtalk-client-id
+DINGTALK_CLIENT_SECRET=your-dingtalk-client-secret
 DINGTALK_AGENT_ID=your-dingtalk-agent-id
-PUBLIC_URL=http://your-internal-ip:3001
 
-# Security
-ENCRYPTION_KEY=your-32-byte-hex-key
-ADMIN_API_KEY=your-admin-api-key
+# Admin 登录（会话认证）
+ADMIN_USERNAME=admin
+ADMIN_PASSWORD_HASH=
+SESSION_SECRET=
+SESSION_SALT=
 
 # Report Configuration
 REPORTS_DIR=./reports
@@ -178,12 +181,17 @@ LOG_LEVEL=info
 | 变量 | Windows 注意事项 |
 |------|------------------|
 | `DATABASE_URL` | 如果 PG 在本地，确保端口 5432 可访问 |
-| `PUBLIC_URL` | 钉钉回调地址。局域网内用 `http://内网IP:3001` |
-| `ENCRYPTION_KEY` | 生成方法见下方 |
+| `ADMIN_PASSWORD_HASH` | bcrypt 哈希：`node -e "require('bcryptjs').hash('your-password', 12).then(console.log)"` |
+| `SESSION_SECRET` / `SESSION_SALT` | 会话密钥，生成方法见下方 |
+| `ENCRYPTION_KEY` | （已弃用，仅兼容保留）运行时不再使用 |
 
-### 生成 ENCRYPTION_KEY
+### 生成会话密钥
 
 ```powershell
+# SESSION_SECRET (32 bytes hex)
+node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
+
+# SESSION_SALT (16 bytes hex)
 node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
 ```
 
@@ -231,11 +239,11 @@ curl http://localhost:3001/health
 npm run build       # 编译到 dist/
 
 # 直接运行
-node dist\src\server.ts
+node dist\src\server.js
 
 # 或使用 PM2 管理（推荐）
 npm install -g pm2
-pm2 start dist/src/server.ts --name dialog-survey
+pm2 start dist/src/server.js --name dialog-survey
 pm2 save
 pm2 startup   # 设置 Windows 开机自启
 ```
@@ -278,14 +286,14 @@ pm2 startup   # 设置 Windows 开机自启
 
 完成上述步骤后，逐一验证：
 
-- [ ] `node --version` 输出 >= 20.0.0
+- [ ] `node --version` 输出 >= 20.19.0
 - [ ] `npm install` 无报错
 - [ ] `.env` 已配置所有必填项
-- [ ] `npx prisma generate` 成功
+- [ ] `npx prisma generate` 成功（生成 `src/generated/prisma`）
 - [ ] `npx prisma db push` 成功（数据表已创建）
 - [ ] `npm run dev` 启动无报错
 - [ ] `curl http://localhost:3001/health` 返回正常响应
-- [ ] `npm run test` 测试通过
+- [ ] `npx vitest run` 测试通过（无需 PostgreSQL，使用 PGlite）
 - [ ] `npm run type-check` 类型检查通过
 - [ ] `npm run lint` 代码检查通过
 - [ ] `jq --version` 可用（pre-push hook 需要）
@@ -312,9 +320,8 @@ npm ci --ignore-scripts
 ### Q: `npm run dev` 启动后钉钉 Stream 连接失败？
 
 **A**: 检查：
-1. `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 是否正确
-2. 网络能否访问钉钉 API（公司防火墙是否放行）
-3. `PUBLIC_URL` 是否为钉钉服务器可访问的地址
+1. `DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET` / `DINGTALK_AGENT_ID` 是否正确
+2. 网络能否访问钉钉 API（公司防火墙是否放行；Stream 模式为 WebSocket 长连接，无需公网回调地址）
 
 ### Q: Git pre-push hook 报错 `jq: command not found`？
 
diff --git a/scripts/cli.mjs b/scripts/cli.mjs
index 2cfc43d..f7315b1 100755
--- a/scripts/cli.mjs
+++ b/scripts/cli.mjs
@@ -27,7 +27,7 @@ const PM2_APP_NAME = 'dialog-survey';
 const HEALTH_URL = 'http://localhost:3001/health';
 const HEALTH_TIMEOUT_MS = 30_000;
 const HEALTH_POLL_INTERVAL_MS = 1_000;
-const MIN_NODE_MAJOR = 20;
+const MIN_NODE_VERSION = '20.19.0';
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = dirname(__filename);
@@ -230,15 +230,25 @@ export async function resolveAdminCredentials(config = {}) {
 // ─── Prerequisites ───────────────────────────────────────────────────────────
 
 /**
- * Check Node.js version >= 20.
+ * Check Node.js version >= MIN_NODE_VERSION (semver compare, not major-only).
  * @returns {{ ok: boolean, message: string }}
  */
 export function checkNodeVersion(version = process.versions.node) {
-  const major = Number.parseInt(version.split('.')[0], 10);
-  if (major < MIN_NODE_MAJOR) {
+  const current = version.split('.').map((part) => Number.parseInt(part, 10));
+  const minimum = MIN_NODE_VERSION.split('.').map((part) => Number.parseInt(part, 10));
+  let meetsMinimum = true;
+  for (let i = 0; i < minimum.length; i += 1) {
+    const cur = current[i] ?? 0;
+    const min = minimum[i] ?? 0;
+    if (cur !== min) {
+      meetsMinimum = cur > min;
+      break;
+    }
+  }
+  if (!meetsMinimum) {
     return {
       ok: false,
-      message: `Node.js >= ${MIN_NODE_MAJOR} required (current: ${process.versions.node})`,
+      message: `Node.js >= ${MIN_NODE_VERSION} required (current: ${process.versions.node})`,
     };
   }
   return { ok: true, message: `Node.js ${process.versions.node} ✓` };
@@ -350,7 +360,13 @@ export async function checkPrerequisites(databaseUrl, options = {}) {
  * @returns {{ ok: boolean, missing: string[] }}
  */
 export function verifyInstallation(installDir) {
-  const requiredFiles = ['ecosystem.config.cjs', 'dist/src/server.js', '.env', 'node_modules'];
+  const requiredFiles = [
+    'ecosystem.config.cjs',
+    'dist/src/server.js',
+    '.env',
+    'node_modules',
+    'prisma.config.ts',
+  ];
 
   const missing = [];
   for (const file of requiredFiles) {
@@ -658,6 +674,7 @@ export async function installCommand(flags) {
     'prisma',
     'src/views',
     'public',
+    'prisma.config.ts',
     'ecosystem.config.cjs',
   ];
   for (const file of filesToCopy) {
@@ -700,21 +717,17 @@ export async function installCommand(flags) {
     log("    Run 'npx playwright install chromium' manually if PDF export is needed.");
   }
 
-  // Step 8: prisma generate
-  log('Generating Prisma client...');
-  try {
-    exec('npx prisma generate', { cwd: INSTALL_DIR });
-    log('  Prisma client generated ✓');
-  } catch (err) {
-    logError(`prisma generate failed: ${err.message}`);
-    process.exitCode = 1;
-    return;
-  }
-
   // Step 9: prisma db push
+  // No generate step here: the package ships the compiled client
+  // (dist/src/generated/prisma) and devDeps are absent in the install.
+  // PRISMA_SKIP_GENERATE keeps the installed tree read-only — --no-generate
+  // does not exist in prisma@7.10.0 (spike #11 verified the env flag).
   log('Pushing schema to database...');
   try {
-    exec('npx prisma db push', { cwd: INSTALL_DIR });
+    exec('npx --yes prisma@7.10.0 db push', {
+      cwd: INSTALL_DIR,
+      env: { ...process.env, PRISMA_SKIP_GENERATE: '1' },
+    });
     log('  Schema pushed ✓');
   } catch (err) {
     logError(`prisma db push failed: ${err.message}`);
diff --git a/scripts/deploy.sh b/scripts/deploy.sh
index 4c9092f..2b5e63d 100644
--- a/scripts/deploy.sh
+++ b/scripts/deploy.sh
@@ -5,7 +5,7 @@
 #   bash scripts/deploy.sh [production|staging]
 #
 # Prerequisites:
-#   - Node.js >= 20.0.0
+#   - Node.js >= 20.19.0
 #   - PostgreSQL running and accessible via DATABASE_URL
 #   - .env file configured (or .env.production / .env.staging)
 set -euo pipefail
@@ -39,13 +39,16 @@ cd "$PROJECT_DIR"
 # ── Phase 1: Prerequisites ──────────────────────────────────────────────
 log_info "Checking prerequisites for $ENV deployment..."
 
-# Node.js version check
-NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
-if [ "$NODE_MAJOR" -lt 20 ]; then
-  log_error "Node.js >= 20.0.0 required, got $(node -v)"
+# Node.js version check (semver >= 20.19.0, not major-only)
+NODE_VERSION_RAW=$(node -v | sed 's/^v//')
+NODE_MAJOR=${NODE_VERSION_RAW%%.*}
+NODE_REST=${NODE_VERSION_RAW#*.}
+NODE_MINOR=${NODE_REST%%.*}
+if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
+  log_error "Node.js >= 20.19.0 required, got v$NODE_VERSION_RAW"
   exit 1
 fi
-log_info "✓ Node.js $(node -v)"
+log_info "✓ Node.js v$NODE_VERSION_RAW"
 
 # PostgreSQL check
 if ! command -v psql &>/dev/null; then
diff --git a/tests/admin-tree.test.ts b/tests/admin-tree.test.ts
index ef05153..0b07960 100644
--- a/tests/admin-tree.test.ts
+++ b/tests/admin-tree.test.ts
@@ -20,7 +20,7 @@ describe('Admin Tree Routes', () => {
     vi.stubEnv('ADMIN_API_KEY', ADMIN_KEY);
     vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
     vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
-    const result = await buildApp();
+    const result = await buildApp({ prismaFactory: () => prisma });
     app = result.fastify;
     await app.ready();
   });
diff --git a/tests/cli.test.ts b/tests/cli.test.ts
index 782a697..d1d86f2 100644
--- a/tests/cli.test.ts
+++ b/tests/cli.test.ts
@@ -210,6 +210,17 @@ describe('CLI', () => {
       expect(result.ok).toBe(false);
       expect(result.message).toContain('>= 20');
     });
+
+    it('should fail on a major-only pass (20.18.9 < 20.19.0, semver compare)', () => {
+      const result = checkNodeVersion('20.18.9');
+      expect(result.ok).toBe(false);
+      expect(result.message).toContain('>= 20.19.0');
+    });
+
+    it('should pass on the exact minimum version 20.19.0', () => {
+      const result = checkNodeVersion('20.19.0');
+      expect(result.ok).toBe(true);
+    });
   });
 
   describe('checkPostgres', () => {
@@ -562,6 +573,7 @@ describe('CLI', () => {
       writeFileSync(join(tmpDir, 'ecosystem.config.cjs'), 'module.exports = {};');
       writeFileSync(join(tmpDir, 'dist', 'src', 'server.js'), '// server.js');
       writeFileSync(join(tmpDir, '.env'), 'DATABASE_URL=test');
+      writeFileSync(join(tmpDir, 'prisma.config.ts'), '');
 
       const result = verifyInstallation(tmpDir);
       expect(result.ok).toBe(true);
@@ -576,6 +588,7 @@ describe('CLI', () => {
       expect(result.missing).toContain('dist/src/server.js');
       expect(result.missing).toContain('.env');
       expect(result.missing).toContain('node_modules');
+      expect(result.missing).toContain('prisma.config.ts');
     });
 
     it('should report each missing file individually', () => {
@@ -596,6 +609,7 @@ describe('CLI', () => {
       writeFileSync(join(tmpDir, 'ecosystem.config.cjs'), '');
       writeFileSync(join(tmpDir, 'dist', 'src', 'server.js'), '');
       writeFileSync(join(tmpDir, '.env'), '');
+      writeFileSync(join(tmpDir, 'prisma.config.ts'), '');
 
       const result = verifyInstallation(tmpDir);
       expect(result.ok).toBe(true);
diff --git a/tests/e2e/cli-install.e2e.test.ts b/tests/e2e/cli-install.e2e.test.ts
index 9eb31de..eae9d7e 100644
--- a/tests/e2e/cli-install.e2e.test.ts
+++ b/tests/e2e/cli-install.e2e.test.ts
@@ -105,6 +105,7 @@ describe('CLI (E2E)', () => {
       // Create all required files
       fs.writeFileSync(path.join(validDir, '.env'), 'DATABASE_URL=test');
       fs.writeFileSync(path.join(validDir, 'ecosystem.config.cjs'), 'module.exports = {}');
+      fs.writeFileSync(path.join(validDir, 'prisma.config.ts'), '');
       fs.mkdirSync(path.join(validDir, 'dist', 'src'), { recursive: true });
       fs.writeFileSync(path.join(validDir, 'dist', 'src', 'server.js'), '// server');
       fs.mkdirSync(path.join(validDir, 'node_modules'), { recursive: true });
diff --git a/tests/e2e/helpers/e2e-server.ts b/tests/e2e/helpers/e2e-server.ts
index ccdee22..1350fe2 100644
--- a/tests/e2e/helpers/e2e-server.ts
+++ b/tests/e2e/helpers/e2e-server.ts
@@ -86,7 +86,7 @@ export async function createE2EServer(port = 0): Promise<E2EServer> {
     await testDb.setup();
     const prisma = testDb.getPrisma();
     const { buildApp } = await import('../../../src/server.js');
-    const builtApp = await buildApp();
+    const builtApp = await buildApp({ prismaFactory: () => prisma });
     app = builtApp.fastify;
     await app.listen({ port, host: '127.0.0.1' });
     const address = app.server.address();
diff --git a/tests/global-setup.ts b/tests/global-setup.ts
new file mode 100644
index 0000000..f9092d5
--- /dev/null
+++ b/tests/global-setup.ts
@@ -0,0 +1,32 @@
+// @no-test-required: Vitest globalSetup bootstrap; its guard runs on every test invocation, so the whole suite exercises it
+import { spawnSync } from 'node:child_process';
+import fs from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+const GENERATED_CLIENT = path.join(ROOT, 'src', 'generated', 'prisma', 'client.ts');
+
+/**
+ * Generated-artifact guard only (design DD-006): `src/generated/prisma` is
+ * gitignored, so tsc/vitest on a fresh checkout fail without a generate step.
+ * One automatic fallback generate on the failure path; the DDL/template caches
+ * are NOT touched here — they stay lazy in the first TestDatabase.setup(), so
+ * pure unit/smoke runs never spawn the Prisma CLI.
+ */
+export default function globalSetup(): void {
+  if (fs.existsSync(GENERATED_CLIENT)) return;
+
+  const result = spawnSync('npm', ['run', 'prisma:generate'], {
+    cwd: ROOT,
+    encoding: 'utf8',
+    shell: process.platform === 'win32',
+    timeout: 180_000,
+  });
+  if (result.error || result.status !== 0 || !fs.existsSync(GENERATED_CLIENT)) {
+    const cause = (result.error?.message ?? result.stderr ?? result.stdout ?? '').trim();
+    throw new Error(
+      `Generated Prisma client is missing (${GENERATED_CLIENT}). Run \`npm run prisma:generate\` first. Cause: ${cause || `exit code ${String(result.status)}`}`
+    );
+  }
+}
diff --git a/tests/helpers/create-test-prisma.ts b/tests/helpers/create-test-prisma.ts
index a61316e..0e1b7a0 100644
--- a/tests/helpers/create-test-prisma.ts
+++ b/tests/helpers/create-test-prisma.ts
@@ -1,30 +1,21 @@
-import { PrismaPg } from '@prisma/adapter-pg';
+import { PrismaPGlite } from 'pglite-prisma-adapter';
 import { PrismaClient } from '../../src/utils/prisma-client.js';
-import { PRISMA_CONNECT_TIMEOUT_MS } from '../../src/utils/prisma-factory.js';
+import { createTestPglite } from './pglite-template.js';
 
-function resolveTestDatabaseUrl(): string {
-  return (
-    process.env['TEST_DATABASE_URL'] ||
-    process.env['DATABASE_URL'] ||
-    'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test'
-  );
+async function buildClient(): Promise<PrismaClient> {
+  const pglite = await createTestPglite();
+  return new PrismaClient({ adapter: new PrismaPGlite(pglite) });
 }
 
-function buildClient(): PrismaClient {
-  const adapter = new PrismaPg({
-    connectionString: resolveTestDatabaseUrl(),
-    connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
-  });
-  return new PrismaClient({ adapter });
-}
-
-let shared: PrismaClient | undefined;
+let shared: Promise<PrismaClient> | undefined;
 
 /**
- * File-level singleton: repeated calls within one test file share one instance
- * (and, from Stage B on, one PGlite database). Disconnect ownership belongs to
- * the importing test file's `afterAll` / `TestDatabase.teardown()`; module
- * isolation is per test file, so that disconnect cannot affect other files.
+ * File-level singleton: repeated calls within one test file share one PGlite
+ * database and one client (promise-memoized, so concurrent first calls boot a
+ * single instance). Disconnect ownership belongs to the importing test file's
+ * `afterAll` / `TestDatabase.teardown()`; module isolation is per test file.
+ * `$disconnect()` only disposes the (no-op) adapter — the in-memory PGlite is
+ * reclaimed when the per-file worker process exits.
  */
 export async function getSharedTestPrisma(): Promise<PrismaClient> {
   shared ??= buildClient();
@@ -32,8 +23,9 @@ export async function getSharedTestPrisma(): Promise<PrismaClient> {
 }
 
 /**
- * Independent instance for genuinely isolated scenarios; the caller owns
- * `$disconnect()`.
+ * Independent instance backed by its own PGlite database; the caller owns
+ * `$disconnect()` (which, as above, does not release the PGlite — process exit
+ * does).
  */
 export async function createTestPrisma(): Promise<PrismaClient> {
   return buildClient();
diff --git a/tests/helpers/pglite-template.ts b/tests/helpers/pglite-template.ts
new file mode 100644
index 0000000..0c193c0
--- /dev/null
+++ b/tests/helpers/pglite-template.ts
@@ -0,0 +1,205 @@
+import { spawnSync } from 'node:child_process';
+import crypto from 'node:crypto';
+import fs from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { PGlite } from '@electric-sql/pglite';
+
+/**
+ * PGlite test-database bootstrapping — schema DDL + data-dir template caches.
+ *
+ * Both caches live under `node_modules/.cache/dialog-survey/` keyed by content
+ * hashes, so a `prisma/schema.prisma` change invalidates them automatically.
+ * Everything is lazy and per-process memoized: test files that never touch the
+ * database pay zero cost, and pure unit/smoke runs never spawn the Prisma CLI
+ * (design DD-006).
+ */
+
+const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
+const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'dialog-survey');
+const DDL_CACHE_PATH = path.join(CACHE_DIR, 'test-schema.sql');
+const TEMPLATE_FILE_PREFIX = 'pglite-template-';
+const TEMPLATE_FILE_SUFFIX = '.tar';
+
+let ddlPromise: Promise<string> | undefined;
+let templatePromise: Promise<Blob> | undefined;
+let activeTemplatePath: string | undefined;
+
+function sha256(content: string): string {
+  return crypto.createHash('sha256').update(content).digest('hex');
+}
+
+function writeFileAtomic(filePath: string, content: string | Buffer): void {
+  const tmpPath = `${filePath}.${process.pid}.tmp`;
+  fs.writeFileSync(tmpPath, content);
+  try {
+    fs.renameSync(tmpPath, filePath);
+  } catch (error) {
+    fs.rmSync(tmpPath, { force: true });
+    throw error;
+  }
+}
+
+/**
+ * Test schema DDL via `prisma migrate diff --from-empty --to-schema`.
+ * Cache key = SHA-256 of `prisma/schema.prisma`; a key mismatch (or missing /
+ * corrupt cache) regenerates and overwrites — only a failed spawn throws, and
+ * the message points at the `npm run prisma:generate` precheck.
+ */
+export async function getTestSchemaDdl(): Promise<string> {
+  ddlPromise ??= loadOrBuildDdl();
+  return ddlPromise;
+}
+
+async function loadOrBuildDdl(): Promise<string> {
+  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
+  const hash = sha256(schema);
+  const cached = readDdlCache();
+  if (cached?.hash === hash && cached.ddl) return cached.ddl;
+
+  const ddl = generateDdl();
+  try {
+    fs.mkdirSync(CACHE_DIR, { recursive: true });
+    writeFileAtomic(
+      DDL_CACHE_PATH,
+      JSON.stringify({ hash, ddl, generatedAt: new Date().toISOString() })
+    );
+  } catch {
+    // Best effort: the fresh DDL is returned even when persisting fails.
+  }
+  return ddl;
+}
+
+function readDdlCache(): { hash?: string; ddl?: string } | undefined {
+  try {
+    return JSON.parse(fs.readFileSync(DDL_CACHE_PATH, 'utf8')) as { hash?: string; ddl?: string };
+  } catch {
+    return undefined;
+  }
+}
+
+function generateDdl(): string {
+  const result = spawnSync(
+    'npx',
+    [
+      'prisma',
+      'migrate',
+      'diff',
+      '--from-empty',
+      '--to-schema',
+      'prisma/schema.prisma',
+      '--script',
+    ],
+    {
+      cwd: ROOT,
+      encoding: 'utf8',
+      shell: process.platform === 'win32',
+      timeout: 180_000,
+      maxBuffer: 64 * 1024 * 1024,
+    }
+  );
+  if (result.error || result.status !== 0) {
+    const cause = (result.error?.message ?? result.stderr ?? result.stdout ?? '').trim();
+    throw new Error(
+      `Failed to generate the test schema DDL (\`prisma migrate diff\`). Run \`npm run prisma:generate\` (or \`npm ci\`) first, then re-run the tests. Cause: ${cause || `exit code ${String(result.status)}`}`
+    );
+  }
+  return result.stdout;
+}
+
+/** Applies the test schema to a fresh PGlite instance (#152 swaps the DDL source here). */
+export async function applyTestSchema(pglite: PGlite): Promise<void> {
+  await pglite.exec(await getTestSchemaDdl());
+}
+
+/**
+ * Data-dir template with the schema applied and zero rows — the fast path
+ * booted by every `createTestPglite()`. Memoized per process and persisted
+ * under a name keyed by the DDL hash, so schema changes rebuild it.
+ */
+export async function getTemplateDataDir(): Promise<Blob> {
+  templatePromise ??= loadOrBuildTemplate();
+  return templatePromise;
+}
+
+async function loadOrBuildTemplate(): Promise<Blob> {
+  const ddl = await getTestSchemaDdl();
+  const templatePath = path.join(
+    CACHE_DIR,
+    `${TEMPLATE_FILE_PREFIX}${sha256(ddl)}${TEMPLATE_FILE_SUFFIX}`
+  );
+  activeTemplatePath = templatePath;
+  if (fs.existsSync(templatePath)) {
+    return new Blob([fs.readFileSync(templatePath)]);
+  }
+
+  const builder = new PGlite();
+  try {
+    await builder.waitReady;
+    await builder.exec(ddl);
+    const dump = await builder.dumpDataDir('none');
+    try {
+      fs.mkdirSync(CACHE_DIR, { recursive: true });
+      writeFileAtomic(templatePath, Buffer.from(await dump.arrayBuffer()));
+      removeStaleTemplates(path.basename(templatePath));
+    } catch {
+      // Best effort: a racing worker may hold the path; the in-memory dump
+      // still serves this process.
+    }
+    return dump;
+  } finally {
+    await builder.close();
+  }
+}
+
+/**
+ * Boots a fresh in-memory test database. Fast path loads the data-dir
+ * template; a template that fails to initialize is discarded (forcing a
+ * rebuild by the next process) and this instance falls back to a fresh PGlite
+ * with the DDL replayed.
+ */
+export async function createTestPglite(): Promise<PGlite> {
+  const template = await getTemplateDataDir();
+  const preloaded = new PGlite({ loadDataDir: template });
+  try {
+    await preloaded.waitReady;
+    return preloaded;
+  } catch {
+    await closeQuietly(preloaded);
+    discardTemplate();
+  }
+
+  const pglite = new PGlite();
+  await pglite.waitReady;
+  await applyTestSchema(pglite);
+  return pglite;
+}
+
+async function closeQuietly(pglite: PGlite): Promise<void> {
+  try {
+    await pglite.close();
+  } catch {
+    // A PGlite whose initialization failed also fails to close; there is
+    // nothing left to release.
+  }
+}
+
+function discardTemplate(): void {
+  if (!activeTemplatePath) return;
+  try {
+    fs.rmSync(activeTemplatePath, { force: true });
+  } catch {
+    // Best effort — a later process rebuilds it anyway.
+  }
+}
+
+function removeStaleTemplates(currentFileName: string): void {
+  for (const entry of fs.readdirSync(CACHE_DIR)) {
+    if (!entry.startsWith(TEMPLATE_FILE_PREFIX) || entry === currentFileName) continue;
+    try {
+      fs.rmSync(path.join(CACHE_DIR, entry), { force: true });
+    } catch {
+      // In use by a concurrent worker; cleaned up by a later run.
+    }
+  }
+}
diff --git a/tests/helpers/test-db.ts b/tests/helpers/test-db.ts
index 19e8981..a54f8a5 100644
--- a/tests/helpers/test-db.ts
+++ b/tests/helpers/test-db.ts
@@ -1,72 +1,39 @@
-import { execSync } from 'node:child_process';
-import { PrismaPg } from '@prisma/adapter-pg';
+import type { PGlite } from '@electric-sql/pglite';
+import { PrismaPGlite } from 'pglite-prisma-adapter';
 import { PrismaClient } from '../../src/utils/prisma-client.js';
-import { PRISMA_CONNECT_TIMEOUT_MS } from '../../src/utils/prisma-factory.js';
+import { createTestPglite } from './pglite-template.js';
 
+/**
+ * In-memory PGlite database for integration-style tests — no PostgreSQL
+ * process, no `DATABASE_URL`. Each instance owns its own database.
+ */
 export class TestDatabase {
-  private readonly prisma: PrismaClient;
-  private readonly databaseUrl: string;
-  private readonly previousDatabaseUrl: string | undefined;
+  private prisma: PrismaClient | undefined;
+  private pglite: PGlite | undefined;
   private isClosed = false;
 
-  constructor() {
-    this.previousDatabaseUrl = process.env['DATABASE_URL'];
-    this.databaseUrl =
-      process.env['TEST_DATABASE_URL'] ||
-      'postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test';
-
-    process.env['DATABASE_URL'] = this.databaseUrl;
-    const adapter = new PrismaPg({
-      connectionString: this.databaseUrl,
-      connectionTimeoutMillis: PRISMA_CONNECT_TIMEOUT_MS,
-    });
-    this.prisma = new PrismaClient({ adapter });
-  }
-
   async setup(): Promise<void> {
-    try {
-      execSync('npx prisma migrate deploy', {
-        stdio: 'pipe',
-        env: { ...process.env, DATABASE_URL: this.databaseUrl },
-      });
-    } catch (_error) {
-      try {
-        execSync('npx prisma db push --accept-data-loss', {
-          stdio: 'pipe',
-          env: { ...process.env, DATABASE_URL: this.databaseUrl },
-        });
-      } catch (pushError) {
-        throw new Error(
-          `Failed to setup test database schema: ${pushError instanceof Error ? pushError.message : String(pushError)}`
-        );
-      }
-    }
+    const pglite = await createTestPglite();
+    this.pglite = pglite;
+    this.prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });
   }
 
   /**
    * Order contract: `isClosed` is set synchronously before any await, so a
    * concurrent `cleanup()` can only hit its early-exit branch. After teardown,
-   * `cleanup()` is a silent no-op. Callers must not call `cleanup()` first and
-   * expect it to persist anything — it only deletes rows listed in `ids`.
+   * `cleanup()` is a silent no-op. Safe to call without a prior `setup()`.
    */
   async teardown(): Promise<void> {
     if (this.isClosed) return;
     this.isClosed = true;
-    try {
-      await this.prisma.$disconnect();
-    } finally {
-      if (this.previousDatabaseUrl === undefined) {
-        delete process.env['DATABASE_URL'];
-      } else {
-        process.env['DATABASE_URL'] = this.previousDatabaseUrl;
-      }
-    }
+    await this.prisma?.$disconnect();
+    await this.pglite?.close();
   }
 
   /**
    * Deletes rows for the given ids (per-test isolation). Silent no-op after
-   * `teardown()` (see order contract above); before teardown it throws when the
-   * database is unreachable.
+   * `teardown()` (see order contract above); before teardown it throws when
+   * the database is unreachable.
    */
   async cleanup(ids: {
     responses?: string[];
@@ -82,48 +49,52 @@ export class TestDatabase {
     apiKeys?: string[];
   }): Promise<void> {
     if (this.isClosed) return;
+    const prisma = this.requirePrisma();
     if (ids.responses?.length) {
-      await this.prisma.response.deleteMany({ where: { id: { in: ids.responses } } });
+      await prisma.response.deleteMany({ where: { id: { in: ids.responses } } });
     }
     if (ids.messages?.length) {
-      await this.prisma.message.deleteMany({ where: { id: { in: ids.messages } } });
+      await prisma.message.deleteMany({ where: { id: { in: ids.messages } } });
     }
     if (ids.analysisReports?.length) {
-      await this.prisma.analysisReport.deleteMany({ where: { id: { in: ids.analysisReports } } });
+      await prisma.analysisReport.deleteMany({ where: { id: { in: ids.analysisReports } } });
     }
     if (ids.analysisFailures?.length) {
-      await this.prisma.analysisFailure.deleteMany({ where: { id: { in: ids.analysisFailures } } });
+      await prisma.analysisFailure.deleteMany({ where: { id: { in: ids.analysisFailures } } });
     }
     if (ids.batchAnalysisReports?.length) {
-      await this.prisma.batchAnalysisReport.deleteMany({
+      await prisma.batchAnalysisReport.deleteMany({
         where: { id: { in: ids.batchAnalysisReports } },
       });
     }
     if (ids.interviews?.length) {
-      await this.prisma.interview.deleteMany({ where: { id: { in: ids.interviews } } });
+      await prisma.interview.deleteMany({ where: { id: { in: ids.interviews } } });
     }
     if (ids.interviewPlans?.length) {
-      await this.prisma.interviewPlan.deleteMany({ where: { id: { in: ids.interviewPlans } } });
+      await prisma.interviewPlan.deleteMany({ where: { id: { in: ids.interviewPlans } } });
     }
     if (ids.templates?.length) {
-      await this.prisma.template.deleteMany({ where: { id: { in: ids.templates } } });
+      await prisma.template.deleteMany({ where: { id: { in: ids.templates } } });
     }
     if (ids.templateNames?.length) {
-      await this.prisma.template.deleteMany({ where: { name: { in: ids.templateNames } } });
+      await prisma.template.deleteMany({ where: { name: { in: ids.templateNames } } });
     }
     if (ids.auditLogs?.length) {
-      await this.prisma.auditLog.deleteMany({ where: { id: { in: ids.auditLogs } } });
+      await prisma.auditLog.deleteMany({ where: { id: { in: ids.auditLogs } } });
     }
     if (ids.apiKeys?.length) {
-      await this.prisma.apiKey.deleteMany({ where: { id: { in: ids.apiKeys } } });
+      await prisma.apiKey.deleteMany({ where: { id: { in: ids.apiKeys } } });
     }
   }
 
   getPrisma(): PrismaClient {
-    return this.prisma;
+    return this.requirePrisma();
   }
 
-  getDatabaseUrl(): string {
-    return this.databaseUrl;
+  private requirePrisma(): PrismaClient {
+    if (!this.prisma) {
+      throw new Error('TestDatabase.setup() must complete before the database can be used');
+    }
+    return this.prisma;
   }
 }
diff --git a/tests/pglite-template.test.ts b/tests/pglite-template.test.ts
new file mode 100644
index 0000000..3da0f78
--- /dev/null
+++ b/tests/pglite-template.test.ts
@@ -0,0 +1,53 @@
+import { PGlite } from '@electric-sql/pglite';
+import { describe, expect, it } from 'vitest';
+import { applyTestSchema, createTestPglite, getTestSchemaDdl } from './helpers/pglite-template.js';
+
+/**
+ * @test REQ-PRISMA7-002
+ * @intent DDL 回放契约（冷启动回退路径）：DDL 生成结果跨调用记忆化；新鲜 PGlite 回放后
+ *         schema 可查询；模板快路径与 DDL 回放路径落出同一 public 表集合（AC-PRISMA7-002-01
+ *         「PGlite 内存库回放 DDL 成功」的直接证据）
+ * @covers AC-PRISMA7-002-01
+ */
+describe('pglite-template contract', () => {
+  it('memoizes the generated DDL across calls', async () => {
+    const first = await getTestSchemaDdl();
+    const second = await getTestSchemaDdl();
+
+    expect(first).toBe(second);
+    expect(first).toContain('CREATE TABLE');
+  });
+
+  it('replays the DDL onto a fresh in-memory PGlite (fallback path)', async () => {
+    const replay = new PGlite();
+    await replay.waitReady;
+    try {
+      await applyTestSchema(replay);
+
+      expect(await publicTables(replay)).toContain('Interview');
+    } finally {
+      await replay.close();
+    }
+  });
+
+  it('fast path (loadDataDir) and fallback (DDL replay) agree on the public table set', async () => {
+    const fastPath = await createTestPglite();
+    const replay = new PGlite();
+    await replay.waitReady;
+    try {
+      await applyTestSchema(replay);
+
+      expect(await publicTables(fastPath)).toEqual(await publicTables(replay));
+    } finally {
+      await fastPath.close();
+      await replay.close();
+    }
+  });
+});
+
+async function publicTables(pglite: PGlite): Promise<string[]> {
+  const result = await pglite.query<{ table_name: string }>(
+    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
+  );
+  return result.rows.map((row) => row.table_name);
+}
diff --git a/tests/server-lifecycle.test.ts b/tests/server-lifecycle.test.ts
index 6db12a3..fd11471 100644
--- a/tests/server-lifecycle.test.ts
+++ b/tests/server-lifecycle.test.ts
@@ -229,6 +229,9 @@ describe('server resource lifecycle', () => {
     vi.stubEnv('SESSION_SALT', 'b'.repeat(32));
     vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
     vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
+    // createPrismaClient() requires DATABASE_URL; the facade is mocked in this
+    // file, so this only satisfies the guard — no database is used.
+    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');
   });
 
   afterEach(() => {
diff --git a/tools/spike/prisma7-pglite-spike.mjs b/tools/spike/prisma7-pglite-spike.mjs
index 8a974ad..6aba571 100644
--- a/tools/spike/prisma7-pglite-spike.mjs
+++ b/tools/spike/prisma7-pglite-spike.mjs
@@ -42,6 +42,17 @@ function shouldRun(id) {
   return only.length === 0 || only.includes(String(id));
 }
 
+// Criteria expected to FAIL by design, accepted in the M1 report
+// (stage0-spike-report.md): PGlite serializes interactive transactions on its
+// single connection, so #6b's concurrent optimistic-lock race is physically
+// unreproducible — a carrier capability limit, not a PGlite correctness gap.
+//
+// Verdict semantics:
+//   PASS   all criteria pass                          -> exit 0
+//   PASS#  only expected fails (accepted)             -> exit 0
+//   FAIL   at least one unexpected failure            -> exit 1
+const EXPECTED_FAILS = new Set(['6b']);
+
 async function record(id, name, fn) {
   if (!shouldRun(id)) return;
   const started = Date.now();
@@ -886,13 +897,18 @@ async function main() {
     );
   }
 
+  const failed = RESULTS.filter((r) => r.status === 'FAIL');
+  const expected = failed.filter((r) => EXPECTED_FAILS.has(String(r.id)));
+  const unexpected = failed.filter((r) => !EXPECTED_FAILS.has(String(r.id)));
   const summary = {
     startedAt: startedAt.toISOString(),
     finishedAt: new Date().toISOString(),
     platform: `${process.platform}/${process.arch}`,
     node: process.version,
     results: RESULTS,
-    verdict: RESULTS.some((r) => r.status === 'FAIL') ? 'FAIL' : 'PASS',
+    expectedFails: expected.map((r) => String(r.id)),
+    unexpectedFails: unexpected.map((r) => String(r.id)),
+    verdict: unexpected.length > 0 ? 'FAIL' : expected.length > 0 ? 'PASS#' : 'PASS',
   };
   const jsonPath = arg('--json');
   if (jsonPath) {
@@ -900,9 +916,14 @@ async function main() {
     console.log(`\nJSON written: ${jsonPath}`);
   }
   console.log(
-    `\n=== verdict: ${summary.verdict} (${RESULTS.filter((r) => r.status === 'FAIL').length} failed / ${RESULTS.length} run) ===\n`
+    `\n=== verdict: ${summary.verdict} (${unexpected.length} unexpected failed / ${expected.length} expected / ${RESULTS.length} run) ===`
   );
-  process.exit(summary.verdict === 'PASS' ? 0 : 1);
+  if (expected.length > 0) {
+    console.log(
+      `expected fails (accepted): ${expected.map((r) => `#${r.id}`).join(', ')} — see stage0-spike-report.md`
+    );
+  }
+  process.exit(summary.verdict === 'FAIL' ? 1 : 0);
 }
 
 async function c11_freshInstall() {
@@ -944,7 +965,11 @@ async function c11_freshInstall() {
   if (hasConfig) fs.copyFileSync(path.join(pkgDir, 'prisma.config.ts'), shippedConfigBackup);
 
   // --no-generate existence probe (R4-T1 path 1)
-  const help = run('npx', ['--yes', 'prisma@7.10.0', 'db push', '--help'], {
+  // NOTE: 'db' and 'push' MUST be separate argv tokens — a single 'db push'
+  // string only works on Windows (shell:true joins+re-splits) and fails on
+  // Linux/macOS (shell:false passes it as one literal token → unknown command,
+  // help printed, exit 1). See M1 addendum (ubuntu run 36600066391).
+  const help = run('npx', ['--yes', 'prisma@7.10.0', 'db', 'push', '--help'], {
     cwd: prismaRunCwd,
     timeout: 240_000,
   });
@@ -1041,7 +1066,7 @@ export default {
       // fallback: the dedicated test database already exists — same schema, safe target
       const fallbackUrl =
         process.env.TEST_DATABASE_URL || baseUrl.replace(/\/[^/]+$/, '/dialog_survey_test');
-      const probe = run('npx', ['--yes', 'prisma@7.10.0', 'db push', '--help'], {
+      const probe = run('npx', ['--yes', 'prisma@7.10.0', 'db', 'push', '--help'], {
         cwd: prismaRunCwd,
         env: process.env,
         timeout: 120_000,
@@ -1054,7 +1079,7 @@ export default {
     }
   }
   if (created) {
-    const baseArgs = ['--yes', 'prisma@7.10.0', 'db push', '--schema', 'prisma/schema.prisma'];
+    const baseArgs = ['--yes', 'prisma@7.10.0', 'db', 'push', '--schema', 'prisma/schema.prisma'];
     const pushEnv = { ...process.env, DATABASE_URL: pushTarget };
     // default behavior: does db push auto-generate (write artifacts into the installed package)?
     const defaultPush = run('npx', baseArgs, { cwd: prismaRunCwd, env: pushEnv, timeout: 300_000 });
diff --git a/vitest.config.ts b/vitest.config.ts
index a50e71d..8985bb9 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1,9 +1,15 @@
+import os from 'node:os';
 import { defineConfig } from 'vitest/config';
 
+// §3.6 starting point: PGlite per-file workers hold ~140MB+ each — cap the
+// pool, refine only if T-m3/T-m4 measurements say otherwise.
+const maxWorkers = Math.min(4, os.cpus().length);
+
 export default defineConfig({
   test: {
     include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
     exclude: ['node_modules/', 'dist/', 'coverage/'],
+    globalSetup: ['tests/global-setup.ts'],
     coverage: {
       provider: 'v8',
       reporter: ['text', 'json', 'html'],
@@ -26,5 +32,6 @@ export default defineConfig({
     testTimeout: 30000,
     retry: 1,
     fileParallelism: true,
+    maxWorkers,
   },
 });
```
