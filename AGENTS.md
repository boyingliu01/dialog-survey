# AGENTS.md — Dialog Survey Project Knowledge Base

> Updated: 2026-10-03 (v1.11.1). Sprint #153 (Conventional Commits + auto CHANGELOG + release automation). 58 source TS files, 125 test files. Tests need no PostgreSQL (PGlite).

## Overview

AI-powered survey dialog bot — async multi-turn conversations via DingTalk with LLM-driven follow-ups and context memory. Fastify 5 + PostgreSQL + Prisma 7 (driver adapters) + custom LangGraph workflow.

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| API routes | `src/api/` | Fastify route handlers, no controllers |
| State machine | `src/core/` | Custom imperative graph (NOT LangGraph SDK) |
| Business logic | `src/services/` | 18 services, orchestration + analytics + export |
| Data access | `src/repositories/` | Prisma ORM, optimistic locking in state repo |
| DingTalk + LLM | `src/integrations/` | DingTalk REST/Stream, OpenAI-compatible LLM |
| Nunjucks views | `src/views/` | Admin UI via HTMX fragments + Alpine.js |
| Utilities | `src/utils/` | Logger, security, retry, markdown, PII |
| Prisma client | `src/generated/prisma` (generated, gitignored) | Facade `src/utils/prisma-client.ts` + factory `src/utils/prisma-factory.ts`; run `npx prisma generate` after checkout |
| Tests | `tests/` | 125 files, flat structure, Vitest 4.x; needs no PostgreSQL |

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
npm run build         # tsc → dist/
npm run test          # vitest (watch); CI uses npx vitest run
npm run test:coverage # coverage (80/80/70/80 threshold)
npm run test:mutation # full Stryker mutation run (slow, local)
npm run test:mutation:incremental # git-diff incremental mutation (issue #155; advisory in CI)
npm run smoke         # type-check + lint + ~44 key tests
npm run lint          # biome lint src/
npm run type-check    # tsc --noEmit
npm run check         # biome check (lint + imports)
npm run check:fix     # biome check + auto-fix
```

## Notes

- **No DB for tests**: full `vitest run` uses PGlite (WASM) per test file — no PostgreSQL required. DDL + data-dir caches live in `node_modules/.cache/dialog-survey/` (invalidated by schema hash); the first cold setup spawns `prisma migrate diff` (~2-4s). `globalSetup` auto-runs `prisma generate` once if `src/generated/prisma` is missing.
- **Test parallel safety**: suites run with `fileParallelism: true`; each file gets an isolated PGlite instance. On a gate failure, rerun the failing file in isolation first; fix cross-file collisions by scoping fixtures (file-unique ids, cleanup predicates) — never by weakening assertions.
- **Vitest async suites**: Vitest 4 awaits async `describe` callbacks — several suites rely on a describe-level `await getSharedTestPrisma()`. Re-verify async-suite semantics when upgrading Vitest.
- **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → find the PID (`netstat -ano | findstr :3001` on Windows, `fuser -k 3001/tcp` on WSL/Linux) and kill it first.
- **Test layers**: Unit (mock Prisma) / Integration (PGlite in-process, parallel-safe) / E2E in `tests/e2e/` (11 files: in-process Fastify + real chromium via Playwright).
- **CI**: PRs run 10 jobs (static-analysis, unit-tests, integration-tests, security-scan, coverage, e2e-tests, mutation-tests [advisory], smoke, commit-lint, version-consistency). No PostgreSQL service; the consuming jobs run `npx prisma generate` before tsc/vitest (security-scan and version-consistency are static-only; generated client is gitignored). **Integration suites must be named `*.integration.test.ts` (dot, not hyphen)** — the job glob is `tests/*.integration.test.ts` and the unit job excludes the same pattern, so a hyphenated name is silently selected by the wrong job.
- **Mutation testing (issue #155)**: Stryker + vitest runner via `stryker.conf.json`. Incremental runs (`scripts/mutation-test.mjs`) mutate only files changed vs the base ref and fan out over ≥4 workers; the CI `mutation-tests` job is advisory (`continue-on-error`). Mutant runs use `vitest.config.mutation.ts` (e2e excluded, no retries).
- **API bug triage**: curl → isolate backend first. htmx.ajax() `.then()` fires on 4xx with `undefined` arg.
- **Credential-free startup (issue #171)**: without `DINGTALK_CLIENT_ID`/`DINGTALK_CLIENT_SECRET`, `buildApp()` boots read-only (no Stream client). `runPostListenStartup` resends unsent messages only when all three DingTalk creds are set and `DISABLE_STARTUP_RESEND` (1/true/yes) is not set — startup outbound sends are a production side effect, never re-enable them unconditionally.
- **Commits**: Conventional Commits are enforced in CI by the `commit-lint` job (PR title blocking; branch range advisory). An opt-in local hook exists but is **not installed by default** — run `scripts/install-git-hooks.sh install` to enable it. See `docs/contributing.md`.
- **Releasing**: `scripts/release.sh` is a **dry run by default**; pass `--execute` to release. It refuses to start unless `VERSION == package.json`, requires `GITHUB_TOKEN` when `github.release=true` (release-it otherwise skips the GitHub Release and still exits 0), and verifies the result afterwards. The `after:bump` hook key in `.release-it.json` must be the **bare** `after:bump`: a key naming a plugin namespace (e.g. `after:version:bump`) is never invoked, which leaves `VERSION` and `AGENTS.md` stale while still exiting 0 and still tagging. `tests/release-hook-key.test.ts` is the behavioural control proving this. Never force-move a released tag.

