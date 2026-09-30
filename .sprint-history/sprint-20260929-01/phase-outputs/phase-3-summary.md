# Phase 3/6: BUILD — Phase Summary (Issue #149, Prisma 6→7)

- **Sprint**: sprint-20260929-99 | **Branch**: sprint/2026-09-29-01
- **Status**: completed
- **HEAD**: `9dda5c3`（docs(#149): M5 治理与文档）
- **基线**: `ecb2029`（Phase 2 出口）

## Commits（7 个，M1-M5 全链）

| # | Commit | Milestone | 内容 |
|---|--------|-----------|------|
| 1 | `f0cc657` | M1/S1 | 依赖预装 v7（prisma/@prisma/client/@prisma/adapter-pg 7.10.0 + pglite 0.5.8 + pglite-prisma-adapter）+ 门面/工厂 + Stage 0 spike |
| 2 | `0820555` | M2/S2 | Stage A：门面切换（全消费方经 `src/utils/prisma-client.ts`）+ 工厂/DI 缝 + codemod（26 构造点三分类）+ CI generate |
| 3 | `eb707f9` | M2 走查整改 | Stage A walkthrough R2 响应：timeout dedup + 测试卫生 |
| 4 | `ad63e58` | spike 修复 | db push argv 拆分 + 预期失败退出语义 |
| 5 | `d413056` | M3/S3 | Stage B：PGlite 测试基座（无 PG）+ vitest 配置 + CI 7 job 无 service |
| 6 | `d85167c` | M4/S4 | 发布链路适配补完（Docker runner public/ + prisma.config.ts、Node 对齐、db push 固化 PRISMA_SKIP_GENERATE=1、healthcheck）+ 静态审查整改 |
| 7 | `9dda5c3` | M5/S5 | 治理与文档：architecture.yaml 归属声明 + biome.json files.ignore 补齐 + 全量文档刷新 + CHANGELOG |

## Outputs

| 产物 | 路径 |
|------|------|
| Spike 报告（#0-#12） | `.sprint-state/phase-outputs/stage0-spike-report.md` + `stage0-spike-results.json` + run2/run3 日志 |
| M1 CI 回填分析 | `.sprint-state/phase-outputs/m1-addendum.md`（ubuntu 复跑 11 PASS/2 FAIL/1 INFO；#6b 预期失败；#11 argv 修复后待 push 后复跑 ⏳） |
| Stage A 证据 | `stageA-full-suite*.log`（CI parity / coverage / post-review / final）+ `m2-gate-evidence.md` |
| Stage A 走查 | `walkthrough-consensus-report.md` + `walkthrough-round{1,2,3}.json`（APPROVED） |
| Stage B 证据 | `stageB-full-suite-nopg.log` + `stageB-memory-probe.log` + `stageB-gate-evidence.md` |
| M4 证据 | `m4-full-suite.log`（117/117 文件，1266 passed \| 1 skipped，EXIT=0，无 PostgreSQL）+ `m4-smoke.log` + `m4-builder-sim.log` + `m4-pack-listing.json` + `m4-docker-build-baseline.log` + `m4-gate-evidence.md` |
| M5 证据 | `m5-archlint-evidence.md`（master 208 smells/10 High vs worktree 219/10 High，High/Critical 配对 diff 新增 0 丢失 0） |
| 代码形态 | 门面 `src/utils/prisma-client.ts`（纯 re-export）+ 工厂 `src/utils/prisma-factory.ts`（唯一 `new PrismaClient()`，5s timeout，缺 DATABASE_URL 硬失败）+ 生成物 `src/generated/prisma`（.ts，gitignore） |

## Verification Evidence（Phase 3 收口）

- **全量测试（无 PG）**：117/117 文件，1266 passed | 1 skipped，EXIT=0（M4 复跑，PGlite）
- **CI 结构**：7 job（static-analysis/unit/integration/security/coverage/smoke/e2e），每 job `npx prisma generate`，无 postgres service；e2e job 用 PGlite + 真 chromium
- **M5 提交门禁**：pre-commit 12 gate PASS（Overall 7.5/10，9/12 pass，3 skip）；Gate 11 Sprint Flow = delphi-review APPROVED "sprint phase 3 validated"
- **Gate 6（archlint）**：hook 基线棘轮模式 PASS（"3 improvements"）；独立严格扫描对比确认 master↔worktree High/Critical 配对完全一致（0 新增/0 丢失）——存量失败归于基线，非 sprint 引入
- **静态**：`biome lint src`（58 文件）clean；`tsc --noEmit` clean
- **发布链路**：installer 12 步、`node dist/src/server.js`、`prisma db push`（PRISMA_SKIP_GENERATE=1）、health 200/503 语义、pack 内容与 docker 构建基线均已实测（M4）
- **文档一致性**：PUBLIC_URL/MAX_LLM_RETRIES 等死变量清理（0 代码引用验证）；AGENTS.md 头部保留 `(v1.8.9)` token 供 `sync-version.sh` 刷新（已模拟验证正则命中）

## Emergent Issues（记录，Phase 4/CLOSE 处置）

1. `ecosystem.config.cjs` script 指向 `dist/server.js`，实际产物为 `dist/src/server.js`（设计 §1.3 明确 out-of-scope，仅记录，SHIP 用户门禁时上报）
2. README/README.zh-CN version badge 停在 1.8.1（VERSION=1.8.9）；`sync-version.sh` 不覆盖 badge → 移交 #153（版本自动化）
3. 全局 pre-commit hook（`C:\Users\think\.config\xp-gate\hooks\pre-commit:967`）biome 阶段缺陷：仅非 TS/JSON 文件入暂存区时 `npx biome check --staged .` 报 "No files were processed"（exit 1），落入无条件 BLOCK 分支。已被 M5 的 biome.json files.ignore 补齐缓解（全仓 check 由 2 errors → 0），但 docs-only 提交仍需保证 ≥1 个可检查文件入暂存区（或后续给全局 hook 加 `--no-errors-on-unmatched`）
4. M1-CI 回填：spike ubuntu 复跑须在 push 后触发（task #15 延续至 Phase 4/5）

## Next Phase Context (VERIFY)

- 对 **Stage B+M4+M5 新增变更集（HEAD `9dda5c3`）** 执行 delphi code-walkthrough（此前走查仅覆盖 Stage A @ eb707f9）
- `#367 test-specification-alignment` HARD-GATE → `test-alignment-report.json`（head_commit + spec_hash）
- `xp-gate check --all`：gate 6 在 master 上即 exit 1（存量），记录 master↔worktree 证据（archlint 必须 `--no-cache`，早前 warm cache 出现非确定性 EXIT=0）
- Docker tier-(c) 残余风险 + emergent #1（ecosystem.config.cjs）在 SHIP 用户门禁上报
