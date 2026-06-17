# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

