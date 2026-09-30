# Code Walkthrough — final pre-push changeset (Prisma 6→7 + PGlite, issue #149)

## Scope

- Repo: dialog-survey · Branch: `sprint/2026-09-29-01` · HEAD under review: `680ddaa`
- Range: `9dda5c3` → `680ddaa` (4 commits, 9 files, +375/−20) — the delta accumulated during Phase 4 VERIFY
  plus the release bump. This is the exact tree that will be pushed and opened as a PR.
- Previously walked, **not re-opened here**:
  - Stage A (`0820555^` → `eb707f9`) — R3 **APPROVED 0.9233**
  - Stage B + M4 + M5 (`eb707f9` → `9dda5c3`) — R3 **APPROVED 0.9333**
- New in this range:

| Commit | Content |
|---|---|
| `cdffb69` | PGlite template hardening: cross-process stale-template cleanup, atomic write, read-vs-rebuild race fallback, post-failure template disable latch; test-timeout alignment |
| `194c9c3` | Fallback observability (`activeTemplatePath` tracking, disable latch) + AGENTS.md CI wording |
| `2662c3e` | New `tests/prisma7-spec-invariants.test.ts` — 15 assertions covering REQ-PRISMA7-001..006 for the #367 alignment gate |
| `680ddaa` | Release: VERSION 1.8.9 → 1.8.10, CHANGELOG Unreleased→1.8.10, `scripts/sync-version.sh` fan-out (package.json, AGENTS.md header) |

## Verification evidence produced since `9dda5c3`

| Gate | Result |
|---|---|
| Full suite, no PostgreSQL | 118/118 files, 1281 passed / 1 skipped, EXIT=0, 314 s |
| `xp-gate check --all` | 9/10; sole failure = Gate 6 architecture 2.8/10 — **reproduced on master** (same 2.8/10, EXIT=1, 208 vs 219 smells) → pre-existing debt |
| #367 test-specification-alignment | **PASS 100** on the SPEC-PRISMA7-001 traceability domain (6 REQ / 12 AC / 11 `@intent`); repo-wide baseline (score 0, 281 `MISSING_INTENT`) preserved as a disclosure field, not hidden |
| Cold / warm SLA | cold first setup 3654 ms (≤5 s); isolated warm p95 230/232 ms (≤2 s); full e2e peak 4441.8 MB, no OOM |
| Browser (Layer 4) | Playwright chromium: 4 e2e files / 28 tests passed at this HEAD; full e2e set 11/11 files, 78 tests at M4 |
| pre-commit chain | 9/12 PASS at `680ddaa` (Gate 6 ratchet PASS, Gates 3/4 SKIP for staged scope) |

## Specific judgement calls made in this range — please challenge them

1. **AC-PRISMA7-003-02 lost its wall-clock assertion.** The first version asserted `warm p95 ≤ 2 s`
   inside the test. In isolation that measured ~230 ms; inside the full parallel suite (`fileParallelism: true`,
   4 workers) the same loop measured 2356 ms / 2712 ms and failed. The assertion was replaced by a
   deterministic one (`getTemplateDataDir()` returns the identical memoized Blob reference, and a database
   booted from the template has the schema applied with zero rows), and the numeric budgets now live only in
   `ac003-timing-and-memory-evidence.md` §1/§1b. **Is that a legitimate strengthening of the test, or a
   coverage loss that should be re-bought in CI (a serial single-worker bench job)?** The `@intent` block was
   rewritten to state the budget is isolated-measurement evidence.
2. **The new invariant test asserts on configuration/text, not runtime behavior** (dependency pins, CI step
   ordering by line index, `files`/`ignore` arrays, Dockerfile HEALTHCHECK form, spike registry entries).
   Several AC clauses (CI green on a real runner, container boot) cannot be asserted from a working tree.
   **Judge whether any of these assertions is vacuous or will rot** (e.g. `generateAt < consumerAt` per job,
   `(cli.match(/prisma\.config\.ts/g) ?? []).length >= 2`).
3. **Governance ACs were re-anchored from gitignored artifacts to committed invariants.** The original
   AC-002-02/AC-006-02 checklists live in `.sprint-state/` (gitignored) — asserting their existence would be
   green locally and red in CI. **Is the substituted invariant (zero `new PrismaClient(` in tests, `import type`
   only for `src/generated/prisma`, helper imports routed through the facade) a faithful translation?**
4. **Layer 4 live boot was abandoned.** A host boot with the workspace `.env` overrode the attempt to blank
   `DINGTALK_*` and connected to the **production** DingTalk stream for ~30 s before the process tree was killed
   (log shows 0 inbound messages, 0 outbound resends — no user-visible effect). A credential-free boot then failed
   because `src/server.ts:177` constructs `DingTalkStreamClient.fromEnv()` unconditionally, and `src/server.ts:316-339`
   resends assistant messages to real users on every post-listen startup. Both lines pre-date this branch
   (`git log -S` → `aefc7db`, `7933466` on master). Browser evidence therefore rests on the Playwright suite.
   **Is shipping on that basis acceptable for a Prisma-7 migration that touches the production data path, or should
   the PR block until a credential-free boot path exists?**
5. **Version bump is PATCH (1.8.9 → 1.8.10)** although Prisma 7 raised the Node floor to `>=20.19.0` and changed
   client generation/output paths. **Judge the bump level and whether the CHANGELOG entry omits anything breaking.**

## Recorded non-blocking items (already tracked — do not re-report as new)

- `.github/workflows/pr.yml` job names vs GitHub branch protection required checks → coordinated shared-infra
  rename at SHIP, not a code change in this branch.
- Cold template build may run once per worker on first parallel invocation (single-writer lock deferred).
- `npx prisma@7.10.0 db push` pin in `scripts/cli.mjs` → replaced by `prisma migrate` in issue #152.
- Docker healthcheck timeouts predate this sprint (#57); M4 only swapped curl → `node -e`.
- 281 legacy `@intent` gaps and Gate 6 architecture 2.8/10 → issue #157 (user-approved).
- `.env` boot hazard / startup resend → issue #156 (user-approved).
- AC-003-02 budget regression defence → bench job scoped into issue #150 (user-approved).

## Full diff (`9dda5c3..680ddaa`)

