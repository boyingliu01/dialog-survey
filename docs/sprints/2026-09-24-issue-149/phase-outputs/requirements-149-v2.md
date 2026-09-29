# 需求评审输入 v2（Round 2）：Issue #149 — Prisma 7 + PGlite 集成

> v2 修订说明：本版回应 Round 1 三专家全部 Critical/Major 意见。修订点标记 [R1-x]。

## 原始需求（Issue #149 全文，不可变）

**标题**: feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖

**背景**: 当前集成测试（`tests/*.integration.test.ts`）需要真实 PostgreSQL 实例，CI 中通过 Docker service 启动。这导致：本地开发无法直接运行集成测试（需手动启动 PG）；CI 启动 PG service 增加延迟；并发测试可能出现竞态条件。

**目标**: 升级到 Prisma 7 + PGlite（嵌入式 PostgreSQL），使集成测试零外部依赖。

**验收标准（原始 5 条，不可变）**:
1. Prisma 升级到 7.x
2. PGlite 作为测试数据库后端集成
3. 所有集成测试通过（无外部 PG 依赖）
4. CI pr.yml 中 integration-tests job 移除 postgres service
5. 本地 npm test 无需手动启动 PG

## v2 影响面修正（Round 1 核验后）

| 类别 | 修正后数量 | 证据 |
|------|-----------|------|
| `@prisma/client` import 点 | 83 文件 | 全量 codemod，目标改为门面模块（见下） |
| `new PrismaClient()` 实例化 | 33 处（src 3、tests 27、scripts 1、prisma seeds 2） | Round 1 逐一核验属实 |
| `vi.mock('@prisma/client')` | **7 个文件** [R1 修正] | db、health-api、security、server-api、server-lifecycle、admin-templates-integration、admin-templates-import |
| e2e 测试文件 | **11 个** [R1 修正] | tests/e2e/*.e2e.test.ts；`vitest.config.ts` include 覆盖 `tests/**/*.test.ts` → `npm test` 默认跑 e2e |
| CI 带 postgres service 的 job | **4 个** [R1 修正] | unit-tests、integration-tests、coverage、e2e-tests（各含 1 个 db push）；**publish.yml 另有 postgres service + db push** [R1 补充] |
| 生产/发布链路 [R1 补充] | 6 处 | Dockerfile、scripts/deploy.sh（generate + db push + 未 source .env）、scripts/cli.mjs（npm bin 安装器，在无源码树的安装目录执行 generate/db push）、.github/workflows/publish.yml、package.json files/allowScripts、ecosystem.config.cjs |
| 现状关键事实 | — | `prisma/migrations/` 目录不存在（.gitignore:95 忽略），test-db.ts 的 migrate deploy 现状必然失败、实际靠 db push 回退 —— 这是 diff 方案无漂移风险的立论依据 |

## v2 方案修订（逐条回应 Round 1）

### [R1-C] E2E / buildApp() 数据库共享缺口 → 采纳 prismaFactory 注入 + e2e 全 PGlite 化

- `src/server.ts` 的 `BuildAppOptions` 增加 `prismaFactory?: () => PrismaClient`（与既有 `fastifyFactory` 缝风格一致，默认实现走生产工厂）
- `checkDatabaseConnection()` 改造为使用该工厂
- `tests/e2e/helpers/e2e-server.ts`：通过 `buildApp({ prismaFactory: () => testDb.getPrisma() })` 注入 PGlite client；删除篡改 `process.env.DATABASE_URL` 的旧机制
- **e2e 全 PGlite 化**（主方案 X）：`npm test` 含 e2e 在内完全无 PG 依赖，满足验收 #5 最强解释
- 降级预案 Y（仅当 spike 证明 e2e PGlite 不可行）：`npm test` 排除 e2e + e2e job 保留 postgres service；需在阶段 B 开始前给出 go/no-go 结论并记录
- 废弃清理：`TestDatabase.getDatabaseUrl()`、`process.env.DATABASE_URL` 改写、CI 的 `TEST_DATABASE_URL` env 一次性移除；`cleanup()` 简化为整库丢弃（每文件独占内存库）

### [R1-C] 分阶段执行 + 回滚策略（采纳专家 C 建议）

**Stage 0 — 限时 Spike（≤0.5 天，前置门槛）**，量化 go/no-go 判据：
1. `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`（v7 参数已核实：To 选项为 `--to-schema`）生成 DDL 且 PGlite exec 成功
2. 全 schema DDL（enum×6、String[]×3、Json×7、uuid、复合索引）+ CRUD + relation
3. 交互式 `$transaction(async tx => …)` 嵌套/回滚（对齐 src 5 处生产用法：interview-state.repository.ts:44,159 乐观锁、interview-plan-members.service.ts:126,204、api/plans.ts:512）
4. `$queryRaw` tagged template（server.ts:70、api/health.ts）
5. 唯一约束冲突错误码 P2002 与真 PG 一致
6. `Promise.all` 并发 20 请求（对齐 admin-core.e2e.test.ts:69,98,113）
7. Windows 本机 + ubuntu-latest 双平台
- **no-go 回退**：保留 postgres service，仅执行 Stage A（Prisma 7 升级），PGlite 部分推迟并记录决策

**Stage A — Prisma 7 升级（测试仍跑真实 PG）**：升级依赖 + 新 generator + prisma.config.ts + 门面模块 + codemod + 工厂改造；全量测试在真 PG 上绿。绿灯后进入 Stage B。
**Stage B — PGlite 替换**：TestDatabase 重构 + createTestPrisma + globalSetup + 27 处测试实例化替换 + e2e 注入 + CI service 移除；全量测试无 PG 绿。
- 回滚点：Stage A 失败 → git revert + npm ci（DB schema 未变，零成本，写入文档）；Stage B 失败 → 保留 Stage A，CI 继续 PG service
- 两 Stage 在同一个 sprint/PR 内以两个里程碑提交序列推进，各自绿灯门禁

### [R1-C] 发布/部署链路纳入方案与验收 [R1 补充]

- **生成物入 dist**：已核实（GitHub prisma/orm#29036，含维护者回复）——新 `prisma-client` generator 产出 **.ts 源码**，正确做法是**不排除** tsconfig include 中的生成目录，由 tsc 编译进 dist；运行时 wasm/query-compiler 由 `node_modules/@prisma/client/runtime` 承载（Dockerfile runner 已 COPY node_modules）。**BUILD 阶段必须验证 dist 产物自包含**（在无源码树场景跑 `node dist/src/server.js` 冒烟）
- **Dockerfile**：`npm ci --ignore-scripts && npx prisma generate && tsc` 链条已兼容显式 generate；运行阶段 COPY node_modules + dist 已覆盖 runtime；新增 `prisma.config.ts` 需在构建上下文内（已 COPY . .）
- **scripts/cli.mjs（npm bin 安装器）**：发布包交付**已编译的 client**（构建时生成并编译），安装流程**移除 prisma generate**、保留 `prisma db push`（需 prisma/config.ts 进入 package.json `files`，并验证 npx prisma CLI 可用性）——具体改造在 BUILD 阶段落实
- **publish.yml**：与 pr.yml 同步移除 postgres service/db push（tag 发布流水线的测试链路）
- **deploy.sh**：Phase 4-8（generate/db push）适配；`.env` 加载职责移交 prisma.config.ts（dotenv）；Node 最低版本校验同步 20.19
- **package.json**：`allowScripts` 清理 Prisma 5 键名；`files` 增补 `prisma.config.ts`
- **新增生产回归验收**：`npm run build` 后无源码树冒烟（node dist/src/server.js + /health db ok）；`npm pack --dry-run` 产物含编译后 client

### [R1-M] 门面模块收敛依赖（采纳专家 A M2 + B minor + C major）

- 新建 `src/utils/prisma-client.ts` 门面：显式 re-export PrismaClient、全部运行时枚举（InterviewStatus、SendStatus、TemplateStatus、PlanStatus、BatchReportStatus、BatchReportType）、`Prisma` 命名空间类型、model 类型——**单一依赖缝**
- 83 文件 codemod 目标为门面模块（而非直连生成目录），mock 目标也随之稳定（`vi.mock('…/utils/prisma-client.js')`）
- 7 处 vi.mock 逐一改造，mock 工厂补全运行时枚举导出（当前工厂只返回 `{ PrismaClient }`，codemod 后需同步）
- `architecture.yaml` 显式声明该层；生成物 src/generated 保持被 ignore
- 符号清点前置：运行时枚举导入点（api/templates.ts、services/interview-plan-send.service.ts、interview-plan-base.service.ts、repositories/template.repository.ts 等）与 `Prisma.*` 类型导入点（interview-plan-members.service.ts:2,191,232）在 spike 中逐一验证

### [R1-M] 测试 schema 初始化（参数修正 + 衔接契约）

- 命令修正为 v7 官方参数：`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`（已核实 CLI v7 文档）；spike 验证输出 DDL 无 PG 专属扩展依赖（uuid 由应用层生成，无 CREATE EXTENSION 预期）
- 抽象 `applyTestSchema(pglite)`：当前实现 `fromDatamodel()`（diff 生成）；#152 完成后切 `fromMigrations()`（拼接 migrations SQL）——**回切任务写入 #152 DoD 并双向链接**
- 缓存策略：vitest globalSetup 生成，缓存键 = schema.prisma 内容哈希，缓存文件不入版本库；CI 冷启动可复现

### [R1-M/M] 工具链排除清单（完整版）

- `biome.json` 三处（files.ignore / linter.ignore / formatter.ignore）+ `vitest.config.ts` 的 **coverage.exclude 加 `src/generated/**`**（防覆盖率坍塌）
- tsconfig：**不排除** src/generated（tsc 编译生成物是正确做法，已核实）；验证生成代码在 `exactOptionalPropertyTypes`、`noUnusedLocals`、`isolatedModules` 下零错误（spike 项）
- `.gitignore` 加 `src/generated/`

### [R1-M] 非功能验收基线 [R1 补充]

- 记录基线：现状 integration-tests job 时长、本地 npm test 全量时长
- 目标：CI integration-tests job 时长 ≤ 基线（变更后含 e2e 时间调整需说明）；`TestDatabase.setup()` p95 ≤ 2s；vitest maxWorkers 上限观察 CI 内存峰值
- 测试总时长回归 guard：若 PGlite 方案导致总时长超过基线 +20%，需在 VERIFY 阶段说明

### [R1-M] 文档更新清单 [R1 补充]

- AGENTS.md（"PG required"表述、测试分层、CI job 数）、docs/setup-guide.md、README.md / README.zh-CN.md、DEPLOY.md
- 显式区分"运行应用需 PG / 运行测试不需 PG"；prisma.config.ts、engines>=20.19.0、postinstall 说明

### [R1-minor] 杂项采纳

- engines `>=20.19.0` + deploy.sh 同步校验 + .nvmrc 可选
- 生产工厂显式配置连接池参数（connectionTimeoutMillis 等），对齐 v6 行为，不依赖 checkDatabaseConnection 的 race 兜底
- 依赖精确 pin：pglite-prisma-adapter@0.7.2（0.x 社区包，单入口收敛便于替换）
- Plan B 记录：`embedded-postgres`（真 PG 二进制，代码改动仅限 TestDatabase）作为 Stage A 受阻时的退路
- ecosystem.config.cjs 的 dist/server.js vs dist/src/server.js 路径疑点 → 记为 emergent issue 单独处理，不阻塞本 sprint
- 升 7 不升 8 RC（8 GA 后另开 issue）
- coverage job `if: always()` 的移除属于 issue #150 范围，本 sprint 只验证 PGlite 后残留问题消失的证据；#150 顺序在后

## 验收标准（v2 增强版，原始 5 条 + 增强判据）

1. Prisma 7.10.0 升级完成（package.json diff 为证）；`prisma generate` 通过；类型检查零错误
2. PGlite 后端集成：TestDatabase/createTestPrisma 全部走 PGlite；27 处测试实例化替换完毕
3. **全部测试**（unit + 6 集成 + 11 e2e，共 ~100 文件）在无 PG 环境全绿（本机 Windows 证据 + CI 证据）
4. pr.yml 的 4 个 job（unit-tests / integration-tests / coverage / e2e-tests）移除 postgres service 与 db push；publish.yml 同步（逐 job 为硬性验收）
5. 本地 `npm test`（含 e2e）无 PG 全绿；生产回归：`npm run build` + 无源码树冒烟 + docker build（如环境允许）+ npm pack 产物检查
6. （增强）Stage 0 spike 报告含全部 7 项判据结果；非功能基线与回滚策略文档化

## 评审请求

Round 2 复审要点：
1. Round 1 的 4 项 Critical（E2E DI 缺口、验收矛盾、发布链路、spike/回滚）是否已充分解决？
2. 门面模块方案是否引入新风险（re-export 完整性、类型导出形态）？
3. 分阶段策略是否有效降低返工风险？
4. 仍存在哪些未解决或新识别的问题？
