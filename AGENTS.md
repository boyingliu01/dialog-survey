# AGENTS.md — Dialog Survey Project Knowledge Base

> Updated: 2026-10-24 (v1.11.21). Sprint #153 (Conventional Commits + auto CHANGELOG + release automation). 76 source TS files (src/, excluding generated), 167 test files. Tests need no PostgreSQL (PGlite).

## Overview

AI-powered survey dialog bot — async multi-turn conversations via DingTalk with LLM-driven follow-ups and context memory. Fastify 5 + PostgreSQL + Prisma 7 (driver adapters) + custom LangGraph workflow.

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| API routes | `src/api/` | Fastify route handlers, no controllers; admin routes split by responsibility under `src/api/admin/` (see `src/api/admin-templates.ts`, now 39 lines of wiring) |
| State machine | `src/core/` | Custom imperative graph (NOT LangGraph SDK) |
| Business logic | `src/services/` | 16 services, orchestration + analytics + export |
| Data access | `src/repositories/` | Prisma ORM, optimistic locking in state repo |
| DingTalk + LLM | `src/integrations/` | DingTalk REST/Stream, OpenAI-compatible LLM |
| Nunjucks views | `src/views/` | Admin UI via HTMX fragments + Alpine.js |
| Utilities | `src/utils/` | Logger, security, retry, markdown, PII |
| Prisma client | `src/generated/prisma` (generated, gitignored) | Facade `src/utils/prisma-client.ts` + factory `src/utils/prisma-factory.ts`; run `npx prisma generate` after checkout |
| Tests | `tests/` | 167 files, flat structure, Vitest 4.x; needs no PostgreSQL |

## Code Map (Top-Level Symbols)

| Symbol | Type | File | Role |
|--------|------|------|------|
| `buildApp()` | fn | `src/server.ts` | Fastify app factory |
| `checkDatabaseConnection()` | fn | `src/server.ts` | Health check DB probe |
| `runInterviewGraph()` | fn | `src/core/graph.ts` | Dialog state machine entry point |
| `InterviewStateSchema` | zod | `src/core/types/index.ts` | Zod schema → TS type |
| `StreamMessageService` | class | `src/services/stream-message.service.ts` | Message dispatch + dedup |
| `InterviewStateRepository` | class | `src/repositories/interview-state.repository.ts` | Optimistic locking persistence |
| `TemplateRepository` | class | `src/repositories/template.repository.ts` | Template CRUD + usage stats |
| `DingTalkClient` | class | `src/integrations/dingtalk/client.ts` | DingTalk REST API |
| `DingTalkStreamClient` | class | `src/integrations/dingtalk/stream-client.ts` | WebSocket stream |
| `LLMClient` | class | `src/integrations/llm/base.ts` | OpenAI-compatible interface |
| `PromptService` | class | `src/services/prompt.service.ts` | LLM prompt templates |
| `ExportService` | class | `src/services/export.service.ts` | PDF (Playwright) + Excel export |
| `createPrismaClient()` | fn | `src/utils/prisma-factory.ts` | Sole PrismaClient construction point (Prisma 7 adapter; throws without DATABASE_URL) |

## Conventions

| Rule | Detail |
|------|--------|
| **ESM imports** | Relative paths require `.js` extension |
| **Type imports** | `import type` for type-only, Biome `useImportType: error` |
| **No `forEach`** | Use `for...of`, Biome `noForEach: error` |
| **No console** | Use `logger.ts` (`info`, `error`, `warn`), Biome `noConsole: error` |
| **No explicit `any`** | Biome `noExplicitAny: warn` |
| **Return types** | Explicit on all public functions |
| **Error classes** | Custom subclasses (`StatePersistenceError`, `PlanNotFoundError`, etc.) |
| **Nunjucks filters** | Never chain filter after `or` — precedence trap |
| **HTMX auth** | Global via `htmx:configRequest` in `admin-tree.njk`, NEVER per-button `hx-headers` |
| **HTMX POST body** | `values: {}`, NEVER `body: JSON.stringify()` |
| **HTMX URLs** | Shell: `/admin/*`, Fragments: `/admin/content/*` |
| **Prisma client** | Import `PrismaClient` from facade `src/utils/prisma-client.js` (NEVER `src/generated/` directly); construct only via `createPrismaClient()` |

## Anti-Patterns (This Project)

| Pattern | Severity | Detail |
|---------|----------|--------|
| `new PrismaClient()` outside `prisma-factory.ts` | ERROR | Construct via `createPrismaClient()`; services receive `prisma` via DI |
| `prisma.$MODEL.$METHOD()` in API layer | ERROR | Route through repositories |
| Public `prisma` getter on services | ERROR | Encapsulate with discriminated unions |

## Commands

```bash
npx prisma generate   # generate src/generated/prisma (run after checkout; CI runs it in each consuming job)
npm run dev           # tsx --watch, port 3001
npm run build         # tsc -p tsconfig.build.json → dist/ (src only; tsconfig.json still type-checks tests)
npm run test          # vitest (watch); CI uses npx vitest run
npm run test:coverage # coverage (80/80/70/80 threshold)
npm run test:mutation # full Stryker mutation run (slow, local)
npm run test:mutation:incremental # git-diff incremental mutation (issue #155; advisory in CI)
npm run smoke         # type-check + lint + ~44 key tests
npm run lint          # biome lint src/
npm run type-check    # tsc --noEmit
npm run check         # biome check (lint + imports)
npm run check:fix     # biome check + auto-fix
npm run duplicates    # jscpd duplication check on src (threshold 1%, tools/jscpd.conf.json)
npm run complexity    # per-function CCN > 10 report (TypeScript AST; the ratchet lives in .ccn-baseline.json)
```

## Notes

- **No DB for tests**: full `vitest run` uses PGlite (WASM) per test file — no PostgreSQL required. DDL + data-dir caches live in `node_modules/.cache/dialog-survey/` (invalidated by schema hash); the first cold setup spawns `prisma migrate diff` (~2-4s). `globalSetup` auto-runs `prisma generate` once if `src/generated/prisma` is missing.
- **Test parallel safety**: suites run with `fileParallelism: true`; each file gets an isolated PGlite instance. On a gate failure, rerun the failing file in isolation first; fix cross-file collisions by scoping fixtures (file-unique ids, cleanup predicates) — never by weakening assertions.
- **Vitest async suites**: Vitest 4 awaits async `describe` callbacks — several suites rely on a describe-level `await getSharedTestPrisma()`. Re-verify async-suite semantics when upgrading Vitest.
- **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → find the PID (`netstat -ano | findstr :3001` on Windows, `fuser -k 3001/tcp` on WSL/Linux) and kill it first.
- **Test layers**: Unit (mock Prisma) / Integration (PGlite in-process, parallel-safe) / E2E in `tests/e2e/` (11 files: in-process Fastify + real chromium via Playwright).
- **CI**: PRs run 10 jobs (static-analysis, unit-tests, integration-tests, security-scan, coverage, e2e-tests, mutation-tests [advisory], smoke, commit-lint, version-consistency). No PostgreSQL service; the consuming jobs run `npx prisma generate` before tsc/vitest (security-scan and version-consistency are static-only; generated client is gitignored). **Integration suites must be named `*.integration.test.ts` (dot, not hyphen)** — the job glob is `tests/*.integration.test.ts` and the unit job excludes the same pattern, so a hyphenated name is silently selected by the wrong job.
- **Mutation testing (issue #155)**: Stryker + vitest runner via `stryker.conf.json`. Incremental runs (`scripts/mutation-test.mjs`) mutate only files changed vs the base ref and fan out over ≥4 workers; the CI `mutation-tests` job is advisory (`continue-on-error`). Mutant runs use `vitest.config.mutation.ts` (e2e excluded, no retries). **`ignorePatterns` entries must be anchored with a leading `/`** — Stryker matches them anywhere in the tree, so a bare `reports` also excluded `src/views/reports/`, the sandbox lost those `.njk` templates, and *every* mutant run died in its dry run with `GET /admin/reports` → 500 (the view engine could not find `reports/index.njk`). That surfaced as `✗ Gate M BLOCK … mutation score 0.0%` on every push touching `admin-templates.ts`. If Gate M reports 0.0% with "no test file found" warnings, check `ignorePatterns` anchoring before suspecting the tests.
- **Gate M threshold is 60%, and this codebase sits near it.** Measured scores: `stream-message.service.ts` 62.69%, `admin-templates.ts` 61.22% (both 61.20% in one run). Gate M only mutates files changed against the base ref, so a push that touches nothing in `src/` never runs it — which is why the gap went unnoticed for a long time. Do not "fix" a Gate M block by writing a `.mutation-baseline.json` by hand: a baseline can only *raise* the effective threshold (`Math.max(threshold, baselineScore)`), so a fabricated one makes the gate stricter, not looser. Raise the score with tests, or set an honest per-file threshold with an `@mutation-threshold: N` comment in the corresponding test file (`detect-ai-test.ts` reads it).
- **Gate M needs four local patches to work at all — and xp-gate updates erase them.** The gate lives outside this repo (`~/.config/xp-gate/`). Three upstream bugs in `modules/mutation/runners/stryker-runner.ts` and one in `hooks/pre-push` make it report 0.0% or SKIP regardless of test quality: repeated `--mutate` keeps only the last file, `--config` is not a Stryker option, the report is schema 1.0 (raw mutants, no aggregate score), and the TypeScript hook branch never passes `--timeout` so it uses a 120s default while these two files need ~48 minutes. Run `node scripts/verify-xp-gate-patches.cjs` to check, `--fix` to restore the hook timeout. **A blank "mutation score 0.0%" is a patch problem, not a test problem** — check this before writing more tests. Issue #209 tracks it.
- **The mutation threshold is also enforced by this repo, not only by the patched gate.** `stryker.conf.json` sets `break: 0`, so Stryker itself never fails on a low score; the 60% verdict used to come exclusively from the patched xp-gate runner. `scripts/mutation-test.mjs` now reads `.stryker-report.json` and aggregates the schema-1.0 mutant list itself, exiting 1 below the threshold (override with `MUTATION_THRESHOLD`). It exits 2 when the report is missing or has no scored mutants — "no evidence" is never a pass. `npm run test:mutation:verify` re-judges an existing report without re-running Stryker. So the threshold gives an honest verdict even with the global patches gone.
- **What a surviving mutant usually means here**: an unassertable side effect. Mocking `../src/utils/logger.js` and asserting the message turned a whole cluster of "retries exhausted" survivors into kills — the branch ran, nothing observable changed. Same for error paths: assert the exact response body, not just the status code.
- **xp-gate Gate 6 `DeadSymbol` false positives (verified on xp-gate 0.30.5)**: archlint reports `InterviewPlanSendService.{sendInvitations,resendToInterview,pausePlan,resumePlan,cancelPlan}` and `InterviewPlanService.importMembers` as dead. **They are not** — all are called from `src/api/plans.ts`, passed either to `registerLifecyclePost(path, (id) => planService.X(id))` or as a direct `planService.X(...)` call inside a route handler. archlint resolves direct calls but not a method reached through a callback/function reference, so a method that is only ever invoked indirectly looks unreferenced. Before "fixing" any DeadSymbol finding on this codebase, `grep` the method name across `src/` plus `tests/` — the ratchet baseline (`.architecture-baseline.json`) records them as known, so they do not block. Do not delete these methods and do not add `# noqa`-style suppression; the false positive is a tool limitation, not a code smell.
- **API bug triage**: curl → isolate backend first. htmx.ajax() `.then()` fires on 4xx with `undefined` arg.
- **Credential-free startup (issue #171)**: without `DINGTALK_CLIENT_ID`/`DINGTALK_CLIENT_SECRET`, `buildApp()` boots read-only (no Stream client). `runPostListenStartup` resends unsent messages only when all three DingTalk creds are set and `DISABLE_STARTUP_RESEND` (1/true/yes) is not set — startup outbound sends are a production side effect, never re-enable them unconditionally.
- **Running the gates on this machine**: the hooks have never worked here as installed. This is Windows + WSL2 with `[interop] appendWindowsPath = false`, `core.hooksPath` pointing at the Windows xp-gate directory, and a WSL user that differs from the Windows user. Use `bash scripts/run-xp-gate.sh pre-commit` (or `pre-push`): it rebuilds a usable PATH, creates POSIX shims for native `.exe` tools (`command -v` cannot see the `.exe` suffix, so Gate 8 otherwise fail-closes with "gitleaks not installed" while gitleaks is on PATH), exports a Windows `HOME` so Gate 9 can find its own modules, and adds a mount-translating `node` shim so absolute `/mnt/d/...` paths handed to `node.exe` do not become `D:\mnt\d\...`. Without the wrapper, Gate 1 reports `SKIP - npx not available` and Gate 9 reports `BLOCKED - build integrity check failed` for a path-translation problem. Five upstream defects behind this are filed as xp-gate #579–#582 and #594, documented in `docs/xp-gate-defects-2026-10.md`.
- **"Gate tool not installed" almost never means it is not installed.** `lizard` (Gate 3), `semgrep` (Gate 10) and `detect-secrets-hook` (Gate 8) are pip installs, so they land in the **WSL user's** `~/.local/bin` — and two separate things hid them. First, `~/.profile` and `~/.bashrc` both add that directory, but only *interactive login* shells read those files; the gates run from a non-interactive shell, so `command -v` found nothing. Second — and this one survives fixing the first — Python resolves user site-packages from `$HOME`, and the wrapper repoints `HOME` at the Windows profile for Gate 9's sake, so a console script on PATH died with `ModuleNotFoundError: No module named 'semgrep'`. The wrapper now captures `$wsl_home` before overwriting `HOME` and exports both `PATH` and `PYTHONUSERBASE` from it. If a tool seems missing, check `$wsl_home/.local/bin` before installing anything.
- **Gate 5's local coverage judgement was inert (xp-gate #594), worked around in `vitest.config.ts`.** Gate 5 runs `vitest run --coverage <changed test files>`; when none of those tests imports a src module, istanbul writes `total.lines.pct = "Unknown"`, the hook does `Math.round("Unknown")` → `NaN`, and `[ NaN -lt 80 ]` makes bash print `integer expression expected` and return **2** — which `if` reads as "condition false", so it took the PASS branch and logged `NaN% ✅`. `coverage.include: ['src/**/*.ts']` + `cleanOnRerun: false` forces untested files into the report on a subset run too, so the total is always a real number. Verify with `tests/coverage-gate.test.ts`. Full-suite coverage is ~93.9% lines and unchanged by this. Do not re-add `coverage.all` — it no longer exists in `@vitest/coverage-v8` v4 and silently does nothing.
- **Gate 8 needs two things that look like one.** `adapters/gate-8.sh` gates the detect-secrets half on `command -v detect-secrets-hook && [ -f .secrets.baseline ]`, so with the tool present but no baseline it still prints "unavailable". `.secrets.baseline` is committed and `.gitleaks.toml` allowlists it — the baseline contains every pattern it found as literal text, which made gitleaks report 158 hits in it. `detect-secrets-hook` also rewrites line numbers in the baseline, so a Gate 8 block reading "Please `git add .secrets.baseline`" just means re-stage that file.
- **Gate 8 reports SKIP, not PASS, and that is correct behaviour for a broken check.** gitleaks 8.30.1 does not create its `--report-path` file when a scan finds nothing, and the gate decides "did the scan run?" from that file — so on any clean machine it prints `gitleaks exited 0 but produced no readable report` and reports SKIP. The scan *does* run (`INF scanned ~N bytes` / `INF no leaks found`); the gate simply has no evidence it can trust. xp-gate #592. Do not "fix" this by making the gate print PASS, and do not treat Gate 8 SKIP as a scan failure.
- **`bash -n` both hooks before trusting any gate result.** An xp-gate self-update on 2026-10-24 introduced a stray backtick in `hooks/pre-commit` (`echo "... $new_file — ..."`), bash read the closing backtick as a command substitution start, and the file stopped parsing — so every gate after Gate 5 silently did not run while the commit was let through. `scripts/verify-xp-gate-patches.cjs` now runs `bash -n` over `pre-commit` and `pre-push` and fails if either does not parse; `npm run smoke` calls it. A syntax error is fatal to *all* gates, so it is reported separately from the Gate M patch verdict.
- **Commits**: Conventional Commits are enforced in CI by the `commit-lint` job (PR title blocking; branch range advisory). An opt-in local hook exists but is **not installed by default** — run `scripts/install-git-hooks.sh install` to enable it. See `docs/contributing.md`.
- **Releasing**: `scripts/release.sh` is a **dry run by default**; pass `--execute` to release. It refuses to start unless `VERSION == package.json`, requires `GITHUB_TOKEN` when `github.release=true` (release-it otherwise skips the GitHub Release and still exits 0), and verifies the result afterwards. The `after:bump` hook key in `.release-it.json` must be the **bare** `after:bump`: a key naming a plugin namespace (e.g. `after:version:bump`) is never invoked, which leaves `VERSION` and `AGENTS.md` stale while still exiting 0 and still tagging. `tests/release-hook-key.test.ts` is the behavioural control proving this. Never force-move a released tag.

