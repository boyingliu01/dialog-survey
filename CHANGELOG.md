# Changelog

## Unreleased

### Documentation

**Competition materials recovered from the DT mirror.** The 研发云 (DT) Gitea repository had drifted into a separate history — its last common ancestor with this branch is from 2026-03-12, because earlier syncs went over as "snapshot sync from mainline" commits that rewrote history instead of pushing. Its head was a v1.11.4-era snapshot eight versions behind, so bringing it up to date meant replacing that branch wholesale. Before doing so, the tree was checked for content that exists in no other copy, and eight files did:

- `docs/code-race-8th/` — the competition submission (statement, core-code list, demo handbook, video script, README).
- `LICENSE` — MIT, which this repository had never contained.
- `MAX_FOLLOWUPS_FIX.md` and `scripts/fix-max-followups.ts` — the one-off note and script behind the v1.8.0 `maxFollowups` default change.

They are restored here so the upcoming mirror replacement destroys nothing. `reports/` was deliberately left behind: it is gitignored build output (two interview exports and a mutation report), not source.

### Fixed

**The admin UI no longer depends on a public CDN for htmx.** Both layouts loaded it as `<script src="https://unpkg.com/htmx.org@2.0.4/...">` with `onerror="this.src='/js/htmx.min.js'"` as a fallback. That fallback is unreliable by construction: `onerror` only fires when a request fails outright, not when it is merely slow, so a half-loaded script leaves `htmx` undefined while the page still renders. Two Playwright tests in `tests/e2e/admin-ui-coverage.e2e.test.ts` failed exactly this way with `htmx is not loaded on the admin shell` — measured on the previous commit, so they predate this change. `public/js/htmx.min.js` (82 KB) was already vendored but sat unused on the happy path; both layouts now load it directly and never reach the network. Alpine.js was pinned to jsdelivr the same way and is now local too. Verified by running the full suite on the previous commit (2 failed / 1963 passed) and on this one (1965 passed).

Tailwind still comes from `cdn.tailwindcss.com`. It is a runtime compiler that generates the utility classes these templates use, so it cannot be swapped for a static file without introducing a build step; it remains the only network dependency in the admin shell.

### Tooling

**The Docker image drops its build-time tooling and finally boots (issue #210).** Two things were wrong, and only one of them was the issue as filed.

The filed problem was size. `Dockerfile:7` installed everything and copied the whole tree into the runner stage, so the image carried the Prisma CLI, Prisma Studio, `effect`, an embedded PGlite and `typescript` — none of which a server loads. `npm prune --omit=dev` cannot fix it: `prisma` and `typescript` are devDependencies *and* optional peerDependencies of `@prisma/client`, so npm records them as `devOptional` and keeps them under `--omit=dev`. The existing `scripts/prune-runtime-deps.mjs` derives the real graph from what `dist/` imports instead, and running it between build and runner achieves **`node_modules` 731 MB → 163 MB, image 1.22 GB → 574 MB** (`[prune] removed 623 package(s), 481.9 MB` / `[prune] verified: 148 kept package(s), all dependencies resolve`).

The bigger problem was that **the image had never started at all.** Building it and running it — with the Dockerfile unmodified — died at boot:

```
Error: Cannot find addon '.' imported from 'sodium-native/binding.js'
Candidates:
- .../node_modules/sodium-native/prebuilds/linux-x64-musl/sodium-native@5.1.0.node
```

`node:20-alpine` is musl, and `sodium-native` (pulled in by `@fastify/secure-session`) ships prebuilds for `linux-x64` but not `linux-x64-musl`. Both images were verified to lack that directory, so pruning did not cause this — it was latent. The base is now `node:20-slim` (Debian/glibc), with `addgroup`/`adduser` replaced by `groupadd`/`useradd`.

Pruning also removed the Prisma CLI that `CMD` used for migrations, so `scripts/migrate-deploy.mjs` replaces it: it applies `prisma/migrations/*.sql` through `pg` and records them in `_prisma_migrations` using Prisma's own schema and SHA-256 checksums. Interchangeability was verified in both directions against the real CLI — a database migrated by the script reports `No pending migrations to apply` under `prisma migrate deploy`, and a CLI-migrated database is recognised by the script — so `deploy.sh` and the container can both manage the same database.

Two smaller defects surfaced while running it for real:

- **`pino-pretty` is a devDependency, so a container started without `NODE_ENV=production` crashed** with `unable to determine transport target for "pino-pretty"`. `createLoggerConfig` now falls back to plain JSON when the package cannot be resolved; pretty logs are a convenience, never a startup requirement.
- **`SESSION_SALT` must be 32 hex characters**, because `src/server.ts` does `Buffer.from(salt, 'hex')` and secure-session needs 16 bytes after decoding. 16 arbitrary characters fails with `salt must be length 16`, which reads as if the count were wrong when it is the encoding.

Verified end to end on WSL2 + Docker 29.9.2 against real PostgreSQL: migrations applied, restart idempotent (`up to date (2 migration(s))`), container `healthy`, `/health` returning `db: ok`.

**A WSL development worktree was set up, measured, and then removed — Windows is the only development environment.** WSL is not part of this project's development flow: `scripts/deploy.sh`, the `Dockerfile`, `docker-compose.yml` and every CI workflow are WSL-agnostic, and the gates run entirely on Windows. Production targets plain Linux (`DEPLOY.md` — any box with Node 20.19+ and PostgreSQL 14+), which is a deployment concern, not a development one.

It was worth trying, because the reason WSL *cannot* share the Windows checkout is a real constraint worth recording: `/mnt/d` is one directory seen by two operating systems, so it carries a single `node_modules` holding only the native binaries of whichever platform last ran `npm install`. Windows writes `@biomejs/cli-win32-x64`; WSL needs `cli-linux-x64`, which is not on disk, and Gate 1 stops with `Cannot find module '@biomejs/cli-linux-x64/biome'` — presented as a lint failure, which is how it got blamed on the tools for several rounds.

The worktree worked once it existed (`~/dialog-survey-wsl` on ext4, its own `npm ci`: 167/167 test files, 1967 tests, `tsc` clean, `biome check` clean on 284 files, 8/12 gates including Gate 8 and Gate 10). It was removed anyway: 663 MB of duplicated dependencies plus manual syncing, for an environment used rarely. Anyone who does need it can recreate it in about two minutes with the commands in `AGENTS.md`; the traps are documented there too (`~/.local/bin` is invisible to non-interactive shells, and the shared `core.hooksPath` is a Windows path that makes WSL commits skip every gate silently).

**Gate 5 has a second, worse defect than #594, now filed as [xp-gate#611](https://github.com/boyingliu01/xp-gate/issues/611).** Gate 5 branches on `$?` from `vitest run --coverage`, but vitest exits **1** both for a failing test and for any unmet coverage threshold. Measured with 15 passing tests:

```
 Test Files  1 passed (1)
      Tests  15 passed (15)
ERROR: Coverage for lines (0%) does not meet global threshold (80%)
$ echo $?   # → 1
```

The gate then prints `❌ BLOCKED - Tests FAILED in related test files`. Nothing failed. Combined with `coverage.include: ['src/**/*.ts']` (added for #594), which puts all ~76 source files in the denominator of every subset run, Gate 5 becomes **unsatisfiable** for a single-file `src/` edit: test files changed, `src` file changed, anything short of a full-suite run lands at 1-2% coverage and is reported as a test failure. This is why a docs-only commit scores 10.0/10 while one small `src` change blocks with a message pointing at the wrong thing. Workaround: run the full suite when touching `src/`.

**The gates no longer cross between Windows and WSL — that hop was the whole problem.** On the Windows PATH, `bash` resolves to `C:\WINDOWS\system32\bash.exe`, which is the *WSL launcher*, not Git Bash. Because `core.hooksPath` points at a `#!/bin/bash` hook, every `git commit` from Windows quietly ran the gate suite inside WSL. `scripts/run-xp-gate.sh` had grown a shim layer to survive that jump — POSIX shims for `.exe` tools, a mount-translating `node` shim so `/mnt/d/...` would not become `D:\mnt\d\...`, a Windows `HOME` for Gate 9's module resolution, `PYTHONUSERBASE` for the Python tools. All of it was compensating for a boundary nothing had asked to cross. It also produced the misleading "tool not installed" reports: the tools were installed, just in a user bin directory that only interactive login shells put on PATH, and Python looked for them under the wrong `HOME`.

Every tool the gates need is already installed natively on Windows, several of them newer than the WSL copies: `lizard` 1.24.2, `semgrep` 1.171.0, gitleaks 8.30.1, node 24. `scripts/run-xp-gate-native.sh` runs the hooks through Git Bash instead of WSL — one filesystem, one PATH, one Python, no path translation. It prints the resolved path of each tool before running, so a wrong interpreter is visible immediately rather than surfacing as a mysterious SKIP. `scripts/run-xp-gate-native.ps1` is the same entry point for a PowerShell prompt, locating Git Bash from `git.exe` rather than a hard-coded path.

**That wrapper is now deleted, along with the 15 shims it generated.** Once PATH was ordered correctly, the hooks run in Git Bash directly, where `$HOME` already is the Windows profile and nothing needs translating. Keeping the wrapper would have meant maintaining two environments, one of which no longer gets exercised, and the next reader would have had to work out which paths were real. `scripts/run-xp-gate-native.sh` is the only entry point now and assumes nothing about WSL: no `/mnt/`, no `cmd.exe` discovery, no `~/.cache/xp-gate-shims`. It keeps the one part of the old wrapper worth keeping — printing every tool's resolved path, which turns "a gate inexplicably skipped" into a one-glance answer.

Measured: a full pre-commit run from Git Bash scores **10.0/10 with 9 of 12 gates actually executing** and contains **zero `/mnt/` paths**. Gate 8 reaches a real PASS (both scanners), Gate 10 PASS, Gate 6 PASS.

The last step was PATH ordering, and it had to be done at the right level. Windows concatenates the **machine** PATH row *before* the user row, so adding `C:\Program Files\Git\bin` to the user PATH changed nothing while `C:\WINDOWS\system32` sat at machine index 5 — `where bash` still found the WSL launcher first. `C:\Program Files\Git\bin` is now prepended to the **machine** PATH, which needs admin rights and is what makes a plain `git commit` run the hooks in Git Bash with no wrapper involved. Verified by reading the registry value directly rather than `$env:PATH`: a running shell keeps the environment it started with and passes that stale copy to every child, so `where bash` keeps reporting `System32` until the shell is restarted, which makes the change look like it failed when it did not.

This stays dependent on WSL being installed and on `system32\bash.exe` existing — nothing was deleted to achieve it, because `wsl` itself lives there and must keep working.

Two gate defects found while making this work:

- **xp-gate #595 — Gate 1's PowerShell branch scans `node_modules`.** Without a `.xp-gate-powershell-analysis-paths` scope file the adapter runs `Invoke-ScriptAnalyzer -Path . -Recurse`, which walks third-party code. Playwright ships three `.ps1` helpers in `node_modules/playwright-core/bin/` that use `Write-Host` and a WMI cmdlet, so Gate 1 blocked **every commit** on findings in code that cannot be edited and is replaced by `npm ci`. The adapter's own `_find_ps_files` helper already prunes `node_modules`; only the legacy branch skips that pruning. Added the scope file declaring `scripts/`, so the gate judges our code only.
- **Gate 6 demanded PowerShell layering that did not exist.** Rather than silence the warning, `architecture.yaml` now declares the actual structure — one `scripts` layer, no dependencies, since the two PowerShell files are standalone and never dot-source each other — and `tools/Test-PowerShellArchitecture.ps1` enforces it. The checker was verified to *fail* on a genuine cross-layer dot-source (`violations=1 failing=1`), so it is a control, not decoration.

**The three "not installed" gate tools were installed all along.** Gate 3 (`lizard`), Gate 8 (`detect-secrets-hook`) and Gate 10 (`semgrep`) were each reported as missing, with an install hint, on every run. All three were present and executable in the WSL user's `~/.local/bin` (lizard 1.21.3, semgrep 1.164.0, detect-secrets 1.5.47). Two separate mechanisms hid them:

1. `~/.profile:25` and `~/.bashrc:188` both add `~/.local/bin` to PATH, but only *interactive login* shells read those files. The gates run from a non-interactive shell, so `command -v` found nothing — and the gate correctly reported what it observed.
2. Fixing PATH alone was not enough: Python resolves user site-packages from `$HOME`, and the old WSL wrapper repointed `HOME` at the Windows profile so Gate 9 could find its own node modules. A console script on PATH then died with `ModuleNotFoundError: No module named 'semgrep'`. That second mechanism disappears with the wrapper itself — under Git Bash `$HOME` is already the Windows profile, so there is no discrepancy to patch.

The wrapper now captures `$wsl_home` before overwriting `HOME` and exports `PATH` and `PYTHONUSERBASE` from it. Gate 10 went from SKIP to PASS, Gate 3 from "lizard not installed" to running, and Gate 8's second scanner from silently disabled to actually blocking.

Two further issues surfaced only because the tools started running:

- **Gate 8 had been doing half a scan.** `adapters/gate-8.sh` gates detect-secrets on `command -v detect-secrets-hook && [ -f .secrets.baseline ]`, so with the tool present but no baseline it still printed "unavailable". Added `.secrets.baseline` (82 recorded findings) and allowlisted it in `.gitleaks.toml` — the baseline contains every pattern it found as literal text, which made gitleaks report 158 hits inside it.
- **Gate 10's 180s budget was too tight for this repo.** A full `--config=auto` pass over `src/` measures 169s (rule fetch alone ~10s), so runs landed on the limit and reported "timed out — no verdict", which is neither a pass nor a finding. `XP_GATE_SEMGREP_TIMEOUT` is now 400s in the wrapper.

**Gate 5's local coverage judgement was inert — xp-gate #594, worked around.** The gate runs `vitest run --coverage <changed test files>`. When none of those tests imports a src module, istanbul writes `total.lines.pct = "Unknown"`, the hook does `Math.round("Unknown")` → `NaN`, and `[ NaN -lt 80 ]` makes bash print `integer expression expected` and return 2 — which `if` reads as "condition false", so it took the PASS branch and logged:

```
TypeScript coverage: NaN% ✅ (≥ 80%)
```

The threshold was never enforced locally, and the log showed a ✅ next to a bash error. `coverage.include: ['src/**/*.ts']` plus `cleanOnRerun: false` forces untested files into the report on subset runs too (`@vitest/coverage-v8` only merges them when `include != null && (allTestsRun || !cleanOnRerun)`), so the total is always a real number. The gate now reports `⚠️ Partial coverage 0% (subset test run, not full suite)` — honest, and labelled as partial. Full-suite coverage is unaffected: 93.85% statements, 82.32% branches, 96.56% functions, 94.17% lines. `tests/coverage-gate.test.ts` guards it, verified to fail when either option is removed.

Note: `coverage.all` no longer exists in `@vitest/coverage-v8` v4 and silently does nothing — it was tried first and produced `0` files with no error.

### Refactoring

`scripts/mutation-test.mjs`'s `main()` had grown to 19 cyclomatic complexity while adding the threshold check in the previous commit. Neither `npm run complexity` (TypeScript AST only) nor Gate 3 (`lizard`, Python only) covers a `.mjs` file, so archlint's NEW MEDIUM was the only signal. The target-selection branch — three modes plus the empty-set handling — moved to `resolveTargets()`; the archlint finding is gone and the 23 tests still pass.

## [1.11.21](https://github.com/boyingliu01/dialog-survey/compare/v1.11.20...v1.11.21) (2026-10-24)

### Tooling

**#209, suggestion 3 — the mutation threshold no longer depends on the xp-gate patches.** The three upstream bugs that make Gate M report 0.0% (repeated `--mutate` keeping only the last file, `--config` not being a Stryker option, and the schema-1.0 report having no aggregate score) are patched by hand in `~/.config/xp-gate/`, where any xp-gate update erases them — which has now happened twice.

`scripts/mutation-test.mjs` already bypassed the first two: it invokes `npx stryker run` directly and joins the file list with a comma. What it did *not* do was enforce the threshold, because `stryker.conf.json` sets `break: 0` — Stryker itself never fails on a low score, so the 60% gate existed only inside the patched xp-gate runner.

It now reads `.stryker-report.json` itself, aggregates the raw `files[].mutants[]` list into `Killed+Timeout / (Killed+Timeout+Survived+NoCoverage)`, and exits 1 below the threshold (override with `MUTATION_THRESHOLD`). `RuntimeError`/`CompileError`/`Ignored`/`Pending` are excluded from the denominator, matching Stryker's own definition — counting them would turn an infrastructure failure into a "weak tests" verdict. A missing or empty report exits 2 rather than reporting a fabricated 0% or a false pass, because "no report" means the run told us nothing.

So the Gate M threshold is now enforceable without the global patches, and an xp-gate update can no longer silently change the verdict. `npm run test:mutation:verify` (`--verify-report`) re-judges an already-produced report without re-running Stryker, so a CI artifact can be checked by this repo's threshold too. Eight new tests pin the aggregation, the denominator rule, the tolerance override, and the fail-closed handling of a missing report.

### Bug Fixes

Twelve open issues, plus the quality gates that were supposed to be catching them.

**#202 — interview plans never left `RUNNING`.** `updatePlanStatus()` existed but only `pausePlan`/`resumePlan`/`cancelPlan` called it, so a one-member plan whose interview completed stayed `RUNNING` forever. New `PlanCompletionService` is scheduled from `src/core/graph.ts` at the same `shouldContinue === false` site as analysis, as an independent `setImmediate` — report generation failing must not also abort plan bookkeeping. The transition is guarded (`updateMany` matching `status: 'RUNNING'`), so a concurrent cancel or pause wins the race instead of being clobbered, and a cancelled plan is never resurrected. `getDb()` is called *inside* the try because it throws synchronously without `DATABASE_URL`, and an uncaught throw in a deferred callback would take the process down mid-turn.

**#203 — forced-cap reply/question misalignment.** Two code paths handled "max follow-ups reached" differently: `resultFromParsed()` replaced the model's text with the next question, while `routeAction()` rewrote the action but kept the follow-up wording — so the user was shown a question about the topic being left while the pointer had already advanced, and their answer was filed under the next question. That is the same family as #200. `routeAction` is now the single consistency guarantee: a coerced FOLLOWUP→NEXT discards the follow-up wording and emits `buildForcedNextTransition(nextQuestion)` alongside `currentQuestion: currentQ + 1`; on the last question it completes with the closing copy rather than sending a stray question as the final message.

NEXT continuity was prompt-only and measured ~40% compliance on a real 12-question interview. The prompt now states an ordered two-step requirement, and `addContinuityLeadIn()` adds a deterministic, LLM-free backstop that prepends a neutral lead-in **only** when nothing precedes the question — nine negative cases pin that any real opener survives byte-for-byte, so false positives are ruled out. Fabrication guidance and a "don't quote an 原话 that was never spoken" rule were added, and `stripExtraQuestions` leaks were closed (the forced transition's embedded question text, and a cut that left a dangling opening bracket).

**#204 — the alias fix was unreachable in production.** `DingTalkStreamClient.fromEnv()` accepted `DINGTALK_APP_KEY`/`_SECRET`, but `src/server.ts` still gated *whether to build a client at all* on the canonical names — so an APP_KEY-only deployment took the credential-free path and never attempted the socket, which is the issue's silent-bot symptom with a different log line. Both `createDingTalkStreamClientOrWarn()` and `isDingTalkConfigured()` now resolve through `dingTalkCredentialsFromEnv()`.

### Refactoring

**#205 — `src/api/admin-templates.ts` was 1108 lines with 28 routes.** One file carried every template, plan, report, analytics and export route. It was the shared root cause behind Gate 6's `GodModule`, Gate 4's largest long-function finding, part of Gate 12, and 887 of the mutants that made Gate M take ~41 minutes.

It is now 39 lines of pure wiring; the handlers live in `src/api/admin/` grouped by route responsibility (`templates.ts` 11 routes, `reports.ts` 7, `plans.ts` 6, `analytics.ts` 4, plus `template-form.ts`, `view-models.ts`, `report-view.ts`, `shared.ts`, `html.ts`). All 28 route paths are unchanged, `src/server.ts` needed zero edits, and `adminTemplatesRoutes` keeps its name, signature and options type so every test harness works untouched. archlint now reports `God Module found: 0`, and the largest new file is 343 lines.

Also reduced `routeAction` from 8 parameters to 6 via an options object.

### Tooling

**#209 — the Gate M patches live outside the repo and xp-gate updates erase them.** While working this issue the `pre-commit` hook really was rewritten underneath us (185227 → 200065 bytes), which is the documented risk. `scripts/verify-xp-gate-patches.cjs` now also runs `bash -n` over both hooks: the update that overwrote `pre-commit` introduced a stray backtick (`echo "... $new_file — ..."`), bash read the closing backtick as a command substitution, and **every gate after Gate 5 silently did not run** while the commit was let through. None of the existing mutation-runner checks could see that. The syntax check is reported separately from the Gate M verdict, because a syntax error is fatal to all gates while a missing patch is fatal only to Gate M.

`scripts/run-xp-gate.sh` runs the gates in a repaired environment. On this machine (`appendWindowsPath = false`) they had never actually executed: Gate 1 reported `SKIP - npx not available`, Gate 8 `BLOCKED - gitleaks not installed` with gitleaks on PATH, and Gate 9 `BLOCKED - build integrity check failed` for a path-translation problem. Five upstream xp-gate defects were filed (#579, #580, #581, #582, #592) and are recorded in `docs/xp-gate-defects-2026-10.md`.

Gate 8 still reports SKIP, not PASS, and that is now documented rather than worked around: gitleaks 8.30.1 does not create its `--report-path` file when a scan finds nothing, so the gate's "did the scan run?" check sees no evidence on any clean machine. The scan itself runs and finds nothing — `INF scanned ~159459 bytes` / `INF no leaks found` — but the gate cannot distinguish that from "never scanned" (xp-gate #592).

### Docs

New `docs/xp-gate-defects-2026-10.md` records each upstream defect with its reproduction and the local workaround.

### Known remaining work

**#211** cannot be closed by code: the three leaked credentials need rotation by the repository owner. The history scan and CI step are in place, and that step deliberately stays non-blocking until rotation is done — a permanently-red check trains people to ignore it.

**#210**'s dependency prune (`scripts/prune-runtime-deps.mjs`) is wired into `deploy.sh` but not into the Docker image, so the image still carries all 620 build-time packages. Wiring it needs a machine with Docker to verify, and it must be ordered before `migrate deploy` (pruning removes the `prisma` CLI) — which means a dedicated `migrate` build target rather than a one-line Dockerfile edit.

## [1.11.20](https://github.com/boyingliu01/dialog-survey/compare/v1.11.19...v1.11.20) (2026-10-23)

### Docs

`docs/quality-gates-audit-2026-10.md` — an audit of what each gate actually inspects, prompted by the discovery that several of them had been reporting PASS without ever scanning the thing they claim to check. It records the verification command for each gate, the structural SKIPs (Gate MP checks xp-gate's own mirrors; Gate MW is PR-only), and the distinction between archlint's DeadSymbol false positives and its two genuine ones (`PromptService.getTemplate`, `DingTalkClient.generateSignature` — the latter shadowed by an unrelated same-named function in `middleware.ts`).

The short version: every gate that can apply to this repository now passes on its own terms, with two exceptions that are documented rather than hidden — issue #211's credential rotation, which only the repository owner can perform, and `admin-templates.ts` at 1019 lines (issue #205), which is the shared root cause behind Gate 4's largest long-function finding, part of Gate 6, and Gate 12.

## [1.11.19](https://github.com/boyingliu01/dialog-survey/compare/v1.11.18...v1.11.19) (2026-10-23)

### Security

Gate 8 has reported PASS on every commit and push, and it was never scanning the right thing. `gitleaks/gitleaks-action` inspects the pull request's diff; a credential that entered history before the base branch's tip never appears in a later diff, so nothing ever looked at it. Running `gitleaks git` across all 398 commits found three live credentials (issue #211):

- A **DingTalk app** `CLIENT_ID` / `CLIENT_SECRET` / `AGENT_ID` in three planning documents (`.omo/`, `.sisyphus/`, `.speckit/`). Verified against the local `.env`: it is the credential this deployment currently uses.
- Two provider API keys in `benchmark_llm.py` — DashScope (`sk-sp-…`) and Volcengine Ark.

All three were deleted from the tree long ago, which accomplishes nothing: anyone who can clone can read any historical blob. **Rotation is the only remedy and only the repository owner can do it** — tracked in issue #211.

What this change adds so it cannot happen quietly again:

- `scripts/scan-git-history-secrets.mjs` — full-history scan with a clear exit-code contract: 0 clean, 1 findings, 2 the tool is missing. The 2 matters: a guard that reports green when its scanner is not installed is worse than no guard, because it answers the question and the answer is wrong.
- `.gitleaks.toml` gains an allowlist for documentation placeholders (`your_api_key`, `<YOUR_CLIENT_SECRET>`, `xxx`, `test-secret-…`) and excludes `.stryker-tmp/`, which holds Stryker's copy of the working tree and multiplied the two real hits into nineteen.
- CI `security-scan` runs the full-history scan. It stays `continue-on-error` until #211's rotation is done — the findings are already in immutable history, so a blocking step would be permanently red and train everyone to ignore it. Flip it to blocking after rotating.
- `tests/scan-git-history-secrets.test.ts` pins the exit codes, including the missing-tool path.

Also removed the last two `noExplicitAny` warnings, so `biome check` is now clean rather than carrying a permanent 2-warning floor.

Touching `pr.yml` also surfaced a latent baseline problem: the workflow had no top-level `permissions` block, which checkov reads as the repository default and flags as `CKV2_GHA_1` (write-all). It had never been reported because Gate 7 only scans files a commit actually changes. Now `contents: read` / `pull-requests: read` / `security-events: write` — enough for checkout and for gitleaks to annotate the PR and upload SARIF, and nothing else.

## [1.11.18](https://github.com/boyingliu01/dialog-survey/compare/v1.11.17...v1.11.18) (2026-10-23)

### Refactor

Two functions that Gate 6 (archlint) flagged as new MEDIUM findings once this round's work brought them into scope. Neither blocked the commit — Gate 6 ratschets on `--fail-on high` — but the whole point of a ratchet is that new debt does not get parked.

- `export.service.ts:loadInviteeInfo` — cognitive complexity 16. Four nested guards (`Array.isArray` → per-entry object check → `userId` match → per-field `typeof`) read as one staircase. Restructured to find-the-matching-entry then read-its-fields, with an `isRecord` type guard. The guards still all run; they just no longer nest.
- `scripts/prune-runtime-deps.mjs:main` — cognitive complexity 34, cyclomatic 21. Split into `reportRemoval` (what would be or was deleted) and `assertKeptPackagesResolve` (the post-condition that every kept package still resolves its dependencies). `main` now reads as the four steps it actually performs.

`export.service.ts` mutation score went 72.48% → 73.28% as a side effect, since the flattened function is easier for the existing tests to reach. Its remaining archlint findings are MEDIUM DeadCode on the CLI script itself, which predates this change and is structural: a standalone entry point has no importer by definition.

### Verified

Every gate was re-run against the current tree rather than trusting the previous run's SKIPs. Gate 4 (principles) exits 0 with no ERROR findings — the 308 findings are all warnings/info. Gate 6 diffs clean against its baseline with 37 improvements and no new HIGH. Gate 10, which had never actually scanned this repo because no commit ever matched its file filter, reports exactly one finding — `src/api/templates.ts:91`, an Express-flavoured XSS rule matching a Fastify handler that returns a plain object for JSON serialisation. That is a false positive, confirmed by reading `formatTemplateResponse`, which builds no HTML. Coverage is 93.21% lines / 81.71% branches / 95.95% functions / 93.69% statements against an 80/80/70/80 floor.

## [1.11.17](https://github.com/boyingliu01/dialog-survey/compare/v1.11.16...v1.11.17) (2026-10-23)

### Tests

The 1.11.16 push was blocked by Gate M on three files I had assumed needed no work because their diffs were small — a one-line delegation and a boolean. The diffs were small; the files were not. Local scores after the fix:

| File | Before | After |
| --- | --- | --- |
| `src/core/types/index.ts` | 25.7% | **91.43%** |
| `src/core/graph.ts` | 57.1% | **92.06%** |
| `src/integrations/dingtalk/stream-client.ts` | 53.5% | **73.90%** |

- `tests/state-schema-contract.test.ts` (34 tests) makes the Zod schema a contract. All 35 mutants in that file were enum string literals, and nothing asserted them: renaming `'CANCELLED'` to `'CANCELED'` would have passed the entire suite while rejecting every cancelled interview already in the database. Each legal and illegal value is now pinned, along with the defaults. It also surfaced a real inconsistency — `responses` is required while the pending lists default to `[]`.
- `tests/graph-edges.test.ts` (22 tests) covers the edges: `firstTurn` genuinely overriding the stored status (the whole point of #200), the blank-message guard, and the fire-and-forget analysis actually being scheduled on completion. The last one had no assertion at all because it runs in `setImmediate`.
- `tests/stream-client-credentials.test.ts` (8 tests) proves `fromEnv` reads `DINGTALK_APP_KEY`/`_SECRET`. The pre-existing test asserted only `toBeInstanceOf`, so it passed both before and after the #200 fix — an assertion that cannot tell two behaviours apart is why a covered file still scored 53%.
- `tests/stream-client-lifecycle.test.ts` (15 tests) covers the recovery machinery that had never executed: the circuit breaker opening at the threshold, going HALF_OPEN after the cooldown and reopening on the next failure, the reconnect backoff, and the shutdown short-circuits.

A note for future mocks here: under Vitest 4, `vi.fn().mockImplementation(...)` is not constructible through `new`, so a class-shaped mock silently never runs its body — the analysis assertions failed for the mock's reasons rather than the code's. Declaring a real `class` in the factory works.

## [1.11.16](https://github.com/boyingliu01/dialog-survey/compare/v1.11.15...v1.11.16) (2026-10-23)

### Tests

Gate M's threshold is 60%, and it only mutates files changed against the base ref — so this round's fixes dragged five files into scope and three of them were already below the bar. None of that showed up before because the gate never looked at them.

| File | Before | After |
| --- | --- | --- |
| `export.service.ts` | 47.29% | **72.48%** |
| `interviewing.ts` | 60.83% | **84.17%** |
| `followup.service.ts` | 48.77% | **70.44%** |
| `interview-plan-send.service.ts` | 34.98% | **63.05%** |
| `stream-message.service.ts` | 62.69% | **63.25%** |

No threshold was lowered and no file was excluded — the scores went up because the untested branches got tests.

- `tests/export-html-rendering.test.ts` (15 tests) mocks Playwright and inspects the HTML the PDF path builds. The existing suite let real chromium render a PDF and only checked the file existed, so `loadInviteeInfo` (24 surviving mutants on its own) and the whole header/table layout were unasserted. Also covers `translateSentiment`'s map and its pass-through fallback.
- `tests/interviewing-routing.test.ts` (13 tests) pins the routing table: the follow-up cap degrading FOLLOWUP to NEXT while STAY is exempt, the early-end warning and its `remainingQuestions` arithmetic, pointer movement on advance and on completion, the `isLastQuestion` flag handed to the prompt builder, and both fallback branches.
- `tests/followup-prompt-and-diagnostics.test.ts` (17 tests) makes the log line the observable. The single biggest cluster was a conditional whose entire body was an `info(...)` call — the branch ran, nothing changed, so no test could fail. Capturing the prompt also covers history truncation to six turns, the last-question hint and the next-question hint.
- `tests/plan-send-resend.test.ts` (12 tests) covers `resendToInterview`, which had **no test at all** (75 mutants never executed): the missing-interview and wrong-plan guards, the sentCount/failedCount increments, and the rule that a re-resend of an already-counted interview must not count twice.

`tests/export-font-location.test.ts` now skips its repository-layout assertion inside Stryker's sandbox, where `.otf` files are excluded by design; the metric that mattered was being read anyway, because a failing dry run makes the score meaningless rather than low.

## [1.11.15](https://github.com/boyingliu01/dialog-survey/compare/v1.11.14...v1.11.15) (2026-10-23)

### Changed

- chore(deps): remove `@langchain/core` and `@langchain/langgraph`, which had zero references in `src/` and `tests/` — leftovers from the LangGraph evaluation that concluded not to migrate (`docs/langgraph-migration-evaluation.md`) without removing the dependencies. The lockfile drops 18 packages.
- perf(export): load `playwright` and `xlsx` via dynamic `import()` inside the functions that need them instead of at module load. Both are only used by the PDF and Excel paths, so importing them at startup made every process pay their parse cost whether or not anyone exported anything.
- feat(deploy): `scripts/deploy.sh` now prunes build-time tooling after the build and before the service starts (Phase 6.5), taking a deployed tree from ~373 MB to ~147 MB.

### Notes

- `npm ci --omit=dev` does **not** solve this, and neither does `npm prune --omit=dev`. `prisma` and `typescript` are devDependencies of this package *and* optional `peerDependencies` of `@prisma/client`, so npm records them as `devOptional` and `--omit=dev` deliberately keeps those. That one ambiguity drags in `@prisma/dev`, `@prisma/studio-core` (Prisma Studio, a GUI), `effect` and an embedded PGlite.
- `scripts/prune-runtime-deps.mjs` therefore derives the runtime closure from the imports in the compiled `dist/` output rather than a hand-written deletion list — a hardcoded list goes stale silently the moment a package gains a dependency, and the failure mode is a broken deploy. It then verifies every kept package still resolves its real dependencies and exits non-zero rather than shipping a tree that is missing something. `--dry-run` reports what it would remove; on this repo that is 620 packages / 425 MB, keeping 148.
- Ordering constraint: `migrate deploy` runs in Phase 4 while the Prisma CLI is still installed. Moving migrations after the prune removes the CLI.
- Read with `docs/reports/deployment-cost-evaluation-2026-10.md` and `docs/sprints/2026-10-24-issue-deps-slim/`.

## [1.11.14](https://github.com/boyingliu01/dialog-survey/compare/v1.11.13...v1.11.14) (2026-10-23)

### Changed

- refactor(assets): move the 15.68 MB CJK font out of `reports/` into `assets/fonts/`. The directory was doing two unrelated jobs: `ExportService` writes generated PDFs and workbooks into it, *and* it held a git-tracked font that tests and exports read. That mix caused real damage rather than theoretical risk — `rm -rf reports` during a cleanup deleted a tracked code asset (needing a `git checkout` to restore), `.gitignore` and `.dockerignore` each needed a whitelist exception that existed only for the font, and Stryker's `ignorePatterns` had to learn about the directory at all, which is the path that ended with an unanchored `reports` entry excluding `src/views/reports/` and breaking every mutant dry run. With the font elsewhere, `reports/` is a pure output directory: safe to delete wholesale, ignored as a unit, and no longer a trap for cleanup scripts.
- `ExportService` now resolves the font from `ASSETS_DIR` (default `./assets/fonts`), independent of `REPORTS_DIR`. A deployment that still has the font in the old location keeps rendering Chinese and logs one line naming both paths, so the stale copy can be removed deliberately instead of silently.
- `Dockerfile` copies `assets/` into the image; `.dockerignore` now excludes `reports/` outright instead of carving out a font exception.

### Tests

- `tests/export-font-location.test.ts` (4 tests) pins the new resolution order, the legacy fallback, and the repository contract that the font exists under `assets/` and not under `reports/`.
- `tests/export.service.test.ts` points both directories into its temp tree, so it can never accidentally read the real bundled font and lose the "missing" branch it asserts.

## [1.11.13](https://github.com/boyingliu01/dialog-survey/compare/v1.11.12...v1.11.13) (2026-10-23)

### Bug Fixes

- fix(core): the "one question per turn" rule was never enforced. `stripExtraQuestions` was written for exactly that and had **zero call sites**, so both LLM paths relied on the prompt asking the model nicely; a model that returned two questions had both delivered to the interviewee. It is now applied at the single exit both paths funnel through (`resultFromParsed`) plus the unparseable-JSON path (`nextResult`). A re-asked follow-up is deliberately exempt — it is one question by construction, and trimming it risks cutting a summary sentence that happens to contain a question mark.
- fix(core): the bot announced a next question and then ended without asking it. `interviewingNode` folded `shouldEndInterview` into the action by passing `'END'`, which erased the record of what the model's text meant: a `NEXT` response whose text said "let's move on to…" was concatenated with the closing message and sent as an ending. `routeAction` now receives `shouldEndInterview` as its own argument and keeps the model's lead-in only when the model itself chose `END`; an override sends the closing message alone.
- fix(core): follow-up answers were indistinguishable from primary ones. `interviewingNode` hardcoded `isFollowup: false`, so a follow-up round could not be told apart from a fresh answer when reviewing a plan per question, and there was no depth recorded at all. Answers now carry `isFollowup` and `followupDepth` from the actual `followupCount`. `followupDepth` is optional in the schema rather than defaulted, because states persisted before the field existed have no such key.

### Tests

- `tests/interview-dialog-determinism.test.ts` (11 tests) covers all three: multi-question trimming on the parsed path, the follow-up exemption, ending copy that never promises an unasked question (override, genuine END, and the final-question wrap-up), and `isFollowup`/`followupDepth` at depths 0, 1 and 2. Verified red before the fixes.
- `conversation-engine.integration.test.ts` updated for the added `followupDepth` key — the assertion failed exactly where the contract changed, which is the test doing its job.

## [1.11.12](https://github.com/boyingliu01/dialog-survey/compare/v1.11.11...v1.11.12) (2026-10-23)

### Bug Fixes

- fix(db): drop `InterviewPlan.completedCount`, a column nothing ever wrote. `sentCount` and `failedCount` each have increment/decrement paths in the send and member services; `completedCount` had none, so it stayed at its default 0 for the lifetime of every plan while `sentCount` beside it moved. Every reader already computed completion from the interviews relation instead — `admin-templates.ts` counts `p.interviews.filter(status === 'COMPLETED')` and `analytics.service.ts` does the same — so the admin UI showed the right number while the stored field disagreed with it. Keeping the column means keeping a field that is guaranteed to be stale, and the next report, export or integration to read it instead of the relation would silently report 0% completion. "A plan is complete" stays expressible as a query over its interviews, which cannot drift. A `template-crud` fixture that set `completedCount: 3` alongside a single completed interview (mismatching by design) is gone with it.

### Changed

- `prisma/migrations/20261023000000_drop_interview_plan_completed_count` performs the `ALTER TABLE ... DROP COLUMN`, generated with `prisma migrate diff` against the previous schema so the SQL is exactly what Prisma emits.
- `TemplateRepository.getUsageStats` no longer selects `completedCount` on the nested plans.

## [1.11.11](https://github.com/boyingliu01/dialog-survey/compare/v1.11.10...v1.11.11) (2026-10-22)

### Bug Fixes

- fix(core): the opening message was stored as the answer to question 1, and `planningNode` never ran. `StreamMessageService` persists `PROCESSING` before calling the graph (two-phase durability), and `runInterviewGraph` decided "is this the first turn?" by checking `initialState.status === 'PENDING'` — a status the caller had just overwritten. So `planningNode` was unreachable on the real message path: the greeting was never sent, `polishFirstQuestion` and the first-question send never happened, the user's "开始访谈。" landed in `q0`, and the same question then collected a second response when the real answer arrived. `runInterviewGraph` now takes an explicit `firstTurn` option that the service captures *before* the status flip; a resumed `PROCESSING` interview stays a later turn, so recovery does not re-send the greeting. Found by an E2E run against a live deployment — every existing test handed the graph a fresh `PENDING` state, which is exactly the shape production never produces.
- fix(core): the greeting rendered `欢迎参加「undefined」访谈调查` for any template whose opening line lacked an intent word. Two independent halves combined: `loadTemplateContent` returned the parsed content JSON only, but the template `name` lives in the `Template` row (the content JSON never has one), and `planningNode` interpolated `content.name` when the first 40 characters of the prompt did not match `/访谈|采访|聊一聊|survey|interview/`. `loadTemplateContent` now merges the row's name, `TemplateContent.name` is optional so the type stops claiming a field the data does not have, and the greeting falls back to `本次访谈调查` when no name is resolvable — no empty quotes, no `undefined`. This only became visible once the planning gate above was fixed, since the greeting had never been sent before.
- fix(services): invitation copy hardcoded one deployment's bot name, so every other deployment told invitees to message a robot that did not exist there. `DINGTALK_BOT_NAME` now supplies the name; when unset the copy says `直接回复本机器人任意消息` rather than naming a brand, because a wrong name is worse than a vague one. `.env.example` and `.env.production.example` document the variable.

### Tests

- `tests/planning-template-name.test.ts` (6 tests) pins the name merge and both greeting branches — named, nameless (no `「」`, no `undefined`), and the intent-word skip.
- `tests/invitation-bot-name.test.ts` (6 tests) covers both copy branches with the name configured, unset, blank, and padded, and asserts the legacy brand never reappears.
- `tests/graph.test.ts` gained 3 cases proving `firstTurn` is authoritative over `status`, and `tests/stream-message-branches.test.ts` gained 4 asserting the service reports `firstTurn` correctly for `PENDING`, `ACTIVE` and resumed `PROCESSING` while still persisting `PROCESSING` for durability.
- All four new suites were verified red before their fix and green after.

## [1.11.10](https://github.com/boyingliu01/dialog-survey/compare/v1.11.9...v1.11.10) (2026-10-22)

### Bug Fixes

- fix(dingtalk): the Stream client ignored `DINGTALK_APP_KEY`/`DINGTALK_APP_SECRET`. REST already fell back between the two credential spellings, but `DingTalkStreamClient.fromEnv()` read only `DINGTALK_CLIENT_ID`/`DINGTALK_CLIENT_SECRET`. On a deployment configured with the `APP_KEY` spellings — the names DingTalk's own console uses, and the ones `client.ts` documents as supported — outbound messages went out normally while the WebSocket silently never connected, so the bot looked correctly configured and simply never replied. This is the worst shape a config bug can take: "can send, cannot receive" reads like a network or platform problem, not a variable-name one. Both clients now resolve through the same `dingTalkCredentialsFromEnv()`, so the two spellings cannot drift apart again.
- fix(dingtalk): dropped `agentId` from `DingTalkClientOptions` and `DingTalkStreamConfig`. Neither client ever read it — only `message-sender.ts` needs the value and it reads the env var directly — so passing it had no effect and invited callers to believe it did. Nothing consumes the field, so this is a pure removal with no behaviour change.
- chore(tooling): added `scripts/verify-xp-gate-patches.cjs` and wired it into `npm run smoke`. Gate M cannot produce a verdict with stock xp-gate 0.30.5: three bugs in the Stryker runner (repeated `--mutate` keeps only the last file, `--config` is not a Stryker option, the schema-1.0 report carries no aggregate score) and one in `hooks/pre-push` (the TypeScript branch never passes `--timeout`, so gate-m's 120s default applies where this repo needs ~48 minutes) make it report 0.0% or SKIP regardless of test quality. Those files live in `~/.config/xp-gate/`, outside version control, and an xp-gate update overwrote the hook patch once already mid-session. The verifier names what breaks when a patch is missing and can restore the timeout one with `--fix`.

### Tests

- `tests/dingtalk-credential-aliases.test.ts` (10 tests) pins both client call sites to the shared resolver: either spelling configures the Stream socket, the two sides resolve to the same credentials, `APP_KEY` wins when both are set, and `agentId` stays out of both config objects. Verified red before the fix (4 failures) and green after.
- `tests/verify-xp-gate-patches.test.ts` (7 tests) drives the verifier against a throwaway fake `~/.config/xp-gate` tree so it asserts the detection logic rather than whatever happens to be installed on the machine, including that `--fix` refuses to claim success when the anchor text has been restructured upstream.

## [1.11.9](https://github.com/boyingliu01/dialog-survey/compare/v1.11.8...v1.11.9) (2026-10-21)

### Bug Fixes

- fix(gate): `ccn-report.cjs` carried two of the very smells it exists to detect. The `--csv-verified` stdin handler was a 27-decision, cognitive-45 arrow nested inside `main()`, holding row parsing, AST matching, drop/fail triage and report formatting at once; it is now split into `parseLizardRow`, `findMeasuredFunction`, `classifyUnresolvedRow`, `verifyCsvRow`, `reportBatch` and `runCsvVerified`, so each decision is testable on its own and the reporting thresholds are stated in one place. `parseCsvLine` was three levels of nested `if` for quote handling and is now a flat state machine that tracks the consumed length instead of mutating the loop counter mid-body.
- fix(api): `findInviteeInfo` nested four conditions to read two optional string fields. Field extraction now lives in `pickInviteeFields`, which returns null for a non-object entry, so the search reads as "first entry whose userId matches".
- fix(services): `recoverFromPersistFailure` took six positional parameters, three of which (`state`, `parsed`, `message`) were always passed together and describe one request. They are now a single `request` object, dropping the signature to four.
- fix(gate): `stryker.conf.json` blocked every push that touched `admin-templates.ts`. Its `ignorePatterns` listed a bare `reports`, and Stryker matches those patterns anywhere in the tree — so it also excluded `src/views/reports/`, the mutation sandbox lost those two `.njk` templates, and the dry run died with `GET /admin/reports` → 500 because the view engine could not find `reports/index.njk`. Gate M then reported a **0.0% mutation score** and blocked the push. Now anchored (`/reports`, `/coverage`, `/.xp-gate`). This was pre-existing: it reproduced identically on the previous commit and has nothing to do with the refactors in this release.
- fix(services): the version-conflict retry in `StreamMessageService` never retried. After a conflict `processStreamMessageWithState` re-entered the **public** `processStreamMessage`, which consults the dedup cache — and the cache already held this `messageId` because the first attempt registered it. Every retry therefore returned `Duplicate message` instead of retrying, so `MAX_RETRIES = 3` was unreachable and a message lost to a concurrent write was silently dropped. The retry now re-enters `processMessageInternal` directly, bypassing dedup, and threads `prisma` through so the retry resolves the same template as the first attempt. Found by writing the test that asserts the retry chain exhausts; the old code passed every existing test.
- fix(tooling): `biome.json` did not ignore `reports/` or `.stryker-report.json`, so running mutation testing made `biome check` fail on Stryker's generated HTML/JSON before a single source line was involved. Both are ignored now.

### Tests

- Mutation score, the two files Gate M mutates on this release (threshold 60%):
  - `src/services/stream-message.service.ts` **31.19% → 62.69%**. Added `tests/stream-message-branches.test.ts` (40 tests) covering the cooldown window and its env-var fallbacks, the dedup LRU and its eviction, whitespace-only content, every timeout-nudge branch, the version-conflict retry chain to exhaustion, COMPLETED-vs-ACTIVE status preservation, the user-name backfill and its swallowed-failure path, template selection, and per-user serialization. The logger is mocked so the "retries exhausted" warnings are asserted rather than merely executed — an unassertable log line is exactly what a surviving `StringLiteral` mutant looks like.
  - `src/api/admin-templates.ts` **39.12% → 60.09%**. Three files, because the survivors were of two different kinds. `tests/admin-route-coverage.test.ts` (45 tests) drives the Markdown download (header, transcript, analysis section, plus the no-report / unmapped-sentiment / not-an-invitee / planless variants), report detail, template usage/stats, publish, the edit form, analytics data, both form shapes for template creation (`questions[n][text]` and a nested `questions` object — the flat path indexes by position, the object path sorts and trims), and plan/template update and delete including the stale-version 409 and missing-version 422. `tests/admin-error-branches.test.ts` (22 tests) injects failing collaborators so every `catch` block renders its 500 with the original message — the exact body, not just the status, because a swallowed error also returns 500.
  - Net **+77 tests** (1583 → 1660); the only source behaviour change is the retry fix above.

### Chores

- Verified against xp-gate 0.30.5 (was 0.29.0). A full twelve-gate scan reported 10 new MEDIUM findings from Gate 6 `archlint`; six were real and are fixed above, the other four are `DeadSymbol` false positives on `InterviewPlanSendService.{sendInvitations,resendToInterview,pausePlan,resumePlan,cancelPlan}` and `InterviewPlanService.importMembers` — all six are called from `src/api/plans.ts`, five through `registerLifecyclePost(path, (id) => planService.X(id))`, which archlint cannot follow through a callback reference. Recorded in `AGENTS.md` so it is not re-litigated or "fixed" by deleting live code.
- Gate 10 (semgrep SAST) SKIPs on this machine: it exceeds the 180s budget and the gate correctly refuses to report a timeout as a clean scan. It needs `XP_GATE_SEMGREP_TIMEOUT` raised to produce a verdict here; it is unaffected by this release.

## [1.11.8](https://github.com/boyingliu01/dialog-survey/compare/v1.11.7...v1.11.8) (2026-10-20)

### Bug Fixes

- fix(gate): the complexity measurement engine is now the TypeScript compiler AST. The previous brace-matching implementation was structurally unable to measure TypeScript correctly, and its failures were not theoretical:
  - `function f(): { a: string } { … }` had its return-type literal taken for the body, so the real body was never counted. `mapServiceErrorToStatus` (8 decision points) and `parseCsv` (7) both measured 1.
  - Class methods (`async getAccessToken(): Promise<string> {`) matched neither recognised declaration form. **170 methods were never measured at all** — 99 at CCN >= 2 and 14 above the threshold — and so could never appear in the baseline the ratchet compares against.
  - Line numbers pointed at the blank line above each function, sending anyone reading a violation to the wrong place.
  Adopting the AST surfaced 14 functions above CCN 10 that the gate had been reporting as clean; all are now refactored under the threshold, including `processMessageInternal` (27 -> 9), `getUsageStats` (20 -> 4), `sendInvitations` (18 -> 5) and `sendReminder` (17 -> 4). `.ccn-baseline.json` grew from 234 to 527 entries, max CCN 10: the old file was recorded from an engine that could not see class methods.
- fix(gate): `--csv-verified` no longer passes an unmeasured row through at lizard's number. lizard is a regex/line parser whose span tracking was wrong on 28% of this tree (it merged `scheduleAnalysis` into `mergeState` and dropped it entirely), and the old verifier silently fell back to lizard's CCN exactly when it disagreed — so the "verification" step was inert precisely when it mattered. The AST now decides every row and lizard's number is kept only as a cross-check. Rows are then triaged instead of blindly trusted or blindly fatal: a row for a construct that is not a function implementation (an interface member such as `readonly disconnect: () => Promise<void>;`, a property typed `let release: (() => void) | undefined;`, a row named after the `if` it was scanning, a stray `,` or `...`) is discarded, because there is nothing to grade; a row naming a real function the AST cannot resolve still fails the gate closed, because that is a hole in our own coverage.
- fix(gate): expression-bodied arrows were excluded from measurement entirely — `node.body && ts.isBlock(node.body)` required a brace block, so `… .filter((r) => a && b)` and every other concise callback never counted. These are pervasive in this codebase; they are now measured, and `.ccn-baseline.json` grew from 527 to 633 entries as a result. Generated code (`src/generated/`, i.e. the Prisma client) is classified out of grading the same way tests already were — holding hand-written code to a code generator's output is meaningless, and its dense type-level helpers are exactly what lizard reports phantom functions for.
- fix(repo): `getUsageStats().safeToDelete` counted completed and cancelled interviews as blockers while refactoring. Caught by the existing suite; the active-only distinction is now an explicitly named helper (`totalActiveInterviewUsage`).

### Chores

- test(gate): `tests/ccn-gate.test.ts` grew from 8 to 23 cases covering the AST migration: object and union return-type annotations, class methods, private methods, constructors, arrow fields, nested-callback attribution, concise arrow bodies, and fail-closed behaviour on a file that cannot be parsed. Four of them pin `--csv-verified` itself — that lizard's number is replaced, that simulated interface members are dropped rather than graded, and that a measurable function's row survives.
- docs: `scripts/ccn-report.cjs` lost 84 lines of dead regex parser (`matchParen`, `signatureStart`, `extractBody`) left behind by the migration.

## [1.11.7](https://github.com/boyingliu01/dialog-survey/compare/v1.11.6...v1.11.7) (2026-10-20)

### Bug Fixes

- fix(gate): the CCN report (`scripts/ccn-report.cjs`) under-counted complexity, so `npm run complexity` and the xp-gate Gate 3 ratchet could pass while real complexity went unmeasured. The method-shorthand branch matched `for (...) {` and `catch (e) {` as if they were nested function bodies and blanked them before counting, so every `if`, `&&` and nested `catch` inside a loop disappeared. Re-measuring after the fix surfaced two functions above CCN 10 that had been invisible: `runInterviewGraph` (12) and `cleanupApplicationResources` (12), both now refactored under the threshold. `.ccn-baseline.json` was regenerated from 227 entries (max 8) to 234 (max 10) — the previous baseline was recorded from the broken measurement.
- fix(export): Docker images shipped without the CJK font, so every exported PDF rendered Chinese as blank boxes. `.dockerignore` excluded the whole `reports/` directory, `Dockerfile` never copied the font, and `export.service` degraded silently to a font name that `node:alpine` does not have. The font is now whitelisted and copied, and a missing font logs a one-shot warning naming the expected path.
- fix(gate): xp-gate's Gate 5 reported `DEGRADED (coverage: N/A%)` because it reads `coverage/coverage-summary.json` (istanbul format) and the Vitest config only emitted `json`/`html`. Added the `json-summary` reporter so the 80/80/70/80 thresholds are actually enforced locally instead of being reported as unavailable.

### Changed

- chore: untracked build artifacts that had been committed under `reports/` (two exported workbooks, a PDF and `mutation/mutation.html`). `.gitignore` now ignores `reports/*` and whitelists only the runtime CJK font and `.gitkeep`, instead of listing per-extension rules — which is how those files slipped in.
- chore: removed `scripts/fix-max-followups.ts` and `MAX_FOLLOWUPS_FIX.md`, a one-off v1.8.0 data migration whose target migration directory no longer exists. Leaving a runnable script that rewrites production `maxFollowups` values was a latent hazard.
- test: added `tests/ccn-gate.test.ts` (8 cases) covering the complexity gate itself, including the two loop-nesting regressions above; both cases fail against the old implementation. `securityMiddleware` and `logSecurityEvent` gained coverage (11 cases), retiring two standing TODO comments that claimed they needed a full application to test.
- docs: corrected stale counts and anti-patterns in the knowledge bases — `AGENTS.md` claimed 82 source files / 139 tests / 18 services (actual 66 / 142 / 16), and `src/services/AGENTS.md` listed four anti-patterns that had already been fixed.

## [1.11.6](https://github.com/boyingliu01/dialog-survey/compare/v1.11.5...v1.11.6) (2026-10-20)

### Bug Fixes

- fix(dingtalk): `DingTalkClient.fromEnv()` read only `DINGTALK_APP_KEY`/`DINGTALK_APP_SECRET`, while the installer writes `DINGTALK_CLIENT_ID`/`DINGTALK_CLIENT_SECRET` (#197). On a default install every client request was signed with an empty appkey and `gettoken` failed with errcode 40035 — while `DingTalkTokenManager`, which did fall back, succeeded in the same process, so the two call sites silently disagreed about which env names exist. Both now resolve credentials through one `dingTalkCredentialsFromEnv()`, and adding a phone member works on the installer's env without aliasing the variables by hand.
- fix(members): phone+name verification never actually compared names (#199). `/topapi/v2/user/getbymobile` returns only a userid, so `getUserIdByMobile()` hard-coded `name: ''`, and `verifyPhoneToName()` treated an empty DingTalk name as "cannot verify → allow". Any name passed as long as the phone resolved. The lookup now resolves the real name via `user/get`, and an empty name is a refusal (`name_unverifiable`) rather than a silent pass. The CSV import path, which already called `user/get` itself, drops that now-redundant round-trip.
- fix(members): every DingTalk-side failure surfaced as the same "服务暂时不可用" with nothing in the logs (#198). Missing credentials (errcode 40035), insufficient contact scope (60011) and transport errors are now logged with the phone masked and returned with a `failure` class, so an operator can tell a configuration problem from an outage. `InvalidMemberInputError` carries that class through to the API response.

### Changed

- test: the two suites that guarded the bugs above asserted the buggy behaviour — `dingtalk-client-get-by-mobile` expected `name: ''` and `member-verification` expected an empty DingTalk name to pass. Both mocked a response shape the real client never produced, which is why they stayed green while the feature was broken in production. They now assert the real v2 response shape and a refusal.

## [1.11.5](https://github.com/boyingliu01/dialog-survey/compare/v1.11.4...v1.11.5) (2026-10-20)

### Changed

- build(quality): Gate 3 (complexity) was silently inert. `xp-gate` routes `lizard`'s CSV through `scripts/ccn-report.cjs` once `.ccn-baseline.json` exists, but neither file was in the repo, so the gate fell back to a flat threshold applied to *changed files only* — reporting `complexityWarnings:0` while grading nothing. Add both halves of that contract: `scripts/ccn-report.cjs` (brace-balanced CCN that corrects lizard's TypeScript span inflation, `--csv-verified`, `--write-baseline`) and `.ccn-baseline.json` (218 production functions) so existing complexity is protected by a ratchet rather than a frozen flat failure. `npm run complexity` reports, `npm run duplicates` runs jscpd at its intended 1% ceiling.
- refactor: duplication 1.38% → 0.38% via three helpers that were copied verbatim between layers — `summarizeStatusGroups` (4 copies), `buildQuestionMap` (3 copies), and a shared export select/findLatestReport for the PDF and Excel paths. Net −62% duplicated lines with no behaviour change.
- refactor: lower the hottest functions (brace-verified CCN): `OpenAICompatibleLLM.chat` 23 → 6 (posting separated from response mapping), the `plans.ts` CSV import handler 22 → 8 (row classification and upload validation lifted out of the route), `generateSmartResponse` 16 → 11 (two near-identical post-processing blocks collapsed into `resultFromParsed`). Smaller cleanups share `assertVersionMatches`, `finishWithReply`, a table-driven `isAdministrativePlanMutation`, and depth-based resolution in `app-version`.
- refactor: **no production function now exceeds CCN 8** (the highest is 8; 30 exceed 5). `routeAction` 9 → 6 via action sets and an extracted `enforceFollowupLimit`; `generateSmartResponse` 11 → 6 by extracting the prompt-variable and conversation-history builders plus `renderCustomPrompt`; the `interview-plan-members` inline phone callback 9 → 6 via `inviteesOf`/`findByPhone` (which also removes three copies of the same `Array.isArray` coercion); `interviewPlanRoutes` 15 → 4 by registering the pause/resume/cancel lifecycle endpoints through one `registerLifecyclePost`.
- fix(ccn-report): two measurement defects made the complexity report overstate a function's cost. `findBodyBrace` stopped at the first `{` after `function`, which is inside a `Promise<{ rows: CsvRow[] }>` return annotation — the real body then started mid-annotation and was never masked, so nested named helpers (`verifyRow`, `readImportRows`, `rejectUnimportablePlan`) had their branches charged to their enclosing function. Separately, stripping comments collapsed newlines and shifted every reported line number upward (a function on line 91 was reported on line 73); `stripNoise` now returns an offset table and locations resolve through it.

### Bug Fixes

- fix(core): `interviewingNode` advances `currentQuestion` by one when a NEXT on the final question completes the interview. Preserving this while factoring the two completion paths apart into a single `completeAt(nextIndex)` is exactly what `tests/core-nodes-branches.test.ts` caught during the refactor.

- build: `biome.json` now ignores `.sprint-archives/` and `.workbuddy/` (both gitignored). They accounted for 37 of the 39 errors a repo-wide `biome check .` reported, masking the one real import-order violation in `tests/openai-compatible.test.ts`.
- test: `smart-response.test.ts` asserted the follow-up cap by grepping the implementation source for a string, so it survived any refactor. It now tests the behaviour (a FOLLOWUP at the cap degrades to NEXT and carries the forced transition text).

## [1.11.4](https://github.com/boyingliu01/dialog-survey/compare/v1.11.3...v1.11.4) (2026-10-15)

### Bug Fixes

- fix(release): the version fan-out (`scripts/sync-version.cjs` / `.sh`) never listed `package-lock.json`, so `release-it`'s `after:bump` hook updated `VERSION`/`package.json`/`AGENTS.md` while the lock's self-referencing version silently drifted (found at 1.11.2 vs 1.11.3). Both lock version fields (root and the `packages` self-reference) are now synced, and the PR `version-consistency` job asserts the lock agrees with `package.json` so the drift is blocked at the merge boundary rather than discovered at release time.

### Changed

- build: `npm run build` now compiles through a dedicated `tsconfig.build.json` covering `src/**` only. `tsconfig.json` still includes `tests/**` so `tsc --noEmit` keeps type-checking the suite, but the emitted `dist/` no longer contains `dist/tests`. The published tarball drops from 965 to 372 files (‑61%); the runtime entry remains `dist/src/server-entry.js`, so the installer, PM2 config, `npm start` and the Dockerfile are unaffected. (An `.npmignore` exclusion does not work here: a directory listed in the `files` allowlist overrides `.npmignore` for its contents.)
- test: raise vitest timeouts (300s top-level describe) and harden afterAll/afterEach cleanup with 3x retry for the heavy shell-spawning suites (`release-script-behaviour`, `release-bootstrap`, `optin-hooks`) and the Playwright PDF-export e2e case (120s). On Windows machines whose antivirus scans every spawned process, node cold-start is ~1.26s and a bare `git status` 2-3.6s (20-40x slower than normal), so these suites' cases land at 12-64s — right at the 30s vitest default — and failed randomly only in full parallel runs. No behaviour change; fixes test flakiness on slow/AV-heavy hosts.

## [1.11.3](https://github.com/boyingliu01/dialog-survey/compare/v1.11.2...v1.11.3) (2026-10-13)

### Bug Fixes

- fix(cli): Windows direct start no longer hangs the installer — `startViaNode` spawns a detached child (output → `logs/server.log`, PID → `logs/server.pid`) instead of a shell background job, which cmd.exe treats as a sequential separator (#195 review)
- fix(cli): `pm2 start` now passes `--update-env` so an already-registered app refreshes its environment on upgrade; a plain restart silently keeps the stale (possibly secret-bearing) pre-#193 env
- fix(cli): installer preserves an existing `~/.dialog-survey/.env` on upgrade — regenerating it re-randomized `ENCRYPTION_KEY`/`SESSION_SECRET`/`ADMIN_API_KEY` and destroyed stored encrypted data and live sessions (#195 review)
- fix(cli): single source of truth for secret env keys (`isSecretEnvKey`): the child-env scrub and the dump.pm2 leak scan derive from one list, extended with operator credentials (`PGPASSWORD`, `AWS_SECRET_ACCESS_KEY`, `*_TOKEN`, …) and key-name detection in dump.pm2 (#193/#195 review)
- fix(cli): `deploy.sh` boots `dist/src/server-entry.js` everywhere (bare `server.js` never self-starts under some runners, #187) and unsets secret exports before `pm2 start --update-env`; `log_warn` is no longer called before it is defined
- fix(cli): direct-service stop/status now work on Windows via the pidfile (`taskkill`), instead of relying on POSIX-only `pkill`/`pgrep`

### Changed

- docs: both READMEs state precisely when the PM2 environment is refreshed (`--update-env`) and that a plain `pm2 restart` keeps the stale env (#193)
- test: deployment-doc guard collects guarded files dynamically (top-level md, docs/, scripts/*.sh, compose/Dockerfile) instead of a hardcoded whitelist; PM2 dump checks honor `PM2_HOME`, accept 0400, strip single-quoted .env values

### Upgrade notes

- `verifyInstallation` (used by `start`/`status`) now also requires `scripts/cli.mjs` and `VERSION`. Installs made before the #195 packaging fix will report them missing — re-run `npx dialog-survey install` to repair; the existing `.env` is preserved and no secrets are re-randomized.

## [1.11.2](https://github.com/boyingliu01/dialog-survey/compare/v1.11.1...v1.11.2) (2026-10-10)

## [1.11.1](https://github.com/boyingliu01/dialog-survey/compare/v1.11.0...v1.11.1) (2026-10-10)

### Bug Fixes

* address deployment and installer issues ([#186](https://github.com/boyingliu01/dialog-survey/issues/186)-[#192](https://github.com/boyingliu01/dialog-survey/issues/192)) ([a6ff006](https://github.com/boyingliu01/dialog-survey/commit/a6ff006a985ad147b6cf2271e38a79f86420537b)), closes [#183](https://github.com/boyingliu01/dialog-survey/issues/183)

## 1.10.0 - 2026-09-30

### Changed
- chore: upgrade Prisma 6 → 7 with driver adapters (#149)
  - `prisma` / `@prisma/client` / `@prisma/adapter-pg` pinned to 7.10.0; client generated as TypeScript source into `src/generated/prisma` (gitignored, excluded from biome/vitest coverage)
  - `src/utils/prisma-client.ts` facade (pure re-export) + `src/utils/prisma-factory.ts` factory (`createPrismaClient()`, sole `new PrismaClient()` site, 5s connect timeout, fails loudly when `DATABASE_URL` is missing)
  - Node.js requirement raised to `>= 20.19.0` (engines, `.nvmrc`, CLI/deploy checks, CI `node-version-file`)

### Added
- test: PostgreSQL-free test suite via PGlite (per-file isolated WASM database, schema DDL + data-dir caches under `node_modules/.cache/dialog-survey/`)
- test: `tests/prisma7-spec-invariants.test.ts` pins REQ-PRISMA7-001..006 acceptance clauses as committed invariants (dependency pins, CI generate-before-consumer ordering via step-scoped `run:` parsing, release-chain file lists, spike criteria wiring, toolchain exclusions), including the PGlite template fast-path failure semantics
- fix(test): a corrupt PGlite template cache is now invalidated from both disk and the in-process memo on load failure (previously the discarded Blob stayed memoized and was served to later callers); degradation is observable via `getTemplateHealth()`
- ci: `npx prisma generate` step in all PR jobs (generated client is not committed)
- docs: architecture.yaml declares the generated layer and utils dependency; AGENTS.md / README / README.zh-CN / DEPLOY / Windows setup guide refreshed for Prisma 7

### Fixed
- fix(release): Docker runner image ships `public/` and `prisma.config.ts`; CLI/deploy Node versions aligned to 20.19; `prisma db push` pinned with `PRISMA_SKIP_GENERATE=1`; healthcheck covers the full boot path

## 1.8.9 - 2026-07-29

### Added
- E2E test coverage for admin CRUD, plan lifecycle, member management, and report viewing

## 1.8.7 - 2026-07-28

### Fixed
- fix: add CSRF protection to admin login form (#156)
  - Added `_csrf` hidden input to `login.njk` and pass `csrfToken` in all admin-auth views
- fix: correct tree panel selector in plan-form.njk (#155)
  - Changed `#tree-panel` to `aside` selector for HTMX tree refresh

### Added
- test: add E2E tests for admin authentication (13 tests: login, CSRF, session, logout, API Key)
- test: add E2E tests for admin tree refresh after plan creation (2 tests)
- test: add unit tests for login CSRF (2 tests) and plan-form tree target selector (2 tests)

### Changed
- Configured E2E test server with `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` environment variables

## 1.8.6 - 2026-07-12

### Changed
- feat: strengthen "one question per turn" rule with self-check and negative/positive examples
  - Added 🚨 iron rule marker to prompt with explicit counting instruction (count question marks, must be ≤1)
  - Added negative example showing wrong behavior (5 questions in one turn)
  - Added positive example showing correct behavior (1 question with two angles)
  - `thinking` field now includes self-check: "自检：我的response中是否只包含一个问题？（计数问号数量，必须≤1）"
  - Follow-up to v1.8.3/1.8.4 prompt engineering improvements

## 1.8.5 - 2026-07-09

### Changed
- chore: eliminate all `noExplicitAny` biome lint warnings across 25 test files
  - Replaced `any` type assertions with proper typed casts (`as unknown as PrismaClient`, `as unknown as LLMService`, etc.)
  - Added inline type definitions for PrismaClient mocks
  - Typed transaction callback signatures
  - Result: 0 `noExplicitAny` warnings in entire codebase (src/ + tests/)

## 1.8.4 - 2026-07-09

### Fixed
- fix: revert stripExtraQuestions() post-processing, trust LLM response instead
  - The aggressive question-stripping logic was cutting off valid follow-up content
  - Example: "能否请您再补充以下几个方面？1. ... 2. ... 3. ..." was truncated at the first "?"
  - Now relying on prompt engineering ("one question per turn" rule) to guide LLM behavior
  - stripExtraQuestions() function retained as utility for potential future use

## 1.8.3 - 2026-07-09

### Fixed
- fix: enforce one-question-per-turn rule in interview dialog (#148)
  - Root cause: LLM prompt did not explicitly forbid multiple questions per turn, and no post-processing existed to strip extra questions
  - Added explicit "one question per turn" rule to generateSmartResponse prompt
  - Added guidance to provide reference info as statements, not questions
  - Added stripExtraQuestions() function to detect and strip extra questions from LLM responses
  - Supports both Chinese (？) and English (?) question marks

## 1.8.2 - 2026-07-09

### Fixed
- fix: enforce maxFollowups=5 across all interview creation paths
  - Root cause: Interview creation endpoints did not explicitly set `maxFollowups`, relying on database default
  - When schema default changed from 2 to 5 in v1.8.0, existing records and some creation paths still used old value
  - Explicitly set `maxFollowups=5` in all interview creation paths (plans API, member service, state repository)
  - Updated PostgreSQL column default constraint to 5
  - Updated 8 existing interview records from maxFollowups=2 to 5
  - Added fix script for future reference

## 1.9.0 - 2026-07-09

### Added
- feat: re-analyze button on both admin and public report detail pages with real-time timer and toast feedback
- feat: invitee name/phone display in PDF export and report detail pages (loaded from InterviewPlan)
- feat: custom `.report-content` CSS styles to fix markdown rendering without `@tailwindcss/typography` dependency
- feat: delete old reports before re-analysis to ensure idempotency (one report per interview)

### Changed
- refactor: redesigned analysis summary card — gradient indigo→purple header with AI-generated badge, 3-column card grid (sentiment / keyFindings / recommendations) with emoji icons
- refactor: PDF export now shows full dialog history (role-labeled bubbles) instead of flat response table
- refactor: improved `generateReport` prompt with structured output requirements (overview, findings, sentiment, pain points, recommendations, highlights)
- refactor: `cleanText()` and `isTableOrFormatting()` helpers to strip raw markdown/HTML from keyFindings and recommendations extraction
- refactor: `report.service.ts` uses `error()` instead of `info()` for LLM failures, adds `usedLLM` flag, checks for empty LLM responses

### Fixed
- fix: sentiment displayed in Chinese (积极/中性/消极) and with emoji icon on report detail pages
- fix: health API tests now set `LLM_MODEL=test-model` to avoid config-dependent failures

## 1.8.1 - 2026-07-08

### Changed
- docs: full project doc refresh — root AGENTS.md compressed 597→88 lines, 3 new subdir AGENTS.md (repositories/integrations/utils), all stats synced to v1.8.0 reality

## 1.8.0 - 2026-07-07

### Removed
- remove: ASR/Fun-ASR voice recognition — no actual use case (钉钉不支持语音消息), fully stripped from code, schema, tests, and docs

### Fixed
- fix: COMPLETED interviews stuck in CONTINUE loop (Rule 2 evaluation missing for COMPLETED status in interviewing node)
- fix: FINISH/COMPLETE → END transition (follow-up engine marks interview as COMPLETED when end signal received)
- fix: maxFollowups cap not persisted to DB (schema default=5 + repository handles full/partial/empty updates)
- fix: add-member modal silently swallows errors (htmx.ajax `.then()` fires on non-2xx with `undefined` arg — replaced with sync XHR)

### Changed
- refactor: stream-message service uses `_runWithTimer` naming for internal methods
- docs: AGENTS.md — API bug triage principles (curl-first isolate, read code, console.log, minimize verification)

## 1.7.9 - 2026-07-07

- fix: redact real DINGTALK_CLIENT_SECRET from .speckit/specify.md and DEPLOY.md
- fix: replace sample placeholders with <YOUR_...> to reduce gitleaks noise
- fix: flaky template-repository integration test (parallel DB race → use existence checks)
- chore: delete stale .env.bak

## 1.7.8 - 2026-07-06

- feat: unified tsconfig.json — single `npx tsc --noEmit` checks src/ + tests/
- fix: 81 tsc errors across 35 files (TS2741, TS4111, TS2375, TS2348, TS6133)
- fix: noPropertyAccessFromIndexSignature process.env access (37 sites)
- fix: exactOptionalPropertyTypes violations (10 sites)
- fix: build artifacts path sync — dist/server.js → dist/src/server.js
- ci: TypeScript type check in pr.yml uses single `npx tsc --noEmit`
- chore: npm run dev now references dist/src/server.js

## 1.7.7 - 2026-07-06

- fix: biome lint issues across tests/ (unused imports, import sorting, formatting)
- fix: flaky interview-flow E2E race condition (retry findFirst with backoff)
- fix: pre-commit hook now runs Biome check when biome.json exists (xp-gate PR #291)

## 1.7.6 - 2026-07-06

- fix: admin UI broken — Alpine.js CDN unreachable (jsdelivr ERR_CONNECTION_CLOSED)
- fix: register @fastify/static for public/ so local JS assets serve correctly
- fix: followup-branches test — add nextQuestion param to generateSmartResponse calls
- e2e: add Static Assets test suite — verify local JS/CDN security

## 1.7.5 - 2026-07-06

- fix: #131 — LLM NEXT transition now sees next question, generates natural transition
- fix: interview COMPLETED status no longer overwritten by ACTIVE (root cause of 2 bugs)
- fix: NEXT response only returns LLM text, no longer appends duplicate next question
- feat: add nextQuestion flag to LLM prompt for coherent topic transitions
- chore: gitignore xp-gate/quality-status/ and .quality-history.jsonl

## 1.7.4 - 2026-07-06

- feat: add PR quality gates CI (6 gates: static-analysis, unit, integration, security, coverage, smoke)
- feat: add Playwright E2E admin core tests (health, navigation, Templates CRUD, page rendering)
- feat: add `npm run smoke` pre-acceptance command (~8s)
- test: fix Zod validation tests — expect 400 instead of 500
- test: add E2E test framework (helpers: e2e-server, mock-dingtalk, mock-llm)
- style: apply Biome format to src/ and tests/
- docs: update AGENTS.md with CI/E2E/smoke documentation
- chore: update Biome config, package.json files field, enable test parallelism

## 1.7.3 - 2026-07-01

- feat: 管理后台支持从 JSON 导入模板 (#136)
- feat: 模板区域添加导入按钮，支持粘贴 JSON 导入模板
- fix: stub DingTalk env vars in CI tests to prevent buildApp failure
- test: 新增模板导入测试（+8 tests）

## 1.7.2 - 2026-07-01

- fix: renderPdfHtml() 嵌入 NotoSansCJKsc-Regular.otf base64 字体修复 PDF 中文乱码
- fix: exportInterviewToExcel() join template.content.questions 映射实际问题文本
- fix: sendInvitations() 添加跨计划活跃访谈检查，防止重复发送邀请
- test: 新增字体渲染、问题文本映射、去重 guard 测试（+5 tests）

## 1.7.0 - 2026-07-01

- feat: batch CSV import for interviewees (import-preview + import-commit endpoints)
- feat: getUserByUserId() DingTalk API for name lookup (getByMobile returns empty name)
- feat: CSV parsing with BOM + GBK encoding + Chinese column headers
- feat: cross-plan duplicate check in addMember
- fix: rewrite graph.ts to resolve node branching ambiguity
- fix: InterviewPlanService DI from server.ts (previously lost streamClient/tokenManager)
- fix: stream-client robotCode configuration + message-sending branches
- fix: addMember cross-plan duplicate prevention
- test: batch-import integration tests (11 tests)
- test: interview-plan-members-phone real DB integration tests
- deps: @fastify/multipart + csv-parse + iconv-lite

## 1.6.20 - 2026-06-26

- fix: stub LLM_API_KEY in health-api test alongside VOLCENGINE_API_KEY (CI clears both)

## 1.6.19 - 2026-06-26

- fix: mock polishFirstQuestion in planning-node tests to remove LLM API dependency in CI
- fix: add LLM env vars to CI workflow test step

## 1.6.18 - 2026-06-26

- refactor: remove dead code from interview-plan services (parseInviteeText, importInvitees, phone verification)
- chore: create GitHub issues #131-#134 for 4 interview bugs found in testing

## 1.6.17 - 2026-06-26

- test: add regression tests for add member Zod error handling

## 1.6.16 - 2026-06-26

- fix: add member error handling — surface Zod validation and service errors in frontend


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.15] - 2026-06-25

### Fixed
- **访谈流程 STAY 语义冲突修复 (Delphi 4 轮评审)**: 跨三层（LLM prompt → service → handler）的 STAY 语义冲突导致"同时带出下一题"和"重复回答恶化"。
  - Fix A: customPrompt fallback 对齐 `isLastQuestion`，最后一题返回 END+closing
  - Fix B: STAY handler 恢复原始语义——不推进 currentQuestion，返回 LLM 引导文本，重置 followupCount
  - Fix C: 从 LLM prompt 模板移除 STAY 选项，只保留 NEXT/FOLLOWUP/END
  - Fix D: 所有非 FOLLOWUP 路径添加 `followupCount: 0`，修复跨题目累计 bug

## [1.6.14] - 2026-06-24

### Fixed
- **#104: 访谈流程 4 处问题**: 修复最后一题闭场消息重复输出（handleSmartResult 和 interviewingNode 各自追加 closing 导致重复）；修复 lastQuestion 判断条件向 handleSmartResult 传递后丢失 `nextQuestion`/`currentQ+1`；修复 planningNode 打招呼消息缺少直接意图信号（在 vague 模板铭文前自动插入清晰声明）
- **#105: DELETE 请求携带 `Content-Type: application/json` 导致 empty body 错误**: `plan-detail.njk` 删除计划和删除成员请求移除多余的 `Content-Type` header；`template-info.njk` 补漏 `X-Admin-Key` header，使模板删除按钮在 Windows 部署下正常通过鉴权

## [1.6.13] - 2026-06-23

### Fixed
- **#100: DingTalk API v2 升级**: `getUserIdByMobile()` 从已废弃的 `/contact/user/get_by_mobile` (GET) 迁移到 `/contact/v2/user/getbymobile` (POST with body)
- **#101: 管理后台 plan-detail 缺少 auth headers**: 删除计划、添加成员、提醒成员请求新增 `Content-Type: application/json` 和 `X-Admin-Key` header 发送，修复 Windows 部署后的 401 错误
- **#102: 管理后台 plan-detail UI 修复**: 取消添加成员时清除表单字段；删除计划成功后通过 htmx.ajax 刷新而非替换为响应 HTML
- **#103: updatePlan() 不传 DingTalkClient**: `InterviewPlanService.updatePlan()` 重载基类方法，自动注入 `this.dingTalkClient`；`importInvitees()` 增加 `DingTalkClient.fromEnv()` 回退

## [1.6.12] - 2026-06-23

### Fixed
- **CSP 阻止管理后台 CDN 资源**: 修复 Windows 部署后 `/admin` 页面 Tailwind CSS 和 Alpine.js 被 CSP 拦截的问题。`script-src` 新增 `'unsafe-eval'` (Alpine.js CDN 使用 `eval()`)、`https://cdn.tailwindcss.com`、`https://cdn.jsdelivr.net`；`style-src` 新增 `https://cdn.tailwindcss.com`

## [1.6.11] - 2026-06-23

### Added
- **Repository 集成测试**: 新增 `tests/interview-repository.test.ts` (8 测试)，覆盖 InterviewRepository 全部 4 个方法 (countByStatusForTemplate, findByPlanId, findByIdForReport, findByIdForReportPage)
- **安全加固**: 安装 `@fastify/rate-limit` v11.0.0 (100 req/min，测试环境跳过) + CSP 响应头 (script-src/style-src/img-src/font-src/connect-src)
- **Core 测试深度**: 新增 14 个测试用例覆盖 interviewingNode (handleSmartResult 4 分支，错误 fallback，闭场消息)、graph (PENDING/CANCELLED 路由，空内容) 和 analyzingNode (状态字段保留)

### Changed
- **TypeScript strict 增强**: 启用 `exactOptionalPropertyTypes` + `noPropertyAccessFromIndexSignature` (修复 119 处类型错误：95 处 bracket notation + 24 处 spread 守卫)

## [1.6.10] - 2026-06-22

### Maintenance
- **删除 ESLint/Prettier 冗余依赖**: 移除 7 个已由 Biome 覆盖的 devDependencies (eslint, prettier, eslint-config-prettier, eslint-plugin-prettier, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, eslint-plugin-unused-imports) — 删除 `.eslintrc.json`
- **修复 `.env.example` 文档**: 去重 3 处重复变量，新增 `LLM_BASE_URL`/`REPORTS_DIR`，删除 4 个废弃变量 (`PUBLIC_URL`/`OAUTH_APP_KEY`/`OAUTH_APP_SECRET`/`API_KEY`)
- **修复 HTMX shell URL 违规**: `template-new.njk` 的 `hx-get="/admin"` 改为 `/admin/content/dashboard`
- **删除未使用的 DDD 层**: 移除 `src/domains/` 下 4 个文件 (interview.entity.ts, message.entity.ts, response.entity.ts, interview.domain.ts) — 项目已迁移至 Repository 模式
- **CI 安全加固**: `publish.yml` 硬编码密码替换为 GitHub Secrets (`${{ secrets.POSTGRES_PASSWORD }}`, `${{ secrets.DATABASE_URL }}`)
- **AGENTS.md 更新**: 删除已移除的 `src/domains/index.ts` 引用，同步测试统计至 887 tests / 76 files

### Quality
- 887 tests pass (76 test files), Biome lint clean, `tsc --noEmit` clean
- 版本: 1.6.10

## [1.6.8] - 2026-06-18

### Added
- **跨平台进程管理**: CLI 安装/启动/停止/状态检测根据操作系统自动选择 PM2 (Linux) 或直接 `node` (Windows) — **Closes #88, #89**
- **`checkPlatformDeps()`**: 平台感知的依赖检查 — Linux 检查 pm2，Windows 检查 tsc (TypeScript compiler)
- **Windows 直接启动支持**: 新增 `startViaNode()` / `stopDirectService()` / `isDirectServiceRunning()` 辅助函数
- **`deploy.sh` 平台感知**: 增加 Windows 检测和对应启动路径

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.7] - 2026-06-18

### Fixed
- **PM2 启动失败（Windows）**: `ecosystem.config.cjs` 引用 `dist/src/server.js`，但 tsconfig 编译输出为 `dist/server.js`（无 `src/` 子目录） — **Closes #87**
- **加密密钥生成跨平台兼容**: 移除 `node -e` shell 子命令，改用 `node:crypto` 直接生成 `ENCRYPTION_KEY` 和 `ADMIN_API_KEY`，避免 Windows `cmd.exe` 嵌套引号转义问题

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.6] - 2026-06-18

### Fixed
- **CLI 安装 build 失败（Windows）**: `npm install --omit=dev` 跳过 devDependencies，但后续 `npm run build` 需要 `typescript`（在 devDependencies 中）。`dist/` 已预编译在 npm 包中，删除多余的 build 步骤 — **Closes #86**

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.5] - 2026-06-18

### Fixed
- **CLI 安装 `npm ci` 失败**: `npm ci` 需要 `package-lock.json`，但 npm 设计上从不将 lock 文件包含在发布的包中。改用 `npm install --omit=dev`，自动从 `package.json` 生成 lock 文件 — **Closes #85**

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.4] - 2026-06-18

### Fixed
- **npm 包缺少 package-lock.json**: `package.json` 的 `files` 字段新增 `package-lock.json`（无效修复，npm 设计上不包含 lock 文件）

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.3] - 2026-06-18

### Fixed
- **CLI 安装崩溃最终修复**: `isMain` 检测完全移除 `import.meta.resolve() + fileURLToPath()` 链，改用纯 path-based 后缀匹配，彻底解决 Node.js v26 上的 `ERR_INVALID_URL_SCHEME` 崩溃 — **Closes #84**
- **Windows `checkPostgres` TCP 修复**: `net.Socket` 连接未清理 socket 句柄的潜在泄漏

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.2] - 2026-06-18

### Fixed
- **Node.js v26 `import.meta.resolve` 崩溃修复**: `isMain` 检测改用 `process.argv[1]`，兼容 Node.js 26 — **Closes #84**
- **Windows `pg_isready` 不可用修复**: CLI 和部署脚本中的 `pg_isready` 检查替换为 `net.Socket` TCP 端口检测 — **Closes #84**

### Quality
- 828 tests pass (75 test files), Biome lint clean, `tsc --noEmit` clean

## [1.6.1] - 2026-06-18

### Fixed
- **Admin API Key 认证修复**: 模块级 `ADMIN_API_KEY` 常量改为函数调用，解决 ESM import 时序导致认证失败的问题 — **Closes #78**
- **手机号格式修复**: `normalizePhone()` 增强，支持 `+86-xxx`、`86-xxx`、带空格等变体格式；移除前端 `maxlength="11"` 限制；添加格式提示和规范化后校验 — **Closes #80**

### Quality
- 验证：TypeScript 编译干净，Biome lint 干净

## [1.6.0] - 2026-06-18

### Added
- **计划进度看板**: 新增 Dashboard 页面，按计划状态分栏（进行中、待发送、已完成、已取消），实时查看各计划进度 — **Closes #76**
- **PDF/Excel 报告导出**: Interview 报告详情页支持一键导出 PDF（Playwright 渲染）和 Excel（xlsx 库） — **Closes #75**

### Changed
- **AGENTS.md 清理**: 修复 TODO 行号引用，更新项目文档到 v1.1.1 — **Closes #77**
- VERSION bumped to 1.6.0

### Quality
- 670 tests pass (59 test files, 100 pre-existing DB test failures, 58 skipped), Biome lint clean, `tsc --noEmit` clean

## [1.5.2] - 2026-06-18

### Fixed
- **CI 测试修复**: `tests/plans-api.test.ts` 添加 `vi.stubEnv('ADMIN_API_KEY')`，解决 CI 环境中因缺少 `.env` 文件导致 adminAuth 中间件返回 500 而非 401 的问题 — **Closes #71**
- 移除 `debug-tests.yml` 调试工作流

### Quality
- 818 tests pass (74 test files), Biome lint clean, `tsc --noEmit` clean

## [1.5.1] - 2026-06-18

### Fixed
- **DingTalk 报错信息屏蔽**: `addMember()` 中 DingTalk 原始错误码不再暴露给用户，替换为友好的 `MemberNotFoundError` 提示 — **Closes #71**
- **手机号输入优化**: 添加成员表单手机号输入框增加 `inputmode="tel"` 和 `maxlength="11"`，移动端键盘优化 — **Closes #71**
- **自定义 host 绑定**: `server.ts` 支持 `HOST` 环境变量，解决 WSL2 环境下 localhost 端口被 Windows 进程占用的问题 — **Closes #71**

### Quality
- 818 tests pass (74 test files), Biome lint clean, `tsc --noEmit` clean

## [1.5.0] - 2026-06-17

### Added
- **手机号添加访谈成员**: 支持手机号格式导入和添加访谈计划成员，通过钉钉 API 自动解析手机号为 userId。导入文本、更新计划、添加成员表单均支持手机号输入 — **Closes #68**

### Quality
- 91 tests pass across 4 related test files, Biome lint clean, `tsc --noEmit` clean
- New tests: 10 unit tests (parseInviteeText phone detection, importInvitees resolution, updatePlan resolution)

## [1.4.0] - 2026-06-17

### Added
- **新建模板表单补充 closingMessage 和 llmPromptTemplate 字段**: 新建模板界面现在与编辑界面字段一致，包含「结束语」和「智能提示词模板」两个字段 — **Closes #66**
- **模板表单字段帮助说明**: 新建/编辑模板界面中，为名称、描述、邀约提示词、结束语、智能提示词模板等字段添加用途说明和使用示例 — **Closes #67**

### Quality
- 808 tests pass (74 test files), Biome lint clean, `tsc --noEmit` clean
- New tests: 2 integration tests for closingMessage/llmPromptTemplate field store and render

## [1.3.0] - 2026-06-17

### Added
- **X-Admin-Key header authentication**: admin UI HTMX requests now authenticate via `X-Admin-Key` header (matching `ADMIN_API_KEY` env var) without requiring a database API key lookup — **Closes #69**

### Changed
- **VolcengineLLM → OpenAICompatibleLLM**: renamed class and file (`volcengine.ts` → `openai-compatible.ts`) to accurately reflect that it works with any OpenAI-compatible service, not just Volcengine — **Closes #71**
- **LLM baseUrl is now the full endpoint URL**: `LLM_BASE_URL`/`VOLCENGINE_BASE_URL` must be the complete `/v1/chat/completions` URL (e.g. `https://ark.cn-beijing.volces.com/api/coding/v1/chat/completions`). The hardcoded `/v1/chat/completions` path suffix has been removed from the LLM service and health check — **Closes #72**
- **`.env.example`**: updated with full endpoint URL format documentation

### Fixed
- **followup-branches test mock**: updated `vi.mock()` path from `volcengine.js` → `openai-compatible.js` after module rename — 5 silent test failures fixed
- **analysis.service.ts indentation**: Biome format fix for renamed import alignment

### Quality
- 806 tests pass (74 test files), `tsc --noEmit` clean, Biome lint clean
- QA: end-to-end acceptance tested — health endpoint, auth, LLM integration all verified

## [1.2.0] - 2026-06-17

### Added
- **CLI `install` command now creates views/public directory** if missing — prevents ENOENT on fresh installs — **Closes #65**
- **`package.json` `files` field** — explicit npm publish allowlist (dist/, scripts/, templates/, CHANGELOG.md, README.md, DEPLOY.md, .npmignore) — **Closes #65**
- **Windows path compatibility for server startup**: `normalize()` + `pathToFileURL()` for ESM entry check — **Closes #63**
- **Coverage target**: `vitest.config.ts` now excludes scripts/ and src/server.ts from coverage thresholds (these are entry points, not testable modules) — **Closes #61**

### Changed
- **`engines.node`**: `>=20.0.0 <26.0.0` → `>=20.0.0` (upper bound is speculative and not enforced by npm) — **Closes #64**
- **`LLM` env vars**: downgraded from `required` to `optional` in CLI install — local LLM users should not need an API key — **Closes #65**
- **README.md / DEPLOY.md**: svelte documentation for clarity and maintainability — **Closes #65**

### Fixed
- **CLI install LLM env names**: `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL` → `LLM_API_KEY`/`LLM_BASE_URL` (project uses OpenAI-compatible API, not vendor-specific DashScope) — **Closes #65**

### Performance
- **token-manager.test.ts**: mock `delay` to bypass 6000ms real timeout → instant — saves ~6s per test run
- **retry.test.ts**: reduce `initialDelayMs` from 100→5 and 1000→20 — saves ~1s per test run
- **stream-client-branches.test.ts**: remove blind `await setTimeout()` on non-retry paths — saves ~4s per test run
- **batch-aggregation.test.ts**: reduce `setTimeout` 100→5 — saves ~0.4s per test run

### Quality
- 809 tests pass (74 test files), coverage thresholds met (lines 87.65%, branches 74.91%, functions 92.63%)
- Architecture reviewer: accepted current optimization level, stop further tuning

## [1.1.1] - 2026-06-17

### Changed
- **Complete project rename cleanup**: Finalize rename from `interview-bot` to `dialog-survey` across all configuration files
  - Database names: `interview_bot` → `dialog_survey` in `.env.example`, `.env.production.example`, `docker-compose.yml`
  - CI/CD: Update test database name in `.github/workflows/publish.yml`
  - Documentation: Update all references in `README.md`, `DEPLOY.md`, `docs/setup-guide.md`
  - Config files: Update `.gitleaks.toml` title, GitHub URLs in `package.json` and `vitest.config.ts`

### Quality
- All 775 tests pass after rename
- TypeScript type-check and Biome lint pass
- Pre-commit quality gates: 8.0/10 score

## [1.1.0] - 2026-06-16

### Added
- **CLI for npx-based install**: `npx dialog-survey install/uninstall/start/stop/status/help` — zero external dependencies, interactive + non-interactive modes, PM2 integration, health check polling
- **npm publish pipeline**: `.npmignore` + GitHub Actions workflow for automated publishing on `v*` tags
- **25 CLI unit tests**: parseArgs, config generation, prerequisite checks, command routing

### Changed
- **Project renamed**: `interview-bot` → `dialog-survey` (npm package name, PM2 app name, Docker container names, all references)
- **Version bump**: 1.0.4 → 1.1.0

### Fixed
- **Windows CJK path ESM entry check**: `pathToFileURL(normalize(process.argv[1])).href` comparison — fixes server startup failure on Windows with Chinese characters in path — **Fixes #59-5**
- **System DATABASE_URL overrides .env**: `dotenv.config({ override: process.env.NODE_ENV !== 'test' })` — conditional override preserves test isolation via `vi.stubEnv()` — **Fixes #59-2**
- **Prisma generate file lock**: deploy.sh now stops service BEFORE `npm ci` to prevent DLL lock — **Fixes #59-3**
- **Windows colon filenames**: `.delphi/` added to `.gitignore`, removed from git tracking — **Fixes #59-1**
- **npm audit vulnerabilities**: all dependencies updated, 0 vulnerabilities — **Fixes #59-4**

### Quality
- 9 atomic commits on `sprint/2026-06-16-01`
- Code walkthrough review: APPROVED (2 blocking issues caught and fixed)
- Test-specification alignment: 91.3% (21/23 acceptance criteria fully covered)
- Quality gates: 8-10/10 across all commits
- 622 unit tests pass (95 integration tests blocked by PostgreSQL env — not code regression)

## [1.0.4] - 2026-06-16

### Added
- Phone member support: add members via phone number, auto-resolve to DingTalk userId — **Closes #54**
- DingTalk `getUserIdByMobile()` API client with token caching and PII masking (`138****1234`)
- Docker deployment: multi-stage Dockerfile + docker-compose.yml (PG16 + app) — **Closes #53**
- 12 phone-specific tests + 7 dingtalk mobile lookup tests

### Quality
- Pre-commit hook: Score 10.0/10, all 9 gates passed
- Full regression: 73 files / 750 tests pass, `tsc --noEmit` clean

## [1.0.3] - 2026-06-15

### Fixed
- Fix lint errors: remove redundant type annotation in `audit-cleanup.service.ts` (`noInferrableTypes`)
- Fix lint errors: replace `as any` with `as Record<string, unknown>` in `template.repository.ts` (`noExplicitAny`)
- Run full regression: 71 files / 731 tests pass, `biome lint src` clean

## [1.0.2] - 2026-06-14

### Security
- Redact DINGTALK_CLIENT_SECRET from `.omo/` and `.sisyphus/` plan docs
- Add `.gitleaks.toml` for pre-commit secret scanning (Gate 8)
- Replace side-effect `import 'dotenv/config'` with explicit `dotenv.config()`
- Add `.omo/` and `.sisyphus/` to `.gitignore` to prevent future secret leaks
- Add npm `overrides` for `qs@6.15.2` to resolve moderate vulnerability (GHSA-q8mj-m7cp-5q26)

### Fixed
- Fix `server-api.test.ts` and `admin-tree.test.ts`: `buildApp()` now returns `{fastify, prisma}` — use `result.fastify.inject` instead of `app.inject`
- Export `checkDatabaseConnection` from `src/server.ts` for test access
- Fix `dingtalk-services.test.ts`: update file-existence tests for refactored modules
- Fix `security.test.ts`: mock `apiKey.findFirst` instead of `auditLog.findFirst`
- Fix `health-api.test.ts`: align DingTalk env var checks with Stream mode
- Add `postinstall` script for Prisma Client auto-generation - **Fixes #48**
- Remove deprecated webhook module (replaced by DingTalk Stream mode) - **Fixes #43**
- Add `await prisma.$disconnect()` to graceful shutdown - **Fixes #41**
- Add AuditLog TTL (expiresAt + @@index), cleanup service, and daily cron at 2:00 AM - **Fixes #42**
- Reduce AuditLog verbosity: only log mutations (POST/PUT/DELETE) and admin paths
- Close false-positive env-config issue (#45): DingTalk Stream mode already handles this

### Quality
- Pre-commit hook: Score 10.0/10, all 9 gates passed
- TDD: audit-cleanup service had tests written before implementation

## [1.0.1] - 2026-06-13

### Fixed
- Extract `formatTemplateResponse` helper in `src/api/templates.ts` (DRY principle)
- Extract `_loadStateWithMessages` private method in `src/repositories/interview-state.repository.ts` (eliminate code duplication)
- Extract `_buildUpdateData` private method in `src/repositories/template.repository.ts` (eliminate code duplication)
- Fix empty catch block in `src/services/interview-plan-send.service.ts` (add warn logging instead of silent suppression) - **Fixes #40**
- Fix test assertions: void expression checks in `tests/dingtalk-signature.test.ts`
- Fix missing imports and mock types in `tests/admin-templates.test.ts`
- Fix undefined access using optional chaining in `tests/interviewing-node.test.ts`
- Add missing InterviewState fields in `tests/state-persistence.test.ts`
- Replace `jest.Mock` with vitest Mock type in `tests/dingtalk-stream.test.ts` - **Fixes #44**
- Update AGENTS.md: document third-party library exclusion rule for architecture checks (public/js/*.min.js, node_modules/)

### Quality
- Pre-commit hook: Score 10.0/10, all 9 gates passed
- Resolved Gate 6 Architecture Code Clone warnings for source files
