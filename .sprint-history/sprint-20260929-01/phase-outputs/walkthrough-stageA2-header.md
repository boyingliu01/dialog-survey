# Code Walkthrough — Stage A changeset + R2 response (Prisma 7 facade switch)

## Scope

| Field | Value |
|---|---|
| Repo | dialog-survey (Fastify 5 + PostgreSQL + Prisma) |
| Branch | sprint/2026-09-29-01 |
| Commit under review | eb707f98c6ff3e4f97da079bf9b0c24a6cc9df42 |
| Range | 0820555^ → eb707f9 (Stage A changeset + walkthrough Round-2 response commit) |
| Diff base | 0820555^ (the full walkthrough range, covering both commits) |
| Stats | 90 files changed: +658 / −320 |

This is the Round-3 artifact: the previous range (88 files, +636/−318) plus the
Round-2 response commit eb707f9 (`fix(#149): walkthrough R2 responses — timeout
dedup + test hygiene`, 7 files, +25/−5). The response commit resolves concrete
Round-1/2 panel asks; every item is enumerated with evidence in the attached
context file `.sprint-state/phase-outputs/walkthrough-round2-response.md`.

### Delta introduced by eb707f9 (relative to the previously reviewed 0820555)

1. **Timeout constant dedup** (T-M): `PRISMA_CONNECT_TIMEOUT_MS = 5000` is now a
   single exported constant in `src/utils/prisma-factory.ts`; both test helpers
   (`tests/helpers/create-test-prisma.ts`, `tests/helpers/test-db.ts`) import it
   instead of duplicating the literal.
2. **Flake-triage protocol** (F-M2, explicit ask): new "Shared test DB (interim,
   until Stage B PGlite isolation)" section in `AGENTS.md` — rerun the file in
   isolation first (`npx vitest run <file> --no-file-parallelism`), fix by scoping
   fixtures, never weaken assertions; Stage B eliminates structurally.
3. **Vitest upgrade note** (F minor): `AGENTS.md` records that Vitest 4 awaits
   async suite factories (re-verify on upgrade).
4. **ws mock comment** (T minor): the fake `ws` module documents its single-symbol
   assumption.
5. **Docstring clarity** (T minor): `getSharedTestPrisma()` disconnect-ownership
   docstring now states per-file module isolation.
6. **`tests/db.test.ts`**: added `afterAll(vi.unstubAllEnvs)`.
   **`tests/graph.test.ts`**: stub intentionally lives for process lifetime — the
   experimentally-verified failure with `afterAll` unstub (pending `setImmediate`
   outlives the last test) is documented in the comment and in the response file.

## Change summary (cumulative range)

1. **Facade switch (production)**: `src/server.ts`, `src/utils/db.ts`, seeds, and
   ~20 service/api/core/repository modules import `PrismaClient` from the facade
   `src/utils/prisma-client.js` and construct only via `createPrismaClient()` from
   `src/utils/prisma-factory.js`. `BuildAppOptions` gains
   `prismaFactory?: () => PrismaClient`; `checkDatabaseConnection(prismaFactory =
   createPrismaClient)` moves the factory call inside its try block.
2. **Test-domain three-way classification of 26 Prisma construction sites**:
   (a) 22 → `getSharedTestPrisma()`; (b) 3 → kept in vi.mock domains; (c) 1 →
   helper-internal. New `tests/helpers/create-test-prisma.ts`; 79-file import
   rewrite (`@prisma/client` → facade) across src and tests.
3. **CI**: `.github/workflows/pr.yml` — explicit `prisma generate` before tsc/test
   in 6 jobs; `workflow_dispatch` added.
4. **Test stability fixes**: DATABASE_URL stubs, fake `ws` module, e2e login
   `waitUntil: 'commit'`, 15s polling for two HTMX fragment assertions, file-private
   userIds, `Phone-`-scoped safety net.

## Review focus (code-walkthrough dimensions)

- **Correctness**: facade/factory wiring, DI seam semantics, test classification soundness
- **Security**: no new injection / leak surface; CI and env handling
- **Maintainability**: import direction rules, naming, structure, constant ownership
- **Test coverage**: the changeset must not weaken existing coverage

---

## Full diff (0820555^ → eb707f9, 90 files)
