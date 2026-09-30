# Phase 4 Layer 4 (browser) verification — sprint #149

> 2026-09-30 · HEAD `2662c3e` · orchestrator-executed Part A step 3 (optional chain)

## Tooling resolution (Layer 4 chain)

`gstack browse` → not installed in this workspace. `browser-use` MCP → available.
Live-host page verification was **not** completed with it; see "Live boot incident" below.
Browser verification therefore rests on the shipped Playwright/chromium e2e layer.

## 1. Browser evidence — real chromium driving the shipped admin UI under Prisma 7

Command: `./node_modules/.bin/vitest run tests/e2e/{admin-auth,admin-template-crud,template-lifecycle,report-viewing}.e2e.test.ts`
Log: `phase-outputs/phase4-e2e-subset.log`

| Measure | Result |
|---|---|
| Test files | 4 passed (4) |
| Browser tests | **28 passed (28)**, VITEST_EXIT=0 |
| Duration | 35.5 s |
| Browser | Playwright chromium (headless shell), real page navigation, clicks, downloads, PDF/Excel export |
| Data layer | PGlite via `createTestPglite()` — the new Prisma 7 + pglite-prisma-adapter path |

Coverage of the user-visible flows that Prisma 7 touches: admin login/session,
template CRUD, template lifecycle, report viewing + markdown/PDF/Excel download + reanalyze.

Full e2e set was run at M4 (`ac003-timing-and-memory-evidence.md` §2): 11/11 files, 78 tests,
peak 4441.8 MB, EXIT=0. The two subsequent commits added no e2e-relevant source change
(cdffb69/194c9c3 test-stability fixes, 2662c3e new invariant test file), and the
post-2662c3e full suite run is green (`phase4-full-suite-final.log`, 118/118 files, 1281 passed | 1 skipped).

## 2. Live boot against real PostgreSQL — NOT verified, and blocked by a pre-existing hazard

Two host boots of `src/server.ts` with the workspace `.env` were attempted:

1. Boot with `.env` (DingTalk credentials present, `PORT` from `.env` = 4001) succeeded:
   `Database connection OK`, `/health` → 200 in 676 ms. **Side effects of that boot, discovered after the fact:**
   - `runPostListenStartup` → `DingTalkStreamClient.connect()` opened the **production** stream
     (`wss://wss-open-connection.dingtalk.com`) for ~30 s before the process tree was killed.
   - Log shows **0** `Received DingTalk message` and **0** `Resending unsent message on startup`
     entries → no inbound message was consumed and no outbound message was sent.
2. Boot with `DINGTALK_*` stripped (intended credential-free local check) failed:
   `buildApp` unconditionally calls `DingTalkStreamClient.fromEnv()` (`src/server.ts:177`), which throws
   `clientId is required` (`src/integrations/dingtalk/stream-client.ts:65`).

Consequence: **there is no credential-free way to boot the app on a host.** Combined with
`src/server.ts:316-339` (startup re-sends the last assistant message for every `ACTIVE`/`PROCESSING`
interview), a "just start it locally to look at the UI" workflow can send messages to real users.
Both are pre-existing, not introduced by #149: `git log -S` on master attributes the resend block to
`aefc7db` and the unconditional `fromEnv()` in `buildApp` to `7933466`, and `git log -S ... sprint/2026-09-29-01 --not master -- src/server.ts`
returns nothing. Recorded as an emergent issue for a follow-up sprint, not fixed here (out of #149 scope).

No further boot attempts were made. `node dist/src/server.js` on port 3901 (PID 3656) is a
pre-existing process not started by this sprint; it was left untouched.

## Verdict

Layer 4 is satisfied by real-browser evidence at the current HEAD (28 Playwright chromium tests green,
full 78-test e2e set green at M4) for the flows #149 changes. Manual exploration of a live
`.env`-backed instance is **skipped deliberately** — the only available boot path attaches to the
production DingTalk bot. Disclosed in `feedback-log.md` and carried to CLOSE as an emergent issue.
