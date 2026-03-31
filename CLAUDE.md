# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered interview robot that conducts async multi-turn interviews via DingTalk. Uses LangGraph.js for conversation flow, Fastify for API, DashScope (Alibaba Qwen) for LLM, Fun-ASR for voice transcription, Prisma 7.x for ORM, and PostgreSQL for persistence.

**Tech Stack**: TypeScript (strict mode), Fastify, LangGraph.js, Prisma 7.x, Vitest

## Commands

All commands run from `interview-bot/`:

```bash
# Install dependencies
npm install

# Generate Prisma client (requires DATABASE_URL in .env)
bunx prisma generate

# Push database schema
bunx prisma db push

# Run development server
npm run dev

# Type check
npm run type-check

# Run all tests
npm test

# Run single test file
npm test tests/unit/core/graph.test.ts

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Build
npm run build
```

## Architecture

Four-layer architecture:

1. **Access Layer** — DingTalk webhook (`/api/webhook`) receives text/voice messages, verifies signatures, ASR converts voice to text
2. **Application Layer** — LangGraph.js StateGraph drives conversation; DingTalk adapter handles message parsing and session routing
3. **AI Service Layer** — DashScope/Qwen LLM for dialogue, follow-up judgment, and report generation
4. **Storage Layer** — PostgreSQL via Prisma ORM 7.x with adapter pattern, JSON files for interview templates, Markdown files for generated reports under `reports/{interview_id}/`

### LangGraph.js Conversation Flow

```
START → planning → interviewing → [conditional edge] → followup → interviewing → ... → analyzing → END
```

State is defined using LangGraph `Annotation.Root` pattern. State persists across message turns via `MemorySaver` checkpointer.

### Key Source Layout

```
interview-bot/src/
├── api/              # Fastify routes, Zod validation schemas
├── core/             # LangGraph StateGraph, nodes, edges, state annotation
│   ├── graph.ts      # Conversation graph definition
│   ├── state.ts      # InterviewState Annotation.Root
│   ├── nodes.ts      # Node functions (planning, interviewing, followup, analyzing)
│   └── edges.ts      # Conditional edge functions
├── services/         # External service integrations
│   ├── llm/          # DashScope/Qwen LLM provider
│   ├── conversation/ # ConversationEngine orchestrator
│   ├── dingtalk.ts   # DingTalk message adapter (parsing + sending)
│   └── asr/          # Fun-ASR voice transcription
├── repositories/     # Prisma data access layer
├── db/               # Prisma client with adapter
├── generated/        # Generated Prisma client
├── utils/            # Validation, logging, helpers
└── config.ts         # Environment configuration (Zod)
```

### Prisma 7.x Configuration

Prisma 7.x requires:
- `prisma.config.ts` at project root for CLI operations
- Adapter pattern in `src/db/index.ts` using `@prisma/adapter-pg`
- Generated client in `src/generated/prisma/client/`
- No `url` in schema datasource (configured in `prisma.config.ts`)

### Interview Templates

Templates are JSON files in `templates/` with this structure:
- `topics[]` — Interview topics, each with `id`, `name`, `description`, `initial_question`
- `questions[]` — Questions with `id`, `type` (rating/text/single_choice/yes_no), `text`, optional `follow_ups[]`, optional `condition` for conditional display
- `domain_context` — Context passed to LLM for domain-specific understanding

### Testing with Vitest

Tests are in `tests/unit/` mirroring `src/` structure:
- Use `vitest` `describe`, `it`, `expect` syntax
- Mock external services with `vi.mock()` and `vi.fn()`
- Use `beforeEach/afterEach` for setup/teardown
- Run specific tests: `npm test tests/unit/core/graph.test.ts`

### Environment Variables

Required in `interview-bot/.env` (copy from `.env.example`):
- `LLM_API_KEY` — DashScope API key
- `LLM_ENDPOINT` — DashScope endpoint URL
- `DATABASE_URL` — PostgreSQL connection string
- `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, `DINGTALK_AGENT_ID`
- `PUBLIC_URL` — Public HTTPS URL for DingTalk callback registration
- `INTERNAL_API_KEY` — API key for authenticating internal endpoints (required)

Optional:
- `PORT` — Server port (default: 3000)
- `LOG_LEVEL` — Logging level (default: info)
- `CORS_ORIGINS` — Comma-separated list of allowed CORS origins

## API Endpoints

- `GET /api/webhook` — DingTalk webhook verification
- `POST /api/webhook` — DingTalk message handler (text and voice)
- `GET /api/interviews` — List interviews (`status`, `limit`, `offset` query params) ⚠️ Requires `X-API-Key` header
- `GET /api/interviews/{session_id}` — Get interview details with messages ⚠️ Requires `X-API-Key` header
- `GET /api/interviews/{session_id}/report` — Get generated report ⚠️ Requires `X-API-Key` header
- `POST /api/interviews/{session_id}/end` — End an in-progress interview ⚠️ Requires `X-API-Key` header
- `GET /api/templates` — List available interview templates
- `GET /api/templates/{template_id}` — Get template details

## Generated Reports

Reports are saved as Markdown files under `reports/{session_id}/report_{timestamp}.md`. The `report_path` is stored in the `Interview` model.

## Design Docs

Detailed requirements, architecture, and implementation plans are in `docs/plans/` and `.speckit/`.

## Code Style

- **TypeScript strict mode** enabled
- Use Zod for runtime validation
- Follow existing patterns in codebase
- Keep changes minimal and focused
- Never suppress type errors with `as any` or `@ts-ignore`
- Use Prisma adapter pattern for database connections