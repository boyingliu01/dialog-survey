# AGENTS.md — Dialog Survey Project Knowledge Base

> Updated: 2026-09-30 (v1.8.9). Sprint #149 (Prisma 7 migration). 58 source TS files, 117 test files, ~1266 tests. Tests need no PostgreSQL (PGlite).

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
| Tests | `tests/` | 117 files, flat structure, Vitest 4.x; needs no PostgreSQL |

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
npx prisma generate   # generate src/generated/prisma (run after checkout; CI does it per job)
npm run dev           # tsx --watch, port 3001
npm run build         # tsc → dist/
npm run test          # vitest (watch); CI uses npx vitest run
npm run test:coverage # coverage (80/80/70/80 threshold)
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
- **CI**: PRs run 7 jobs (static-analysis, unit-tests, integration-tests, security-scan, coverage, smoke, e2e-tests). No PostgreSQL service; every job runs `npx prisma generate` (generated client is gitignored).
- **API bug triage**: curl → isolate backend first. htmx.ajax() `.then()` fires on 4xx with `undefined` arg.

