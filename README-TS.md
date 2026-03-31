# TypeScript Baseline

## Purpose
- Keep a single, clean TypeScript implementation (Fastify + Prisma + LangGraph) as the active codebase.
- Legacy Python implementation is archived in `legacy-python/` for reference.

## Layout
- `src/` — Fastify API, LangGraph logic, services, Prisma client.
- `tests/` — Vitest unit/integration tests for TypeScript code.
- `prisma/` — Prisma schema.
- `legacy-python/` — archived Python sources, tests, Alembic, docs.

## How to Run
```
npm install
npx prisma generate
npm run lint
npm test
npm run dev   # if you add dev script for the API
```

## Notes
- Removed `src-clean/` and `tests-clean/` duplicates; use `src/` and `tests/` only.
- Coverage artifacts (`coverage/`, `htmlcov/`) are cleaned; Vitest config lives in `vitest.config.ts`.
