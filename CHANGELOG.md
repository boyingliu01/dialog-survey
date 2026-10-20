# Changelog

## Unreleased

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
