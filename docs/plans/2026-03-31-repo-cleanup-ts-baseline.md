# Repo Cleanup & TS Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a clean TypeScript-only codebase by segregating legacy Python code, removing duplicate/half-finished TS implementations, and keeping the current TS/Prisma baseline ready for further development.

**Architecture:** Keep the TS project rooted at repo root (src, 	ests, Prisma, Fastify). Move all Python source/tests to legacy-python/ for reference. Remove src-clean/	ests-clean duplicates and stale configs to reduce confusion.

**Tech Stack:** Node 20+, TypeScript 5, Fastify, Prisma, Vitest, Zod, ws, Pino.

---

### Task 1: Establish working baseline

**Files:**
- Inspect only: package.json, 	sconfig.json, 	sconfig.test.json

**Step 1: Record git status**

Run: git status --short
Expected: shows only current untracked/modified files (ignore permission warning).

**Step 2: Verify Node/PNPM toolchain presence**

Run: 
ode -v
Expected: v20+.

### Task 2: Create legacy Python archive

**Files:**
- Move: src/**/*.py, src/**/__pycache__, 	ests/**/*.py, lembic/, equirements.txt, lembic.ini, Dockerfile (python), docker-compose.yml (python), docs/design/** (if python-specific), server.log, stream.py
- Create: legacy-python/

**Step 1: Create legacy folder**

Run: mkdir legacy-python
Expected: directory exists.

**Step 2: Move Python source**

Run: mkdir legacy-python/src; mkdir legacy-python/tests; mkdir legacy-python/alembic
Run: Get-ChildItem src -Filter *.py -Recurse | Move-Item -Destination legacy-python/src
Run: Get-ChildItem tests -Filter *.py -Recurse | Move-Item -Destination legacy-python/tests
Run: Move-Item alembic legacy-python/alembic
Run: Move-Item alembic.ini legacy-python/
Run: Move-Item requirements.txt legacy-python/
Run: Move-Item Dockerfile legacy-python/Dockerfile.python
Run: Move-Item docker-compose.yml legacy-python/docker-compose.python.yml
Run: Move-Item stream.py legacy-python/
Expected: TS src/ contains only .ts files; python assets live under legacy-python/.

**Step 3: Preserve python-specific docs**

Run: mkdir legacy-python/docs
Run: Move-Item docs/design legacy-python/docs/design
Run: Move-Item docs/ASR_INTEGRATION.md legacy-python/docs/ (only if Python-specific)
Expected: legacy docs stored; TS docs remain under docs/ root.

### Task 3: Remove duplicate/obsolete TS scaffolds

**Files:**
- Delete: src-clean/, 	ests-clean/, 	sconfig.clean.json, 	sconfig.clean-implementation.json, .gitignore.tmp, slint.config.js.tmp, dist-clean/, coverage/, htmlcov/

**Step 1: Remove clean copies**

Run: Remove-Item -Recurse -Force src-clean, tests-clean, dist-clean
Expected: those directories gone.

**Step 2: Remove temp configs & coverage**

Run: Remove-Item tsconfig.clean.json, tsconfig.clean-implementation.json, .gitignore.tmp, eslint.config.js.tmp
Run: Remove-Item -Recurse -Force coverage, htmlcov
Expected: workspace retains only primary configs.

### Task 4: Normalize tests layout for TS

**Files:**
- Ensure TS tests stay: 	ests/**/*.ts
- Add ignore: .eslintignore (if needed)

**Step 1: Verify TS tests remain**

Run: Get-ChildItem tests -Filter *.ts -Recurse
Expected: list includes core/service/repository tests (Vitest).

**Step 2: Ensure tsconfig.test includes tests/**

Inspect 	sconfig.test.json; no change expected unless path breakage found.

### Task 5: Update housekeeping files

**Files:**
- Modify: .gitignore
- Create: README-TS.md (brief note of TS baseline & legacy relocation)

**Step 1: Add legacy-python to gitignore**

Edit .gitignore to include legacy-python/ and remove entries for deleted dirs (dist-clean, src-clean, 	ests-clean).

**Step 2: Document layout**

Create README-TS.md with short sections: Purpose, Current layout, How to run (npm test/dev), Where legacy code lives.

### Task 6: Regenerate Prisma client & lint/test smoke

**Files:**
- Commands only

**Step 1: Install deps if needed**

Run: 
pm install
Expected: completes.

**Step 2: Regenerate Prisma client**

Run: 
px prisma generate
Expected: Prisma client builds successfully.

**Step 3: Lint & tests**

Run: 
pm run lint
Run: 
pm test
Expected: pass or catalog failures for follow-up.

### Task 7: Commit checkpoint

**Files:** git state

**Step 1: Review git status**

Run: git status --short
Expected: shows moves/deletions/new docs.

**Step 2: Commit**

Run: git add .
Run: git commit -m "chore: reorganize repo for ts baseline"
Expected: commit created.

---

Execution note: After this cleanup, continue on TS implementation using existing plan (TYPESCRIPT_REWRITE_PLAN.md) with a single codebase and Vitest/Prisma baseline.
