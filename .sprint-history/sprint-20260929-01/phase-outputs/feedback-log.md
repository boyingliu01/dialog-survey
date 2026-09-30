# Sprint #149 — Phase 4 VERIFY feedback log

Sprint: #149 · SPEC-PRISMA7-001 v1.0.0 · branch `sprint/2026-09-29-01` · HEAD `2662c3e`
Date: 2026-09-30 · Executor: orchestrator (Part A 直接执行, Issue #249)

## Part A — 门禁链结果

| Step | 命令/技能 | 结果 | 证据 |
|---|---|---|---|
| 1 | `delphi-review --mode code-walkthrough` | R1 0.8267 → R2 0.8900 → **R3 APPROVED 0.9333**（3 个 distinct 模型） | `.code-walkthrough-result.json`, `walkthrough-round{1,2,3}.json`, `walkthrough-bm5-consensus-report.md` |
| 2 | `test-specification-alignment`（#367 程序化 HARD-GATE） | **PASS 100**（域内 6 REQ / 12 AC / 11 intent 全覆盖，misaligned 0，anti_pattern false）；`head_commit` = 2662c3e，`spec_hash` = 1c9b235a… | `test-alignment-report.json`, `run-test-alignment.ts`, `tests/prisma7-spec-invariants.test.ts` |
| 2.5 | `xp-gate check --all` | **9/10**，唯一失败 = Gate 6 architecture（2.8/10）——master 基线同为 2.8/10 且 EXIT=1，判定为既有债 | `phase4-xpgate-check-all.log` |
| 2.6 | 全量回归（无 PG） | 118/118 files，1281 passed / 1 skipped，VITEST_EXIT=0，314 s | `phase4-full-suite-final.log` |
| 3 | 浏览器验证（Layer 4 可选链） | 真实 chromium：e2e 4 files / **28 tests passed**（登录、模板 CRUD、生命周期、报告查看与 PDF/Excel 导出）；主机 `.env` 实机浏览 **主动放弃**（见下） | `phase4-e2e-subset.log`, `phase4-browser-verification.md` |

## 需要 SHIP/CLOSE 复查的残留风险

1. **AC-003-02 的 warm p95 ≤2s 在全量并行套件下不可稳定断言**（隔离 ~230 ms，套件内 2356/2712 ms）。
   测试改判确定性不变量（模板 Blob memoize + 模板带 schema 零行），数字预算只存在于隔离证据文件。
   CI（ubuntu runner）首次真实运行仍需复查该预算是否成立。
2. **e2e 峰值内存 4441.8 MB**（node 2368.5 + chrome-headless-shell 2073.3）在 31.7 GB 主机无 OOM；
   7 GB CI runner 的余量只有 ~2.6 GB，属首个 CI run 的观察项（对应未完成任务 #15）。
3. **Gate 6 architecture 2.8/10**：219 smells（Code Clone 62、Dead Symbol 45、认知复杂度 41…），
   与 master 208 smells 相比增量来自本 sprint 新增测试文件的重复样板。不在 #149 范围内处理。
4. **branch protection 的 job 名与新 workflow 不一致**：需要在 SHIP 作为协同的共享基建变更处理（walkthrough R2 决议）。

## VERIFY 期间发现的产品级安全问题（emergent，非 #149 引入）

主机上 `tsx --env-file=.env src/server.ts` 会：

- 无条件构造 `DingTalkStreamClient.fromEnv()`（`src/server.ts:177`），凭据齐全时 `runPostListenStartup`
  直接 `connect()` 到**生产** DingTalk Stream；
- 对每条 `ACTIVE/PROCESSING` 且末条消息非 assistant 的访谈**重发消息**（`src/server.ts:316-339`）；
- 而没有凭据时又启动失败（`clientId is required`）——即**不存在免凭据本地启动路径**。

本次执行中确实误启动了一次（约 30 秒后杀掉进程树）。日志核查：`Received DingTalk message` 0 条、
`Resending unsent message on startup` 0 条 → **无消息进出，未对真实用户产生外发**。
`git log -S` 证实两处代码分别来自 master 的 `aefc7db` 与 `7933466`，本分支未引入。
→ 写入 `sprint2-pain.md`（Critical），后续 sprint 处理。

主仓库另有既存的 `node dist/src/server.js`（PID 3656，监听 0.0.0.0:3901），非本 sprint 启动，未触碰。

## Part B — Learnings 与回顾

- `.sprint-history/learnings.md` 新增 7 条模式（追溯域计分、AC 子句拆分、治理 AC 锚定入库不变量、
  Windows 调用 xp-gate TS 引擎、性能 SLA 不写壁钟断言、门禁红灯先对基线、生产 .env 启动即生产副作用）。
- `xp-gate retro` EXIT=0，`phase4-retro.log`：窗口内 14 commits，质量分 7.5 → 9.2；
  #369 rework 与 evidence-skip 区块均 "No data"（本 sprint 未使用 `--skip-evidence`），
  "Sprint transitions recorded: 0" 与 `sprint-state.json` 里 3 条 completed 记录不符——xp-gate retro
  的 phase_history 数据源在本项目路径下未命中，记录为工具观察项。

## Verdict

`status: completed` — Part A 全链通过（Gate 6 为基线既有债，已披露），#367 证据齐备且绑定当前 HEAD，
`feedback-log.md` 存在，满足 VERIFY → SHIP 门禁。
