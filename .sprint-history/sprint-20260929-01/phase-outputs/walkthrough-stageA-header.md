# Code Walkthrough — Stage A changeset (Prisma 7 facade switch)

## Scope

| Field | Value |
|---|---|
| Repo | dialog-survey (Fastify 5 + PostgreSQL + Prisma) |
| Branch | sprint/2026-09-29-01 |
| Commit under review | 0820555860c91e843b0936a15f81f493d5d9d500 |
| Parent | f0cc657 (M1 — dependency pre-install, facade/factory, Stage 0 spike) |
| Diff base | 0820555^ (the commit's own diff) |
| Stats | 88 files changed: +636 / −318 (3 added, 85 modified) |

Note: the parent commit f0cc657 introduced (a) the facade `src/utils/prisma-client.ts`
and (b) the factory `src/utils/prisma-factory.ts`, which this changeset starts using
everywhere; both are attached as context files. Everything else this changeset relies on
is inside the diff below.

## Change summary (from the commit)

1. **Facade switch (production)**: `src/server.ts`, `src/utils/db.ts`, seeds (`prisma/seed-*.ts`),
   `scripts/fix-max-followups.ts` and ~20 service/api/core/repository modules now import
   `PrismaClient` from the facade `src/utils/prisma-client.js` and construct instances only via
   `createPrismaClient()` from `src/utils/prisma-factory.js`.
   `BuildAppOptions` gains `prismaFactory?: () => PrismaClient`; `checkDatabaseConnection` is
   parameterized as `checkDatabaseConnection(prismaFactory = createPrismaClient)`, and the factory
   call moved inside its try block so a missing DATABASE_URL yields `false` instead of throwing.
2. **Test-domain three-way classification of 26 Prisma construction sites**:
   (a) 22 → `getSharedTestPrisma()` (17 lazily created in `beforeAll`),
   (b) 3 → kept in vi.mock domains (one redundant `vi.mock('src/server.js')` deleted so
       server-api tests now exercise the real implementation),
   (c) 1 → helper-internal.
   New `tests/helpers/create-test-prisma.ts`; 79-file import rewrite
   (`@prisma/client` type imports → facade) across src and tests.
3. **CI**: `.github/workflows/pr.yml` — explicit `prisma generate` before tsc/test in 6 jobs;
   `workflow_dispatch` added.
4. **Test stability fixes**: DATABASE_URL stubs in `tests/db.test.ts`, `tests/server-api.test.ts`,
   `tests/graph.test.ts`; fake `ws` module in `tests/dingtalk-stream.test.ts` (removes real
   network I/O whose 400 landed as an unhandled error); e2e login `waitUntil: 'commit', 30s`;
   two HTMX fragment assertions in `tests/e2e/admin-core.e2e.test.ts` converted to 15s polling;
   `tests/batch-import.test.ts` file-private userIds; `tests/interview-plan-members-phone.test.ts`
   safety net scoped to `template.name startsWith 'Phone-'`.

## Review focus (code-walkthrough dimensions)

- **Correctness**: facade/factory wiring, DI seam semantics, test classification soundness
- **Security**: no new injection / leak surface; CI and env handling
- **Maintainability**: import direction rules, naming, structure
- **Test coverage**: the changeset must not weaken existing coverage (80/80/70/80 gate)

---

## Full diff (0820555^ → 0820555, 88 files)
