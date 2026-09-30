# Code Walkthrough — final pre-push changeset (Prisma 6→7 + PGlite, issue #149)

## Scope

- Repo: dialog-survey · Branch: `sprint/2026-09-29-01` · HEAD under review: `d9a63cc`
- Range: `9dda5c3` → `d9a63cc` (8 commits, 10 files, +558/−21) — the Phase 4 VERIFY delta,
  the release bump, and the fix pass responding to the first two rounds of THIS walkthrough.
  This is the exact tree that will be pushed and opened as a PR.
- Previously walked, **not re-opened here**:
  - Stage A (`0820555^` → `eb707f9`) — R3 **APPROVED 0.9233**
  - Stage B + M4 + M5 (`eb707f9` → `9dda5c3`) — R3 **APPROVED 0.9333**

## Fix report — every Major concern from rounds 1–2 addressed in code, not argued

| # | Concern (round 1–2) | Disposition | Commit |
|---|---|---|---|
| T1 | Numeric budgets (cold ≤5s, warm p95 ≤2s) live only in gitignored `.sprint-state/`, so nothing in the committed tree documents the SLA evidence | Budget evidence committed into the tracked tree as `docs/ac003-timing-and-memory-evidence.md` (with a header declaring it the canonical committed copy); test `@intent`, report `disclosures[]` and learnings all repoint at it. The **regression guard** (serial bench job in CI) is scheduled as issue #150 per user decision DR-016 — it cannot be built without a runner, so it is disclosed, not faked | `d9a63cc`, `1df2ce5` |
| T2 | `jobBlock()` could truncate job bodies on 2-space keys and `indexOf` ordering could match `name:`/comments | Parser replaced by `jobRunSteps()`: steps split at 6-space `- ` boundaries, ordering reads **only `run:` line text**; consumer must be found inside a `run:` step | `dd27188` |
| T3 | `prisma@\d+\.\d+\.\d+ db push` / `prisma.config.ts` occurrence count were unanchored presence assertions | Assertions now scoped to the actual `filesToCopy`/`requiredFiles` array literals in `scripts/cli.mjs`, pinned to `npx --yes prisma@7.10.0 db push`, plus `PRISMA_SKIP_GENERATE` | `dd27188` |
| T4 | Spike-criteria loop vacuously passed on comment mentions (`#1 ` etc.) | Replaced by executable-wiring set: criterion ids extracted from the `CRITERIA` array entries (incl. multi-line and `'3b'`-style) plus `record(<id>,` args; each of #0–#12 must be **wired to a runner** | `dd27188` |
| T5 | `templateDisabled` latch had no counter/metric and no test proving it engages | Added failure counter + exported `getTemplateHealth()`; degrade line now carries the count; new contract test asserts the latch engages and that a healthy process reports `{disabled:false, failures:0}` (also asserted in the warm-path test as "no silent fallback") | `dd27188` |
| T6 | **Real bug**: `discardTemplate()` deleted the file but `templatePromise` kept serving the dead Blob to every non-latched caller | Failure path now clears the memo (`templatePromise = undefined`, `activeTemplatePath = undefined`) so the next caller rebuilds; proven by a corrupt-template contract test using a new `PGLITE_TEST_CACHE_DIR` seam (isolated cache — no pollution of the shared one): corrupt blob → replay boot still carries schema → memo invalidated → rebuild → next process back on the fast path | `dd27188` |
| F1 | Release bump PATCH 1.8.10 while engines floor rose to ≥20.19.0 (breaking for the npm-distributed package) — **and** 1.8.10 < already-tagged `v1.9.0`, i.e. an npm downgrade | Re-versioned to **1.10.0** (next non-colliding MINOR; `v1.9.0` tag + CHANGELOG entry exist) via canonical VERSION + sync-version.sh fan-out; CHANGELOG section retitled; decision recorded DR-017 | `f17e963` |
| F2 | `disclosures[]` and learnings Pattern 2 claimed warm p95 "is asserted by tests" — false | Both rewritten: mechanism clauses (memoized Blob identity, schema-carrying zero-row boot, PG-free setup, failure-path invalidation) are asserted; **no test asserts wall-clock numbers**, budgets are isolated-measurement evidence | `f17e963`, `d9a63cc` |

Also in range (pre-first-round): `cdffb69` template hardening + stale-template cleanup,
`194c9c3` fallback observability, `2662c3e` the invariant test itself, `680ddaa` original release bump.

## Verification evidence produced since `9dda5c3`

| Gate | Result |
|---|---|
| Full suite, no PostgreSQL (after fix pass) | **118/118 files, 1282 passed / 1 skipped, EXIT=0, 121 s** |
| Invariant test file (now 16 tests incl. corrupt-template contract) | 16/16, EXIT=0 |
| pre-commit chain on all 4 new commits | 10/12 or better, zero failures (Gate 10 semgrep runtime error = SKIP; Gate 3/4 SKIP when only docs staged) |
| `xp-gate check --all` | 9/10; sole failure = Gate 6 architecture 2.8/10 — **reproduced on master** (same 2.8/10, EXIT=1, 208 vs 219 smells) → pre-existing debt, tracked as #157 |
| #367 test-specification-alignment | **PASS 100** rebound to HEAD `d9a63cc` — SPEC-PRISMA7-001 domain now 6 REQ / 12 AC / **12 `@intent`** (was 11); repo-wide baseline (score 0, 281 `MISSING_INTENT`) kept as a disclosed field |
| Cold / warm SLA | cold first setup 3654 ms (≤5 s); isolated warm p95 230/232 ms (≤2 s); e2e peak 4441.8 MB, no OOM — now committed at `docs/ac003-timing-and-memory-evidence.md` |
| Browser (Layer 4) | **Playwright-only.** 4 e2e files / 28 tests passed at this range; full e2e set 11/11 files, 78 tests at M4. A host `.env` boot is NOT a safe verification path here: it connected to the production DingTalk stream for ~30 s before being killed (log audit: 0 inbound, 0 outbound resends — no user-visible effect; incident disclosed verbatim in `phase4-browser-verification.md`). Root cause lines (`src/server.ts:177` unconditional stream ctor, `src/server.ts:316-339` startup resend) pre-date this branch (`aefc7db`, `7933466`) and are scheduled as #156 |

## Judgement calls remaining — please challenge

1. **AC-PRISMA7-003-02 keeps no wall-clock assertion.** Budget numbers are now committed (T1) and the
   fast-path *mechanism* is asserted including its failure semantics (T5/T6), but a timing regression is
   only catchable by the #150 bench job. Is shipping with that disclosed gap acceptable?
2. **The invariant test still asserts configuration/text for CI-side ACs.** CI green on a real runner and
   container boot cannot be asserted from a working tree; they are covered by the first PR CI run and the
   docker-build log baseline respectively (`disclosures[]` items 2–3).
3. **Version 1.10.0 chosen as MINOR over PATCH-on-1.9 (1.9.1)** because Prisma 7 changes client
   generation/output for npm consumers. Judge the bump level.
4. **Layer 4 = Playwright-only** for this PR; live boot deliberately abandoned until #156 lands.

## Recorded non-blocking items (already tracked — do not re-report as new)

- `.github/workflows/pr.yml` job names vs GitHub branch protection required checks → coordinated
  shared-infra rename at SHIP with user confirmation, not a code change in this branch.
- Cold template build may run once per worker on first parallel invocation (single-writer lock deferred).
- `npx prisma@7.10.0 db push` pin in `scripts/cli.mjs` → replaced by `prisma migrate` in issue #152.
- Docker healthcheck timeouts predate this sprint (#57); M4 only swapped curl → `node -e`.
- 281 legacy `@intent` gaps and Gate 6 architecture 2.8/10 → issue #157 (user-approved).
- `.env` boot hazard / startup resend → issue #156 (user-approved, highest priority).
- AC-003-02 budget regression defence → bench job scoped into issue #150 (user-approved).

## Full diff (`9dda5c3..d9a63cc`)
