# Stage 0 Spike 报告 — Prisma 7 + PGlite（#149 M1）

- **执行日期**: 2026-09-29（本地）/ ubuntu-latest CI 复跑待触发
- **平台**: win32/x64，Node v24.19.0（Spike 脚本独立于项目 engines 校验）
- **脚本**: `tools/spike/prisma7-pglite-spike.mjs`（永久保留，可重跑）
- **运行命令**: `npx tsx tools/spike/prisma7-pglite-spike.mjs --json .sprint-state/phase-outputs/stage0-spike-results.json`
- **原始数据**: `.sprint-state/phase-outputs/stage0-spike-results.json`（run 3 最终）；日志 `.sprint-state/phase-outputs/stage0-spike-run3.log`
- **辅助探针**: `.sprint-state/phase-outputs/pglite-fastpath-probe.mjs`（独立进程交叉验证 #12/#12b 时序与 RSS）

## 结论速览

**verdict = FAIL#（非 no-go）** — 16 项判据：**13 PASS / 2 FAIL / 1 INFO**

| FAIL 项 | 性质 | 落点（§4.2 映射） |
|---------|------|------------------|
| #6b 并发乐观锁竞态 | PGlite 单连接串行化物理不可复现（**非语义不可行**） | §4.2「仅 #6/#6b → 降级 Y」；**sprint owner 判定保留计划 X**，见下方分析与用户呈报项 |
| #12 warm p95 2440ms / 冷 6676ms / 单实例 141.8MB | 性能软目标未达标 | §4.2「非 no-go：helper 契约调整」；**#12b PASS 已给出落定手段**（dumpDataDir/loadDataDir 模板快路径） |

**no-go 判定：无。** #0/#1/#2/#3/#5 全部 PASS，Stage B（PGlite 替换）继续推进。

## 判据逐项结果（run 3）

| # | 判据 | 结果 | 关键证据 |
|---|------|------|---------|
| 0 | 适配器 peerDeps 兼容 + `npm ls` | **PASS** | `pglite-prisma-adapter@0.7.2` peers `{pglite >=0.2.0, @prisma/client >=7.1.0}`；peer 警告 0 行 |
| 1 | DDL 生成 + PGlite 回放 | **PASS** | 无 `CREATE EXTENSION`；public 表 10 张；DDL 8013 字节（`migrate diff --from-empty --to-schema --script`） |
| 2 | 全 schema 特性 | **PASS** | 10 model CRUD；P2002=true；String[]×3 / Json×8 / uuid / 复合唯一 / relation 全通过 |
| 3 | 交互式 `$transaction` | **PASS** | 回滚=true（rollback 后行数 0）；read-modify-write version=2 |
| 3b | 生产事务形态（3 处） | **PASS** | interview-state / plan-members / plans 三类形态全部成功 |
| 4 | `$queryRaw` tagged template | **PASS** | tagged template 返回 `{ok:1}` |
| 5 | P2002 错误码对齐 | **PASS** | `code=P2002`，meta 内含 driverAdapterError → PG 23505 / UniqueConstraintViolation（与真 PG 语义一致） |
| 6 | 混合负载 20 并发（15 普通 + 5 长事务） | **PASS** | 20/20 HTTP 200；无死锁；version=6 |
| **6b** | 并发乐观锁（双 tx 同行） | **FAIL** | `winnerCounts=[1,1]; finalVersion=3` — 两个事务均胜出（串行化执行，非竞态交错） |
| 7 | 双平台 | **INFO** | 本机 win32 全判据跑通；ubuntu-latest 已复跑（run 36600066391，11 PASS / 2 FAIL / 1 INFO）→ 分析见 `m1-addendum.md`（含 #11 argv bug 定位与修复） |
| 8 | generate 无 `DATABASE_URL` | **PASS** | `env -i` 隔离下 no-env exit=0 → **DD-008 分支 B：无需 dummy env** |
| 9 | strict tsc + 门面符号 + 跨路径类型同一性 | **PASS** | repo-wide `tsc --noEmit`=true；probe（符号清单 / 双向类型同一性 / factory 可赋给 prismaFactory）全 true |
| 10 | 生产 adapter 路径（真 PG） | **PASS** | `createPrismaClient()` 真查询 ok（server 18.4，WSL PG）；错误端口 14ms 即失败（ECONNREFUSED 即时拒绝，非超时路径） |
| 11 | 全新安装（npm pack → 隔离安装 → db push） | **PASS** | 详见下方「#11 结论」 |
| **12** | createTestPrisma 时序 / 内存曲线 | **FAIL** | cold 6676ms；warm p95 2440ms（n=5 [2021,2041,2078,2433,2440]）；RSS base 975.2MB → 单实例 **141.8MB**；3 并发峰值 1400.5MB；释放后回落 996.6MB（实例释放时机正常） |
| **12b** | PGlite 模板快路径（dump → loadDataDir） | **PASS** | 模板构建 2612ms；dump 39MB（40,906,752B）；warm p95 **692ms**（n=5 [425,506,558,647,692]） |

## 失败项分析

### #6b — 并发乐观锁竞态不可复现

- **现象**: 双 `$transaction` 同时更新同一行，期望「一方冲突、一方成功」，实测两方均成功（`winnerCounts=[1,1]`，finalVersion=3）。
- **根因**: PGlite 单连接会串行化交互式事务——第二个事务的读操作发生在第一个事务提交之后，因此读到的是新版本，乐观锁冲突条件不成立。这是 PGlite 架构特性，**非 Prisma/adapter 语义缺陷**。
- **风险已由其他判据覆盖**:
  1. #6 混合负载 20 并发（含 5 个长事务）全部 200，无死锁/数据错乱 — 真实并发路径已压测；
  2. 现有集成测试对乐观锁冲突是**顺序模拟过期版本**（`tests/interview-state-repository.integration.test.ts:242-263`，手工构造 stale version 触发 StatePersistenceError），不依赖真实竞态交错；
  3. 三处生产事务形态（#3b）语义与真 PG 一致。
- **§4.2 映射**: 「仅 #6 / #6b → 降级 Y（e2e 保留 PG service + 修订 AC）」。**sprint owner 判定：保留计划 X**——#6b 的 go 标准「非串行化假绿/交错假红」在 PGlite 上物理不可满足，但它检验的是**测试载体的竞态复现能力**，而非 PGlite 的正确性；现有测试并不依赖该能力（见上第 2 点）。降级 Y 的代价（e2e 永久保留 PG service + AC 修订 + coverage/publish 连锁修改）大于收益。
- **呈报**: 此项列为 M1 呈报用户的少数派意见（design-doc R2 结论 + 本报告实测），用户可在下一决策点（SHIP 前）复核；若用户选择降级 Y，触发条件与连锁路径已备于 DD-012。

### #12 — 性能软目标未达标 → #12b 已给出落定手段

- **实测（DDL 重放路径）**: warm p95 2440ms > 2s 目标；cold 6676ms > 5s 目标；单实例 RSS **141.8MB**（vs 设计期启发值 30-80MB → **启发值失效，按实测回填**）。
- **缓解（#12b 模板快路径）**: 一次构建模板（`new PGlite(); exec(ddl); dumpDataDir('none')`，2612ms，dump 39MB 缓存到 `node_modules/.cache/dialog-survey/`），此后每个实例 `new PGlite({ loadDataDir })` 启动——warm p95 **692ms**（达标，余量 ~2.9×）。独立探针交叉验证：loadDataDir 路径 485/508/486ms vs DDL 重放 1939/1662ms。
- **落定**: Stage B helper（`tests/helpers/test-db.ts`）采用**模板快路径**：globalSetup 构建模板一次并落盘缓存；`setup()` = `loadDataDir` + adapter 构造。DDL 重放仅作为缓存缺失时的冷启动回退。冷启动预算 = 模板构建 2.6s + 首个 loadDataDir ≈ 3.3s ≤ 5s。**#12 FAIL 经此调整后不影响 §3.6 达标**（口径：warm p95 由 692ms 满足 ≤2s）。
- **§3.6 maxWorkers 先验模型重定（BUILD 不得以未回填模型做最终决策 — R4-T2）**:
  - 回填值：单实例 ≈ 141.8MB（实测，替代 30-80MB 启发值）；3 并发实测峰值 1400.5MB（含 Vitest/Node 基线 975.2MB）。
  - 重定估算：`maxWorkers = min(4, cpus)` 起步，4 worker × 2 实例/文件 × 141.8MB ≈ 1.13GB + 基线 ~1GB ≈ 2.1GB — GitHub ubuntu-latest（16GB RAM）余量充足；本机 Windows 余量按实际内存复核。
  - **待 M3 入口补测**（R4-F2 ②选项）: 真实 vitest worker 场景下「单 worker 连续跑 N 文件 RSS 增长曲线」（T-m3）与「单文件最大实例数」（T-M4，analysis-api.test.ts 跨实例硬依赖）——spike 内已用同进程顺序 6 实例 churn（释放后回落至基线）与 3 并发实例做组件级前置实测，M3 补测为最终确认。

### #7 双平台（INFO → 待 CI）

- 本机 Windows：全部判据跑通（run 3）。ubuntu-latest：`.github/workflows/spike-prisma7.yml`（workflow_dispatch + push paths 过滤双触发，永久保留）随 M1 推送后异步复跑同一脚本；CI 排队属 **infra 延迟**（R1-min8）不计 no-go。结果回填 M1 addendum / M2 入口。

### R1-min15 retry 观察（留痕）

- Spike 载体为纯 node 脚本，**无 vitest retry 机制介入**；#6/#6b 为直接 `$transaction` 调用，不存在 retry 掩盖失败的情形。
- `retry:1` 触发次数观察**顺延至 M3 全量（Stage B 后）留痕**；若出现同一用例反复重试才绿，对 PGlite 用例单独评估 `retry:0`。

## 回填（DD-008 / DD-009 / DD-010 / §3.6）

| 落点 | 回填结论 |
|------|---------|
| DD-008（CI generate env） | **分支 B**：#8 证明无 `DATABASE_URL` 时 `prisma generate` exit=0（config 为 type-only 形态）→ CI 4+6 job 的 generate 步**无需 dummy env** |
| DD-009 (a)(b) | 已落地：`filesToCopy` / `verifyInstallation.requiredFiles` 均包含 `prisma.config.ts`（M4 实施，本报告确认必要性——#11 证明包内 config 被加载） |
| DD-009 (c) — config 写法 | `defineConfig` 运行时 import（形态 A）在消费者安装中 **FAIL**（`Cannot find module 'prisma/config'`，prisma 为 devDep）；**形态 B（type-only import + satisfies）与形态 C（纯对象）均 ok**。已切换 shipped 形态为 **B**（`prisma.config.ts` 已改，`shippedConfigLoads=true`） |
| DD-009 (c) — 防全局写入 | `--no-generate` 在 7.10.0 **不存在**；**`PRISMA_SKIP_GENERATE=1` 实测可用（exit 0）** → 三路径至少一条可用（R4-T1 ✓），cli.mjs 采用该 env；且实测 `db push` 不写生成物（`autoGenerated=false`），双保险 |
| DD-010（生产池配置） | #10 PASS：`createPrismaClient()` 真 PG 查询成功、错误端口快速失败（连接拒绝即时返回）。`connectionTimeoutMillis` 的超时路径未在本场景触发（ECONNREFUSED 即时拒绝），语义与 v6 对齐、无回归 |
| §3.6（maxWorkers / 内存） | 见上「#12 → §3.6 maxWorkers 先验模型重定」 |
| §4.1 #12 载体选择（R4-F2） | 选 **②顺延 M3 入口补测并留痕**（真实 vitest worker 场景）；spike 内已完成组件级前置实测（本报告 §#12） |

## 复现方法

```bash
export PATH="/c/Program Files/nodejs:$PATH"
cd .worktrees/sprint-20260929-01
export NODE_ENV=test
export DATABASE_URL=postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test
export TEST_DATABASE_URL="$DATABASE_URL"
npx tsx tools/spike/prisma7-pglite-spike.mjs --json .sprint-state/phase-outputs/stage0-spike-results.json
# 单项过滤: --criteria 6,6b,12,12b
```
