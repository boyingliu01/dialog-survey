# AGENTS.md — Dialog Survey Project Knowledge Base

> Generated: 2026-07-08. Commit: `073e69e` (v1.8.0). 50 source TS files, 92 test files, ~930 tests.

## Overview

AI-powered survey dialog bot — async multi-turn conversations via DingTalk with LLM-driven follow-ups and context memory. Fastify 5 + PostgreSQL + Prisma + custom LangGraph workflow.

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
| Tests | `tests/` | 92 files, flat structure, Vitest 4.x |

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

## Anti-Patterns (This Project)

| Pattern | Severity | Detail |
|---------|----------|--------|
| `new PrismaClient()` in services/routes | ERROR | Use DI via Fastify register opts |
| `prisma.$MODEL.$METHOD()` in API layer | ERROR | Route through repositories |
| Public `prisma` getter on services | ERROR | Encapsulate with discriminated unions |
| `dead-letter.service.ts` own PrismaClient | ISSUE | Should inject |
| `export.service.ts` own PrismaClient | ISSUE | Should inject |
| `batch-aggregation.service.ts` biome disable | ISSUE | `noExplicitAny` disabled |
| `as InterviewState` cast in graph.ts | ISSUE | Spread merge loses type safety |

## Commands

```bash
npm run dev           # tsx --watch, port 3001
npm run build         # tsc → dist/
npm run test          # npx vitest run
npm run test:coverage # coverage (80/80/70/80 threshold)
npm run smoke         # type-check + lint + ~44 key tests
npm run lint          # biome lint src/
npm run type-check    # tsc --noEmit
npm run check         # biome check (lint + imports)
npm run check:fix     # biome check + auto-fix
```

## Notes

- **PG required**: Full `vitest run` needs PostgreSQL. `PrismaClientInitializationError` = DB not running, not a code bug.
- **Process pollution**: `tsx --watch` leaves orphan processes. Styling issues → `fuser -k 3001/tcp` first.
- **Test layers**: Unit (mock Prisma, no DB) / Integration (real PG, 3+ files) / E2E (Playwright, future).
- **CI**: PRs run 7 jobs (analysis, unit, integration, security, coverage, smoke).
- **API bug triage**: curl → isolate backend first. htmx.ajax() `.then()` fires on 4xx with `undefined` arg.

