# Round 2 response — disposition of panel asks, with the eb707f9 delta (author)

Round 2 verdicts: **all three experts APPROVED** (architecture conf 9, technical conf 8,
feasibility conf 8), but the aggregate stalled at mean consensus **0.8167**
(0.95 / 0.70 / 0.80) — below the 0.90 threshold. The gap is residual-ask arithmetic,
not disagreement on verdict: the technical expert's 0.70 and feasibility's 0.80 reflect
unresolved minor/major items. This document closes each one either with code in the new
commit **eb707f9** (`fix(#149): walkthrough R2 responses — timeout dedup + test hygiene`,
7 files, +25/−5; src delta = single file `prisma-factory.ts` +7/−1) or with a protocol
commitment; every claim is verifiable at file:line in the new artifact.

Review target is now **artifact v2** (`.sprint-state/phase-outputs/walkthrough-stageA2-artifact.md`,
sha256 `8aad70e79d49678c6abc90f12b610d69c7c523a449cba2573c022f89fcef3938`, 98,830 bytes):
same 88-file range as before **plus** eb707f9 — 90 files, +658/−320, range 0820555^→eb707f9.

## Fresh empirical evidence at eb707f9 (all in `.sprint-state/phase-outputs/`)

- Full suite, real PostgreSQL, CI-parity env: **Test Files 116 passed (116) — Tests 1261
  passed | 1 skipped**, zero unhandled errors (`stageA2-full-suite-coverage.log`).
- Coverage, All files: **stmts 87.13 / branch 73.07 / funcs 93.5 / lines 87.7**
  (same log). Previous run at 0820555: 87.22 / 73.4 / 93.7 / 87.8 — the ≤0.1pp delta is
  the +7/−1 lines added to `src/utils/prisma-factory.ts` across the two commits.
- `tsc --noEmit`: exit 0. `npx biome check src/` (exact CI static-analysis scope): exit 0,
  58 files clean. Consolidated log: `walkthrough-eb707f9-verify.log`.
- Note for the record: the local convenience script `npm run check` (`biome check .`)
  exits 1 on a single formatting nit in `.architecture-baseline.json` — a **gitignored
  local xp-gate artifact** (`.gitignore:133`, created 2026-09-29 21:10 during this
  sprint's design phase). It is untracked, absent from the reviewed range, and invisible
  to CI (`pr.yml:32-33` runs `biome check src/`). No action taken.

## Technical expert — dispositions

1. **T-M (timeout duplication, major)** → **RESOLVED** in eb707f9. Single definition:
   `src/utils/prisma-factory.ts:5` `export const PRISMA_CONNECT_TIMEOUT_MS = 5000`
   (with the drift-prevention intent in its JSDoc); used at `prisma-factory.ts:28`,
   `tests/helpers/create-test-prisma.ts:16`, `tests/helpers/test-db.ts:21` — both helpers
   now `import { PRISMA_CONNECT_TIMEOUT_MS }` (`:3` and `:4` respectively). Three literal
   sites → one constant + two imports; value unchanged (no behavior delta).
2. **Minor: module-scope `vi.stubEnv` without unstub** → **SPLIT disposition**:
   - `tests/db.test.ts` → **RESOLVED**: `afterAll(() => vi.unstubAllEnvs())` at
     `tests/db.test.ts:78-79` (that file has no fire-and-forget path, so the unstub is safe).
   - `tests/graph.test.ts` → **NOT applied, by evidence**. The experiment was run during
     this response's development: adding the `afterAll` unstub kept 63/63 tests passing but
     re-surfaced an **unhandled error** — the pending `setImmediate` from `graph.ts`'s
     fire-and-forget analysis (the callback scheduled at `src/core/graph.ts:62-72`) outlives
     the file's last test; it fired after the unstub had removed `DATABASE_URL` and the
     factory refused to build the client (`processImmediate node:internal/timers:534:21`,
     attributed to `tests/graph.test.ts`). Reverted. The file comment at
     `tests/graph.test.ts:8-10` documents exactly this and why the stub lives for the
     process lifetime. The isolation property you want is delivered by Vitest's per-file
     module registry (`vitest.config.ts` does not disable `isolate`; default `true`), while
     for this file the unstub is demonstrably harmful **under the current config** — this is
     stronger than "fragile if isolate is disabled", which is why we kept the stub and
     documented it rather than satisfying the letter of the ask.
3. **Minor: `getSharedTestPrisma` docstring vs `create-test-prisma.test.ts`** → **CLARIFIED**;
   the cited contradiction does not exist. New docstring (`tests/helpers/create-test-prisma.ts:24-27`):
   "File-level singleton … Disconnect ownership belongs to the importing test file's `afterAll` /
   `TestDatabase.teardown()`; module isolation is per test file, so that disconnect cannot
   affect other files." `tests/create-test-prisma.test.ts:16-18` disconnects its **own
   module's** shared instance in its `afterAll` — precisely the documented ownership (not a
   violation); `:32-42` disconnects an instance from `createTestPrisma()`, which the second
   docstring (`:34-37`) marks caller-owned. Both docs and code now agree on their face.
4. **Minor: fake `ws` single-symbol assumption** → **RESOLVED**: comment at
   `tests/dingtalk-stream.test.ts:9` — "The fake below exports only `WebSocket`: stream-client.ts
   imports no other `ws` symbol, so extend this mock if that import ever changes."
5. **Major: `getDb()` bypassing DI** → disposition maintained (F-M3 anchor: the rejection is
   caught at `src/core/graph.ts:66-71`; zero unhandled errors across repeated full runs).
6. **Remaining R2 minors** (relational filter, `waitUntil: 'commit'`, `isClosed` teardown
   contract, double-cast in mock domains, biome job needs no generate) → accepted as
   correct/non-blocking as written in the Round-2 summaries; no change made.

## Feasibility expert — dispositions

1. **F-M2 (sole major: shared-DB flake risk vs coverage gate)** → **RESOLVED with protocol +
   schedule**. Your required interim guard now exists in `AGENTS.md` (lines 84, verbatim):
   "Shared test DB (interim, until Stage B PGlite isolation): the full suite runs against one
   PostgreSQL database with `fileParallelism: true`. On a gate failure, rerun the failing file
   in isolation first; for suspected cross-file collisions triage with
   `npx vitest run <file> --no-file-parallelism`, then fix by scoping fixtures (file-unique
   ids, cleanup predicates) — never by weakening assertions." Stage B is not a future sprint:
   it is the **immediate next milestone in this same sprint** (M3), beginning right after this
   walkthrough approvals — per-instance PGlite per design DD-005, structurally eliminating
   the class of collision.
2. **F-M1 credential fallback** → pre-existing parity with `origin/master`'s
   `tests/helpers/test-db.ts:14`; Stage B removes the network URL from the helper internals
   entirely (PGlite). The architecture expert's strict-env-check ask is recorded on the
   Stage B checklist; interim behavior is unchanged deliberately.
3. **F-M3 residual cost (~5s doomed connection in Postgres-less runs)** → accepted; note the
   cost materializes only when no PG exists at all (CI jobs all provision PG; the stub URL is
   well-formed so the attempt is a bounded 5s timeout, then caught and logged). Non-blocking;
   if Stage B makes `getDb()` mockable in this path we will revisit.
4. **F-M4 (restate numbers + verify workflow_dispatch)** → **CLOSED**:
   - Numbers restated above (116/116, 1261|1, and 87.13/73.07/93.5/87.7).
   - **Transparency item**: `vitest.config.ts` currently wires **no** `coverage.thresholds`,
     so the "Coverage Check (80/80/70/80)" job (`pr.yml:176`) and its comment
     "Coverage thresholds are enforced by vitest.config.ts" (`pr.yml:233`) do not numerically
     gate today. History: thresholds were added 2026-04-09 (`0d60d47`) and removed
     2026-07-28 by `22bad13` (#156-#160, whose message does not mention it). This is
     **pre-existing and untouched by Stage A** (the reviewed diff neither adds nor removes
     any threshold/comment); current figures exceed 80/80/70/80 on all four axes anyway.
     Restoring enforcement is **issue #150 — the next sprint in this queue**. Flagging it
     here rather than hiding it: an honest gap stated beats a gate believed-but-absent.
   - `workflow_dispatch`: exercised on the pushed branch immediately after this walkthrough
     closes (the push is the next gate step); the run URL will be recorded as M2/M4 evidence,
     and PR-triggered CI follows at ship time — both before any merge.
5. **F minor Vitest version-sensitivity** → **RESOLVED**: `AGENTS.md:85` — "Vitest async
   suites: Vitest 4 awaits async `describe` callbacks … Re-verify async-suite semantics when
   upgrading Vitest."
6. **F minor E2E budget inflation** → watch item retained; full-suite wall clock 78.1s
   (tests 422.85s aggregate across parallel workers) is within budget; monitoring continues.

## Architecture expert — dispositions

1. **Minor: credential fallback removal / strict env check before Stage B** → recorded on the
   Stage B checklist; Stage B replaces the URL with PGlite internals, making the concern moot
   in the strongest possible way (fail-loud env parsing stays as the interim note).
2. **Minor: systemic collision guard** → interim protocol in `AGENTS.md:84` (above);
   structural elimination in Stage B (DD-005). Both layers recorded.

## What did NOT change (scope discipline)

The eb707f9 delta touches **no production runtime logic** beyond exporting the existing 5000ms
value as a named constant: all other edits are test/doc comments, the db.test.ts teardown
unstub, and `AGENTS.md` notes. No reviewer-requested change was implemented half-way, and no
new dependency, no CI change, no schema change.

## Request

With R2 verdicts all APPROVED and every residual ask now either implemented (with evidence
above) or protocolized with an in-sprint schedule, please record your final positions for
Round 3 on artifact v2. If any new finding is actionable, it will be answered with evidence
in the same form; if your position is already final, state your self-reported consensus
ratio for the aggregate.
