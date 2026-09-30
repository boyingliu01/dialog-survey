# Delphi 需求评审共识报告 — Issue #149（sprint-20260924-15）

- **评审对象**: Issue #149「feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖」
- **模式**: `--mode requirements`（3 专家：architecture / technical / feasibility）
- **轮次**: Round 1 REQUEST_CHANGES（3/3） → v2 修订 → **Round 2 APPROVED（3/3）**
- **最终裁决**: ✅ **APPROVED**，聚合共识率 **0.94**（mean of 1.00 / 0.90 / 0.92）
- **证据文件**: `.sprint-state/phase-outputs/requirements-reviewed.json` + `.sprint-state/delphi-reviewed.json`
- **绑定**: `head_commit=61d616b5ed954123eb4ee9b0958ba58b61a6c547`，`requirements_hash=c9ede78b…cd514e`（xp-gate 同源校验 ok:true, errors:[], warnings:[]）

## Round 1 → v2 修订映射

R1 共提出 4 Critical / 8 Major / 7 Minor（原文匿名汇总见 `round1-anonymized-digest.md`）。v2 修订文档（`requirements-149-v2.md`）逐项回应：

| R1 关键问题 | v2 处置 | R2 三专家独立核验 |
|-------------|---------|------------------|
| E2E/buildApp() DI 缺口 | `BuildAppOptions.prismaFactory` 注入缝（对齐 fastifyFactory 风格）+ e2e 注入 `testDb.getPrisma()` | ✅ resolved（代码级抽检：server.ts:58/105/167、e2e-server.ts:87 均属实） |
| 验收标准矛盾（AC5 vs e2e PG service） | 主方案 X：e2e 全 PGlite 化；降级预案 Y 带明确触发条件 | ✅ resolved |
| 生产/发布链路缺失 | 6 处逐项处置（Dockerfile / deploy.sh / cli.mjs / publish.yml / package.json / ecosystem 路径疑点）+ 无源码树冒烟验收 | ✅ resolved（6 处均经代码核实） |
| 缺 spike/回滚 | Stage 0 限时 spike（7 项量化判据）+ Stage A/B 分阶段 + 回滚点 + Plan B | ✅ resolved（判据锚点：$transaction×5、$queryRaw×2、schema 特性均核实） |
| 门面模块 / mock 工厂 / 命令参数 / CI 数量 / 基线 / 工具链 / 文档 / 分阶段（8 Major） | v2 逐节回应 | ✅ 全部妥善处置（事实性修正经 B 专家全量核验属实） |

## Round 2 专家裁决

| 专家 | 角色 | 裁决 | 置信度 | Critical | 自评共识率 | 四项 Critical 判定 |
|------|------|------|--------|----------|-----------|-------------------|
| A | architecture | APPROVED | 8 | 无 | 1.00 | 4×resolved |
| B | technical | APPROVED | 8 | 无 | 0.90 | 4×resolved |
| C | feasibility | APPROVED | 7 | 无 | 0.92 | 4×resolved |

**requested_model 来源**: Qoder custom agent 配置（`.qoder/agents/delphi-*.md` 的 `model` 字段）：
architecture=`qmodel_38max`，technical=`gmodel`，feasibility=`cmodel`（trimmed 后互异 ✅）

## R2 非阻塞采纳清单（→ 并入设计文档 / Stage 0 前置）

三专家在 APPROVED 同时给出的精化项（均声明不阻塞，需在进入 BUILD/Stage 0 前以文档修订落实）：

1. **[A-M1] 门面命名空间 re-export 策略显式化**：`Prisma` 命名空间在 `isolatedModules` 下需 `export type` 或逐类型 re-export；Stage A checklist 显式列出（B 核验：本库 Prisma 命名空间均为 type-only 导入，形态安全）。
2. **[C-M1] spike 判据补充**：#0 `pglite-prisma-adapter@0.7.2` peerDeps 兼容 `@prisma/client ^7` 且 `npm ls` 无 peer 警告；#6b 并发交互式事务（双 `$transaction` 同行乐观锁更新，防适配器串行化假绿/交错假红）。
3. **[B-M1] `TestDatabase.cleanup()` 粒度定义**：6 个集成测试的 cleanup 在 afterEach 承担用例间隔离；保留 deleteMany 语义或每用例重建（实测成本），整库丢弃仅限文件 teardown；8 个调用点清单化审计。
4. **[B-M2] 内存判据硬化**：每文件独占 PGlite × `fileParallelism:true` 的峰值内存升格为 Stage B 验收判据（CI 全量无 OOM，否则显式 maxWorkers 复跑通过）。
5. **[C-M2] 降级 Y 判据→结论映射表**：#3/#5 失败=全 no-go（仅 Stage A）；仅 #6/#6b 失败=触发 Y；#7 仅 Windows 失败=可选 Y'；指定决策人。
6. **[C-M3] Stage A 门禁证据固化**：Stage A 里程碑提交推送后记录 CI run URL；Stage B 前不得 squash；或 Stage A 单独 PR 先合。
7. **[C-M4] Plan B 层级纠正**：`embedded-postgres` 是 PGlite 的替代（Stage 0 no-go / Stage B 受阻），与 Stage A 无关；注明代价（postinstall 二进制 + allowScripts）。
8. **[A/C-M] `getDb()` 与 `checkDatabaseConnection()` 适配**：`src/utils/db.ts` 单例列入改造清单（或注明 fallback 不可达+assert）；`checkDatabaseConnection(prismaFactory?)` 接线方式与注入 client `$disconnect` 所有权写明。
9. **[A/B/C-min] 杂项勘误与澄清**：spike #6 并发参照物修正（admin-core 的 Promise.all 实为 Playwright 等待配对，非 DB 并发）；Json 字段实为 8 个（勘误）；Plan Y 触发时须正式修订 AC；`prisma.config.ts`（根级）笔误修正 + DDL 缓存文件 .gitignore 条目；Dockerfile runner COPY `prisma.config.ts`；node pin 20.19；setup p95 冷/热启口径；cli-install.e2e 不触 DB 依据记录；冒烟拆分 (a) 无 PG 启动断言 / (b) `/health db ok` 本机验收。
10. **[A-min] Stage A/B 同 PR 合并策略**：明确 Stage A 绿灯后是否先合并（与 C-M3 合并决策）。

## 终止条件核对

- [x] 三专家均成功执行且结果结构完整（result_type=delphi_expert_result）
- [x] 三个 distinct trimmed requested_model
- [x] 聚合共识 0.94 ≥ 0.90，最终裁决 APPROVED
- [x] 所有 Critical 已解决（4/4 resolved × 3 专家）
- [x] requirements-reviewed.json 写入并经 phase-transition 同源校验 ok:true
- [x] delphi-reviewed.json 状态文件写入
