# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

