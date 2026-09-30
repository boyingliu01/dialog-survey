# Phase 4/6: VERIFY — Phase Summary (Issue #149, Prisma 6→7 + PGlite)

- **Sprint**: sprint-20260929-99 | **Branch**: sprint/2026-09-29-01
- **Status**: completed
- **HEAD**: `2662c3e`（test: cover REQ-PRISMA7-003..006 for the #367 alignment gate）
- **基线**: `9dda5c3`（Phase 3 出口）→ `cdffb69` / `194c9c3`（走查 R2/R3 整改）→ `2662c3e`

## Phase 4 提交（3 个）

| # | Commit | 内容 |
|---|--------|------|
| 1 | `cdffb69` | 走查 R1/R2 整改：测试稳定性 + artifact header 复核 |
| 2 | `194c9c3` | 走查 R3 整改收口（APPROVED 0.9333） |
| 3 | `2662c3e` | #367 对齐缺口补齐：新增 `tests/prisma7-spec-invariants.test.ts`（15 断言，覆盖 REQ-003..006 / AC-011..012 等） |

## Gate 链结果

| 门禁 | 结果 | 证据 |
|------|------|------|
| delphi-review code-walkthrough | R1 0.8267 → R2 0.8900 → **R3 APPROVED 0.9333**，3 distinct 模型 | `.code-walkthrough-result.json` + `walkthrough-round{1,2,3}.json` + `walkthrough-bm5-consensus-report.md` |
| #367 test-specification-alignment | **PASS 100**（域内 6/6 REQ、12/12 AC、11/11 intent，misaligned 0，anti_pattern false），`head_commit=2662c3e`、`spec_hash=1c9b235a…` 双绑定 | `test-alignment-report.json`（驱动脚本 `run-test-alignment.ts`） |
| `xp-gate check --all` | **9/10**，唯一失败 Gate 6 architecture 2.8/10；master 基线同分同 EXIT=1 → 既有债，已披露 | `phase4-xpgate-check-all.log` |
| 全量回归（无 PostgreSQL） | 118/118 files，**1281 passed / 1 skipped**，VITEST_EXIT=0，314 s | `phase4-full-suite-final.log` |
| 浏览器验证（Layer 4） | 真 chromium：e2e 4 files / **28 tests passed**（登录 / 模板 CRUD / 生命周期 / 报告与 PDF/Excel 导出）；主机 `.env` 实机浏览按安全判断放弃 | `phase4-e2e-subset.log`、`phase4-browser-verification.md` |
| AC-003 数值 SLA | 冷启动 3654 ms ≤5s；隔离 warm p95 230/232 ms ≤2s；e2e 峰值 4441.8 MB 无 OOM | `ac003-timing-and-memory-evidence.md`（含 §1b 并发争用告警） |

## Decisions

- **DR-007**：走查整改以「R3 复核通过」为准，Critical/Major 全清零，Minor 走证据补写与延后处置四分类。
- **DR-008**：#367 门禁按 SPEC-PRISMA7-001 追溯域出分（域内 6 文件），全域 score 0（281 条 legacy `@intent`）作为 `scope.repo_wide_baseline` 保留披露，不当成本 sprint 回归处理（依据 `docs/test-alignment/plan.md` Legacy Mode）。
- **DR-009**：AC-003-02 的壁钟断言改为确定性不变量断言（模板 Blob memoize + 带 schema 零行），数字预算留在隔离证据；并发争用事实写入证据文件 §1b 并进 SHIP 复查清单，不静默丢弃。
- **DR-010**：不在主机用 `.env` 启动 app 做 UI 人工验证（会连生产 DingTalk Stream 且 post-listen 会向真实用户重发消息），Layer 4 由 Playwright 真实浏览器承担；问题作为 Critical emergent issue 记入 `sprint2-pain.md`。

## VERIFY 期间的一次执行事故（如实记录）

第一次主机启动（`tsx --env-file=.env src/server.ts`，shell 里把 `DINGTALK_*` 置空）中，`.env` 覆盖了
shell 空值并连上生产 Stream；发现后立即杀进程树（PID 30936/15044），日志核查
`Received DingTalk message` 0 条、`Resending unsent message` 0 条 → 无消息进出。
涉事代码经 `git log -S` 证实源自 master（`aefc7db`、`7933466`），非 #149 引入。
主仓库既有 `node dist/src/server.js`（PID 3656，:3901）非本 sprint 启动，未触碰。

## Outputs

| 产物 | 路径 |
|------|------|
| 走查共识报告 + 三轮 JSON + artifact/header | `walkthrough-*.md/json` |
| #367 报告 | `test-alignment-report.json` |
| 全量/子集/e2e/门禁日志 | `phase4-full-suite-final.log`、`phase4-e2e-subset.log`、`phase4-xpgate-check-all.log` |
| 数值证据 | `ac003-timing-and-memory-evidence.md`、`ac003-timing-probe.log` |
| Layer 4 | `phase4-browser-verification.md` |
| Learnings（7 条模式） | `.sprint-history/learnings.md` |
| Retro | `phase4-retro.log`（EXIT=0，质量分 7.5→9.2） |
| 反馈与痛点 | `feedback-log.md`、`sprint2-pain.md` |

## next_phase_context（Phase 5 SHIP）

1. VERSION-GATE：`scripts/sync-version.cjs`/`.sh` bump 到 1.8.9，VERSION 与 package.json 一致。
2. 走查证据须在 push 前 1 小时内针对**最终 HEAD**（VERSION bump 之后）重跑并写 `.code-walkthrough-result.json`。
3. branch protection 的 stale job 名需与新 workflow job 名协同改名（共享基建变更，需用户确认）。
4. 首个 CI run 复查项：warm p95 预算是否在 ubuntu runner 成立；e2e 峰值内存 vs 7 GB runner。
5. `#367` 报告已绑定 `2662c3e`；若 bump 后 HEAD 变化需重跑 `run-test-alignment.ts --write` 再 transition。
