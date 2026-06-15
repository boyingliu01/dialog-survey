# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

