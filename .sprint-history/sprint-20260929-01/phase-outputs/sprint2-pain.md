# Sprint 2 Pain Document

来源：Sprint #149（Prisma 7 + PGlite）Phase 4 VERIFY 的 emergent issues。
已有排期（#150 coverage job / #152 prisma migrate / #153 Conventional Commits / #154 Admin UI E2E / #155 变异测试）在各项下标注映射。

## Critical Issues（自动进入 Sprint 2）

### C-1 不存在免凭据本地启动路径，且 `.env` 启动带有生产外发副作用
- **现象**：`tsx --env-file=.env src/server.ts` 在 `src/server.ts:177` 无条件
  `DingTalkStreamClient.fromEnv()`；凭据存在时 post-listen 直接连生产 Stream，
  并对每条 `ACTIVE/PROCESSING` 且末条非 assistant 的访谈调用 `sender.sendTextMessage`
  （`src/server.ts:316-339`）。去掉凭据则抛 `clientId is required`，服务无法启动。
- **后果**：任何「本地起来看一眼」的验证都可能向真实用户外发消息；同时 UI 人工验证只能靠 e2e 覆盖。
- **建议**：`APP_ROLE`（web / worker）或 `DISABLE_STREAM` + `DISABLE_STARTUP_RESEND` 开关，
  默认本地不连流、不重发；重发逻辑改为显式运维命令。
- **归属**：独立小 sprint（不在现有 5 个排期内），#154 Admin UI E2E 是它的主要受益方。

## Major Issues（询问用户是否纳入）

### M-1 AC-003-02 的性能预算在并行套件下不可稳定断言
- 隔离 warm p95 ~230 ms，全量并行套件内 2356/2712 ms。测试已改判确定性不变量，
  数字预算只活在 `.sprint-state/` 证据文件里，CI 无回归防线。
- 建议：为性能预算加一条**独立、串行、单 worker** 的 bench job（可挂到 #150 coverage job 的 workflow）。

### M-2 e2e 峰值内存 4441.8 MB vs 7 GB CI runner
- node 2368.5 MB（5 进程，含 4 vitest worker 内的 PGlite）+ chrome-headless-shell 2073.3 MB（20 进程）。
- 建议：首个 CI run 观察；如触顶则对 e2e 降 `maxWorkers` 或拆分 job。→ 归 #150（CI job 编排）。

### M-3 Gate 6 architecture 长期 2.8/10（Poor），master 与本分支同分
- 219 smells：Code Clone 62 / Dead Symbol 45 / 高认知复杂度 41；克隆集中在 legacy 测试样板
  （`health-api.test.ts`、`admin-templates-{import,integration}.test.ts`、`plans-api.test.ts`）。
- 建议：一次性测试样板收敛（提 fixture/工厂），并把 Gate 6 纳入可执行阈值（当前仅告警）。

## Minor Issues（可选纳入）

### N-1 legacy `@intent` 注解债：281 个测试无 `@intent`（全域对齐 score 0）
- 项目 `docs/test-alignment/plan.md` 早已声明 Legacy Mode，本 sprint 按 SPEC 追溯域出分并披露基线。
- 建议：作为独立 19 文件注解专项；#367 门禁已可按域出分，不构成阻塞。

### N-2 `xp-gate retro` 报 "Sprint transitions recorded: 0"，与 sprint-state 里 3 条 completed 不符
- 工具数据源在本项目路径下未命中 `phase_history`；不影响门禁，仅需知晓 retro 报表的该字段不可信。

### N-3 README 版本 badge 仍指向 #153 之前的手工流程
- → 归 #153（Conventional Commits + 自动版本/CHANGELOG）。

### N-4 pre-commit Gate 1 对「纯文档提交」失败（`biome check --staged` 0 files → EXIT=1）
- 规避方式：每次提交至少 stage 一个可检查文件。建议给该 gate 加「无匹配文件视为通过」。
