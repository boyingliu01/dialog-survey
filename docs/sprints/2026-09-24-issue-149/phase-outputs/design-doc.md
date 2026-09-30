# 设计文档 — Issue #149: Prisma 7 + PGlite 集成

| 项目 | 值 |
|------|-----|
| Sprint | sprint-20260924-15（分支 `sprint/2026-09-24-01`） |
| Issue | #149 feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖 |
| 日期 | 2026-09-24 |
| 状态 | ✅ 设计已获用户批准（2026-09-24）· ✅ batch-grill-me 共识确认（Q1-Q6 + 6 项默认）→ 待设计评审（delphi design，≥90%） |
| 上游产物 | `requirements-149-v2.md`（需求 v2，R2 APPROVED）· `delphi-r2-report.md`（共识 0.94）· `requirements-reviewed.json` · grill 决策：`decisions.md` DR-002 |
| 需求绑定 | `head_commit=61d616b5ed954123eb4ee9b0958ba58b61a6c547` · `requirements_hash=c9ede78b52b409c382b37948d6433d82ebf86f49fe059bd475cfe9c979cd514e` |

---

## 1. 目标与范围

### 1.1 目标

1. Prisma 5.22.0 → **7.10.0**（新 `prisma-client` generator，Rust-free）
2. 测试数据库后端 → **PGlite**（in-process WASM PostgreSQL 16，`@electric-sql/pglite@0.5.8` + `pglite-prisma-adapter@0.7.2`）
3. **全部测试**（unit + 6 集成 + 11 e2e，~100 文件）无外部 PG 全绿
4. pr.yml 4 个 job（unit-tests / integration-tests / coverage / e2e-tests）+ publish.yml 移除 postgres service 与 db push
5. 本地 `npm test`（含 e2e）零手动步骤

### 1.2 In Scope

依赖升级、schema/generator/prisma.config.ts、门面模块、生产/测试/脚本/种子全量适配（83 import 文件、33 实例化点）、CI workflows、发布链路 6 处（Dockerfile / deploy.sh / cli.mjs / publish.yml / package.json / ecosystem 路径疑点）、工具链排除、文档更新、Stage 0 spike 与分阶段执行。

### 1.3 Out of Scope

- `prisma migrate` 工作流规范化（**#152**：仅保留衔接契约，见 DD-006）
- coverage job `if: always()` 修复（**#150**：本 sprint 仅留证据）
- Admin UI Playwright 扩展（#154）、变异测试并行（#155）、Conventional Commits（#153）
- Prisma 8 RC（8 GA 后另开 issue）
- `ecosystem.config.cjs` 的 `dist/server.js` vs `dist/src/server.js` 路径疑点（记为 emergent issue）
- coverage thresholds 缺失（实为既有问题；R1-min15 记录，归入 emergent，不重复占用 sprint 范围）

---

## 2. 设计决策记录（DD）

### DD-001 版本选择

- **决策**: `@prisma/client@7.10.0`、`prisma@7.10.0`、`@prisma/adapter-pg@7.10.0`（三者同版精确 pin）；devDeps `@electric-sql/pglite@0.5.8`、`pglite-prisma-adapter@0.7.2`（精确 pin）
- **理由**: 7.10.0 为 v7 稳定线；adapter 0.x 社区包单入口收敛便于替换；不升 8 RC（升级指南仍在演化）
- **备选**: 直升 8 RC（拒绝：稳定性）；Prisma 6（拒绝：不满足 issue「升级到 7.x」）

### DD-002 生成器与构建路径

- **决策**: `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`；生成物为 **.ts 源码**；tsconfig **不排除** `src/generated`，由 `tsc` 编译进 `dist`；运行时 wasm/query-compiler 由 `node_modules/@prisma/client/runtime` 承载
- **理由**: 官方推荐路径（GitHub prisma/orm#29036 维护者回复）；Dockerfile runner 已 COPY node_modules
- **验证**: BUILD 阶段「无源码树冒烟」：仅 dist + node_modules 环境跑 `node dist/src/server.js` 断言启动与 `/health` 行为

### DD-003 门面模块（单一依赖缝）+ 生产工厂拆分（R1-M1）

- **决策**: 拆两个模块，职责分离：
  - `src/utils/prisma-client.ts` —— **纯符号缝（无副作用）**：`export * from '../generated/prisma/client.js';`（整体 re-export）+ JSDoc 符号清单；**不承载任何构造逻辑**（83 文件 codemod 与 `vi.mock` 的收敛目标）
  - `src/utils/prisma-factory.ts` —— **唯一生产构造点**：导出 `createPrismaClient(): PrismaClient`（内部：读 env + `PrismaPg` adapter + DD-010 连接池参数）；`server.ts` 的 `defaultPrismaFactory` 统一改名引用此符号（消除 R1 指出的「两名一物」）
- **理由**: 83 文件 codemod 与 `vi.mock` 目标收敛到稳定路径；`export *` 在 `isolatedModules` 下对 type-only 符号安全（B 专家核验：本库 `Prisma` 命名空间全部为 `import type` 用法）；纯 re-export 门面**无法承载工厂**（adapter/env/池配置），拆分是唯一自洽结构
- **符号清单（清点基准，Stage A 逐项验证）**: 值 —— `PrismaClient`、`InterviewStatus`、`SendStatus`、`TemplateStatus`、`PlanStatus`、`BatchReportStatus`、`BatchReportType`；类型 —— `Prisma` 命名空间（`Prisma.InputJsonValue`、`Prisma.InterviewPlanUpdateInput`、`Prisma.TransactionClient` 等）、model 类型
- **契约测试** `tests/prisma-facade.test.ts`: 断言运行时符号（PrismaClient + 6 枚举）与类型符号（`Prisma.*`，经 `expectTypeOf` / `*.test-d.ts` 形态）可用；**并断言门面 import 无副作用**（不建连、不读 env 抛错——保「unit 不触 DB」分层）
- **备选**: 逐符号命名导出（拒绝：83 文件改造后补漏成本高，完整性校验难）；`export type *` 叠加（拒绝：无增量收益）

### DD-004 prismaFactory 注入缝

- **决策**: `BuildAppOptions` 增加 `prismaFactory?: () => PrismaClient`，与既有 `fastifyFactory` 同构；消费点 `options.prismaFactory ?? createPrismaClient`（`defaultPrismaFactory` 即 `src/utils/prisma-factory.ts` 的 `createPrismaClient`，命名统一——R1-M1）；`checkDatabaseConnection(prismaFactory: () => PrismaClient = createPrismaClient)` 显式参数化（默认参数保持 `startServer()` 零改调用）；buildApp 对自己持有的 client 在 `onClose` 调 `$disconnect()`（与 TestDatabase.teardown 的双重断连幂等无害，写入代码注释）
- **§3.3 连带（R1-M1）**: `src/utils/db.ts` 的 `getDb()` 改为**委托 `createPrismaClient()`**（构造模型与生产一致——原「行为不变」措辞与 v7 adapter 模型冲突）；`getDb()` 唯一消费点 `src/core/graph.ts:65` 为 fire-and-forget 回退，生产调用方 `stream-message.service.ts:222/278` 始终显式传 prisma（A 专家核验：近似不可达）→ 代码与 JSDoc 注明「fallback 近似不可达；如需启用须确保 DATABASE_URL 存在」，并登记反模式观察清单
- **理由**: PGlite 内存库无 TCP 监听，`DATABASE_URL` 隐式共享机制物理不可行；注入是 e2e 与生产路径共享同一 client 的唯一通路

### DD-005 TestDatabase → PGlite（含 Stage A 中间态 + createTestPrisma 契约 — R1-C2/M2）

- **决策**: `tests/helpers/test-db.ts` 重构：每实例独占 in-memory PGlite；`setup()` = 新建 PGlite + 回放 DDL（缓存）；`getPrisma()` 返回 `new PrismaClient({ adapter: new PrismaPgAdapter(pglite) })`；**`cleanup()` 保留现有语义**（表数据清理，服务 afterEach 用例间隔离——6 个集成测试实测依赖此语义）；**重构既有 `teardown()`**（现状已存在：test-db.ts:40 `$disconnect` + 恢复 env——R1-min2 勘误）为新语义：`$disconnect` + 关闭 PGlite 实例 + 幂等 `isClosed` 守卫（移除 env 恢复逻辑）；**`cleanup()` 在 `teardown()` 之后调用 = 静默 no-op**（防 afterEach/afterAll 顺序踩坑）；废弃 `getDatabaseUrl()` 与 `process.env.DATABASE_URL` 改写
- **Stage A 中间态规格（R1-M2）**: Stage A（真 PG 阶段）的 TestDatabase = 保留现有 setup 流程（migrate deploy → db push 回退，指向 TEST_DATABASE_URL）+ client 换 `PrismaPg(TEST_DATABASE_URL)`；Stage A→B 的 diff 面**仅限** adapter 与 `setup()` 内部实现（公共签名不变）；M2 门禁按此规格核验
- **createTestPrisma() 契约（R1-C2，BUILD 期逐点审计依据）**:
  - 新增 `tests/helpers/create-test-prisma.ts`（**Stage A 即引入**，内部先用 `PrismaPg(TEST_DATABASE_URL)`；Stage B 仅替换其内部实现为 PGlite——R1-M2 切分修正）：
    - `getSharedTestPrisma(): Promise<PrismaClient>` —— **文件级单例**（同文件多次调用共享同一实例/库）；disconnect 所有权归 `afterAll`/`teardown`
    - `createTestPrisma(): Promise<PrismaClient>` —— 独立实例（仅限真正需要隔离的场景）；调用方负责 `$disconnect()`
    - **异步初始化**：PGlite DDL 回放本质异步 → 返回 Promise；**模块顶层 eager 构造必须惰性化**（顶层 `const prisma = ...` → `let prisma` + `beforeAll(async () => { prisma = await getSharedTestPrisma(); })`）
  - **27 处替换三分类**（不再「统一替换」——R1-C2/B-Major）:
    - (a) 真实 DB 实例（绝大多数）→ `getSharedTestPrisma()`；同文件多实例共享库语义保持（analysis-api.test.ts:13/:103 跨实例硬依赖实证）
    - (b) **vi.mock 拦截实例（3 处：admin-templates-integration:232、admin-templates-import:160、server-api:71）→ 不替换**（处于 mock 生效域内，创建的是 Mock/Fake 实例）
    - (c) 顶层 eager 构造 → beforeAll 惰性化改造（会 loudly fail，不静默错绿）
  - **§4.1 增补判据 #12**: 顶层同步构造 + DDL 就绪时序核验（首查询不落空 schema）；单文件多实例的内存/时长实测
- **8 个 cleanup 调用点**: 保留调用形态（afterEach deleteMany / afterAll 整库丢弃），逐点审计确认语义等价

### DD-006 测试 schema 初始化

- **决策**: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`（v7 参数，已核实）生成 DDL；抽象 `applyTestSchema(pglite)`；缓存文件 `node_modules/.cache/dialog-survey/test-schema.sql`，缓存键 = `schema.prisma` 内容 SHA-256；**vitest `globalSetup` 职责收缩（R1-M6）**：只做生成物存在性守卫（缺失则报错指向 `npm run prisma:generate`，一次自动兜底 generate）；**DDL 生成与缓存逻辑惰性化到 TestDatabase 首次 setup**（避免 smoke/纯 unit 路径 spawn prisma CLI 子进程，保护 §3.6 时长目标与「unit 不触 DB」分层）
- **冷启动口径（R1-min13）**: CI 每次 `npm ci` 后缓存为冷启动（DDL diff 子进程约 2-4s，计入 §3.6 基线）；helper 采用惰性初始化（首个查询时才创建 PGlite + 回放 DDL；从不查询 DB 的文件零成本）
- **衔接契约（#152）**: `applyTestSchema()` 内部当前实现 `fromDatamodel()`；#152 完成后切 `fromMigrations()`（拼接 migrations SQL）——双向链接已写入 #152 DoD
- **零扩展预期**: `@default(uuid())` 为应用层生成，DDL 无 `CREATE EXTENSION`（spike 判据 #1 验证）

### DD-007 分阶段执行与回滚

- **决策**: Stage 0 spike（≤0.5 天，go/no-go，含依赖预装） → Stage A（Prisma 7 + 真 PG 全绿） → Stage B（PGlite 替换 + CI service 移除）；两 Stage 在同一 PR 内以两个里程碑提交推进
- **Stage 范围切分修正（R1-M2/C-M1）**: v7 的 `PrismaClient` 构造强制传 adapter（类型层+运行时）→ 33 处构造点在 Stage A 就必须改造（否则 tsc 无法通过）：
  - **Stage A 含**: `create-test-prisma.ts` helper（PrismaPg 版）+ 27 处切换 + TestDatabase 适配（DD-005 中间态）+ 工厂拆分 + codemod；门禁 = 真 PG 全量绿
  - **Stage B 含**: 仅替换 helper 与 TestDatabase 的内部实现为 PGlite + e2e 注入 + CI service 移除 + globalSetup；**diff 面收缩、更可回滚**
- **回滚点**: M1 依赖预装后 spike no-go → `git restore package*.json package-lock.json && npm ci`（源码未动，零污染）；Stage A 失败 → `git revert` + `npm ci`（schema 未变，零成本）；Stage B 失败 → 保留 Stage A，CI 继续 PG service，PGlite 推迟
- **合并策略**: PR 采用 **merge commit（禁止 squash）**；Stage A 里程碑提交推送后记录 CI run URL 到 sprint outputs，Stage B 前不得 rebase/squash（保真 Stage A 门禁证据）
- **里程碑 CI 载体（grill Q5-A）**: pr.yml 顶部新增 `workflow_dispatch:`（一行）——sprint 分支在 Phase 5 建 PR 前，手动触发全量 job 记录 Stage A（有 PG）/ Stage B（无 PG）的 run URL；对正常 PR 流程零影响
- **no-go 处置（grill Q3-A）**: 判定全 no-go 时 M1 即停，产出 spike 报告，呈报用户三选项决策（Plan B / 推迟 / 仅 Stage A），不自动推进

### DD-008 CI workflows

- **决策**:
  - pr.yml 4 个有 PG service 的 job（unit-tests / integration-tests / coverage / e2e-tests）逐 job 移除 postgres service + `npx prisma db push`；各 job 的 `TEST_DATABASE_URL`/`DATABASE_URL` env（仅服务 PG 的）一并移除
  - **generate 覆盖（grill Q1-A）**: **6 个 job** 显式新增 `npx prisma generate` 步 —— static-analysis（tsc --noEmit）/ unit-tests / integration-tests / coverage / e2e-tests / smoke（npm run smoke 含 type-check）。理由：v7 生成物位于 `src/generated`（.gitignore 排除），checkout 后缺生成物即失败；security-scan 不跑 tsc/vitest，不需要
  - **触发载体（grill Q5-A）**: pr.yml 顶部新增 `workflow_dispatch:`（一行）；sprint 分支里程碑提交推送后手动触发全量 job，作为 Stage A/B 门禁证据载体
  - publish.yml 同步对齐：移除 postgres service + db push；**清理 `secrets.DATABASE_URL` env（含测试 env 段——R1-min5）**；**并在 `npm run test:coverage` 与 `npm run build` 之前新增 `npx prisma generate` 步**（v7 下 db push 不再自动 generate，且生成物不入库）
  - **node 版本单一来源（R1-min9）**: 各 job `setup-node` 改用 `node-version-file: '.nvmrc'`（DD-009 加入 20.19），engines / .nvmrc / CI 三者同源
- **generate 的 env 注意**: `prisma.config.ts` 的 `env("DATABASE_URL")` 在 generate 阶段是否强制校验尚未确认 → spike 判据 #8 验证；若需，CI 各 job 与 Dockerfile builder 的 generate 步补 dummy env
- **保持不动**: coverage job 的 `if: always()`（#150 范围）；test 执行命令与 reporter

### DD-009 发布链路适配

| 位置 | 变更 |
|------|------|
| Dockerfile | builder 保持 `npm ci --ignore-scripts` → `npx prisma generate` → `npm run build`；**runner 阶段增加 COPY `prisma.config.ts`**（容器内 db push 场景） |
| scripts/deploy.sh | Phase 4-8 的 generate/db push 保留（v7 需显式 generate）；`.env` 加载职责移交 prisma.config.ts（dotenv 已是依赖）；Node 最低版本校验同步 20.19（**semver 口径，非 major-only——R1-min11**） |
| scripts/cli.mjs | 移除 `npx prisma generate` 步骤（发布包交付已编译 client）；保留 `db push`，CLI 版本 pin `prisma@7.10.0`；**三项修复（R1-C1/C-M2）**: (a) `filesToCopy` += `prisma.config.ts`（cli.mjs:655-662 为显式白名单，仅加进 package.json `files` 不够）；(b) `verifyInstallation.requiredFiles` += `prisma.config.ts`；(c) `db push` 的自动 generate 行为按 spike **#11** 核验——若默认生成则加 `--no-generate`（防写入安装目录）；`checkNodeVersion` 升级为 20.19 比较（R1-min4） |
| publish.yml | 移除 postgres service + db push（测试链路与 pr.yml 对齐） |
| package.json | `files` += `prisma.config.ts`；`allowScripts` 移除 Prisma 5 键名（`@prisma/engines@5.22.0`/`@prisma/client@5.22.0`/`prisma@5.22.0`），保留 esbuild/biome；新增 `"prisma:generate": "prisma generate"`；**不添加 postinstall**（消费者全局安装时 devDeps 不存在会失败——关键决策，cli.mjs 交付编译产物） |
| engines | `>=20.19.0`；deploy.sh 与 cli.mjs 同步为 20.19 比较；**加入 `.nvmrc`（20.19）**；CI 用 `node-version-file`（DD-008，R1-min9） |

### DD-010 连接池与生产行为基线

- **决策**: 生产 `defaultPrismaFactory` 显式配置 `PrismaPg({ connectionString, connectionTimeoutMillis, ... })` 对齐 v6 语义（pg driver 默认无 timeout，v6 为 5s）；SSL 行为按部署环境显式声明（不依赖 v6 的宽松默认）
- **理由**: v7 driver adapter 连接池默认值变化是官方标注的高风险点

### DD-011 工具链排除

- `biome.json` 三处（files.ignore / linter.ignore / formatter.ignore）加 `src/generated`
- `vitest.config.ts` `coverage.exclude` 加 `src/generated/**`（防覆盖率坍塌；B 专家核验口径无争议）
- `.gitignore` 加 `src/generated/`；DDL 缓存目录（node_modules/.cache）天然被忽略
- tsconfig **不排除**生成目录（DD-002）
- **architecture.yaml（R1-M5）**: 声明新模块归属 —— `src/utils/prisma-client.ts` 对 `src/generated` 的依赖（登记为 utils 允许依赖或新增 generated 层标注）+ `prisma-factory.ts` 归 utils 层；纳入 AC#7

### DD-012 e2e 策略（主方案 X + 降级 Y/Y'/Y''）

- **主方案 X（默认）**: e2e 全 PGlite 化 —— `e2e-server.ts` 以 `buildApp({ prismaFactory: () => testDb.getPrisma() })` 注入；`npm test`（含 e2e）无 PG
- **降级 Y（触发条件见 §4.2 映射表）**: e2e job 保留 postgres service；`npm test` 排除 e2e；**连锁路径补齐（R1-M7）**: coverage job（pr.yml 全量含 e2e）与 publish.yml `test:coverage` 同步保留 postgres service（或排除 e2e——二选一在触发时按覆盖率基线决策并记录）；**触发时须正式修订 AC#4/#5 并重新基线**（记录到 sprint decisions）
- **Y'（仅 Windows 单平台失败）**: CI 走 PGlite；本地 Windows 保留 PG 可选路径，AC#3 证据口径修订
- **Y''（第三备选，R1-min14）**: PGlite 官方 `pglite-socket` 暴露 PG wire 协议端口，可继续走 `@prisma/adapter-pg` + DATABASE_URL 形态而无需 injection（覆盖「注入缝改造受阻但 PGlite 本身可用」场景）；代价：多一个 socket 进程/端口、Windows 兼容未知——记录为备选，不作默认
- `cli-install.e2e.test.ts` 为子进程模型且用例不触 DB（Stage 0 记录判断依据），不受注入影响

---

## 3. 详细设计

### 3.1 依赖变更清单

```diff
 dependencies:
-  "@prisma/adapter-pg": "^5.22.0"
-  "@prisma/client": "5.22.0"
+  "@prisma/adapter-pg": "7.10.0"
+  "@prisma/client": "7.10.0"
 devDependencies:
-  "prisma": "5.22.0"
+  "prisma": "7.10.0"
+  "@electric-sql/pglite": "0.5.8"
+  "pglite-prisma-adapter": "0.7.2"
```

`dotenv@^17.3.1`、`pg@^8.20.0` 已存在，复用。

### 3.2 schema 与 prisma.config.ts

- `prisma/schema.prisma`: datasource `url` 移出（v7 由 config 接管），generator 按 DD-002
- 新增项目根 `prisma.config.ts`: `import "dotenv/config"` + `defineConfig({ schema, migrations: { path: "prisma/migrations" }, datasource: { url: env("DATABASE_URL") } })`

### 3.3 生产路径改造点

| 文件 | 改造 |
|------|------|
| `src/utils/prisma-client.ts` | 新建**纯符号门面**（DD-003，无副作用，不承载构造逻辑） |
| `src/utils/prisma-factory.ts` | 新建**唯一生产构造点** `createPrismaClient()`（DD-003/DD-004/DD-010） |
| `src/utils/db.ts` | `getDb()` 委托 `createPrismaClient()`（构造模型与生产一致）；JSDoc 注明 fallback 近似不可达（R1-M1） |
| `src/server.ts` | `BuildAppOptions.prismaFactory`；`checkDatabaseConnection` 参数化；`buildApp` 消费工厂；`$disconnect` 所有权注释 |
| `prisma/seed-satisfaction-survey.ts`、`prisma/seed-test-interview.ts`、`scripts/fix-max-followups.ts` | import 改门面；client 经 `createPrismaClient()`（生产工厂）创建；**注（R1-min10）**: seeds 打进发布包（files 含 `prisma/`）但相对门面路径在包内不可解析 → 明确「seeds 仅 dev 场景（源码树 + tsx）可用」 |

### 3.4 codemod 规则（83 文件）

- `@prisma/client` → 相对门面路径（带 `.js`）：按文件所在目录计算相对路径（src `../utils/prisma-client.js`、tests `../src/utils/prisma-client.js`、prisma/scripts 同理）
- 7 个 `vi.mock` 文件：mock 目标改门面路径；工厂采用 **partial mock 模式**：
  `vi.mock('…/prisma-client.js', async (importOriginal) => ({ ...(await importOriginal()), PrismaClient: MockPrismaClient }))` —— 真实枚举 + mock client，一次解决「工厂缺枚举」问题
- 清单文件：`tests/db.test.ts`、`health-api.test.ts`、`security.test.ts`、`server-api.test.ts`、`server-lifecycle.test.ts`、`admin-templates-integration.test.ts`、`admin-templates-import.test.ts`

### 3.5 测试基础设施

- `tests/helpers/test-db.ts`: 按 DD-005 重构（保留 `setup/getPrisma/cleanup` 公共签名；**重构既有 `teardown`**——非新增）
- `tests/helpers/create-test-prisma.ts`: 新建（DD-005 契约：`getSharedTestPrisma` 文件级单例 + `createTestPrisma` 独立实例；**Stage A 即引入**）
- `tests/helpers/global-setup.ts`: 新建（DD-006：只做生成物守卫）
- `tests/helpers/test-server.ts`: **仅 import codemod**（createTestServer 直用 testDb.getPrisma()，不经 buildApp，无需注入改造——R1-min3）
- `vitest.config.ts`: `globalSetup` 接入 + `coverage.exclude` 加 `src/generated/**`
- 27 处直接实例化 → **三分类替换**（DD-005）；逐点审计
- `tests/e2e/helpers/e2e-server.ts`: 按 DD-012 注入

### 3.6 非功能基线与目标

| 指标 | 基线采集 | 目标 |
|------|---------|------|
| integration-tests job 时长 | 变更前最近 3 次 CI run 均值 | ≤ 基线 |
| 本地 `vitest run` 总时长 | 变更前本机实测 | ≤ 基线 ×1.2（**软目标，grill Q4-A**：超出先自动优化 —— maxWorkers / 实例复用 / DDL 缓存命中；仍不达标则记录根因 + 呈报用户确认收口，不阻塞） |
| `TestDatabase.setup()` | — | p95 ≤ 2s（**冷启动为主口径**；CI 冷启动含 DDL diff 子进程 2-4s 单独记录——R1-min13） |
| CI 内存峰值 | — | **硬判据（R2-B）**: 全量无 OOM；否则显式配置 maxWorkers 后复跑通过 |

---

## 4. Stage 0 Spike 协议（≤0.5 天）

### 4.1 go/no-go 判据

| # | 判据 | 方法 | go 标准 |
|---|------|------|---------|
| 0 | 适配器兼容性（R2-C） | `pglite-prisma-adapter@0.7.2` peerDeps 兼容 `@prisma/client ^7`；`npm ls` 无 peer 警告 | 无警告 |
| 1 | DDL 生成与回放 | `migrate diff --from-empty --to-schema … --script` → PGlite exec | 成功、无 CREATE EXTENSION |
| 2 | 全 schema 特性 | **10 model**（R1-min1 勘误：含 AuditLog/ApiKey）/ 6 enum / String[]×3 / Json×8 / uuid / 复合索引 CRUD + relation | 全部通过 |
| 3 | 交互式 `$transaction` | 嵌套/回滚；对齐 5 处生产用法（interview-state.repository:44,159、interview-plan-members.service:126,204、api/plans.ts:512） | 语义与真 PG 一致 |
| 4 | `$queryRaw` tagged template | server.ts:70、api/health.ts:28 形态 | 通过 |
| 5 | P2002 唯一约束冲突错误码 | 与真 PG 行为比对 | 一致 |
| 6 | Fastify 层**混合负载**（R2 修正 + R1-M3）：20 并发 HTTP 请求（多普通请求 + 长事务并发混合）打到共享 PGlite | 压测断言 | 无死锁/数据错乱 |
| 6b | 并发交互式事务（R2-C） | 双 `$transaction` 同行乐观锁更新（复现 interview-state 乐观锁） | 一方冲突、一方成功（非串行化假绿/交错假红） |
| 7 | 双平台 | Windows 本机 + ubuntu-latest | 均通过 |
| 8 | generate 阶段 env 校验（grill 默认项） | 无 `DATABASE_URL` 环境（模拟 Dockerfile builder / CI）跑 `npx prisma generate`；观察 `prisma.config.ts` 的 `env()` 行为 | 明确结论：无 env 可跑 **或** 需 dummy env（记入 CI + Dockerfile 预案） |
| 9 | 生成物在 strict tsconfig 下编译（R1-M3） | 临时提交生成物 + `tsc --noEmit`（**strict 严格项全集**，非仅 EOPT/isolatedModules）+ 门面 `export *` 对 DD-003 符号清单逐项可用性 | 零错误 + 符号完整 |
| 10 | 生产 adapter 路径（R1-M3） | bare `createPrismaClient()`（DD-010 配置）连真 PG：`PrismaPg` 合法性 + 池 / `connectionTimeoutMillis` / SSL 行为 | 与 v6 行为对齐，无回归 |
| 11 | 全新安装场景（R1-M3 / 收口 C1） | 无 devDeps 环境（`npm pack` 产物解包 + 仅生产 deps）`npx prisma@7.10.0` 加载 `prisma.config.ts` 可解析性（defineConfig 运行时 import vs type-only import vs 纯对象三形态）+ `db push` 自动 generate 行为 | 结论定案：config 写法 + 是否需 `--no-generate`（回填 DD-009） |
| 12 | createTestPrisma 时序（R1-C2） | 顶层同步构造 + DDL 就绪时序（首查询不落空 schema）；单文件多实例内存 / 时长实测 | 无 schema 落空；内存 / 时长符合 §3.6 |

### 4.2 判据 → 结论映射表（决策人：用户 / sprint owner）

| 失败判据 | 结论 |
|---------|------|
| #0 / #1 / #2 | 全 no-go → 仅执行 Stage A；记录决策，评估 Plan B 或推迟 |
| #3 / #5 | 集成测试核心语义不可行 → 全 no-go（仅 Stage A） |
| 仅 #6 / #6b | 触发降级预案 Y（e2e 保留 PG service + 修订 AC） |
| 仅 #7（Windows） | 触发 Y'（CI PGlite、本机保留 PG 可选） |
| 仅 #8 | 非 no-go：按结论在 CI / Dockerfile 的 generate 步补 dummy env 即可 |
| #9 | 非 no-go：Stage A 内修复（generator 选项 / tsconfig 豁免），修后重验 |
| #10 | 生产路径回归 → 呈报决策（调整 DD-010 配置或推迟 Stage B） |
| #11 | 非 no-go：按结论落地 prisma.config.ts 写法与 cli.mjs `--no-generate`（回填 DD-009） |
| #12 | 非 no-go：helper 契约调整（惰性化范围 / 共享策略修订） |

**no-go 处置（grill Q3-A）**: 全 no-go 判定成立时 M1 即停 —— 产出 spike 报告，呈报用户三选项决策（Plan B / 推迟 / 仅 Stage A），不自动推进。

### 4.3 执行载体（grill Q2-A / Q6-A）

- **环境**: 主 worktree 先做依赖预装（package.json → v7 + pglite，`npm install`）→ **预装后立即 `npm ls` 检查零 peer 警告（R1-min8 前置拦截：有警告先处置再跑 spike）** → 跑 spike；no-go 时 `git restore package*.json package-lock.json && npm ci` 零污染回滚（源码未动）
- **脚本**: `tools/spike/prisma7-pglite-spike.mjs`（纯 node 可重跑工具，**永久保留** —— 未来 Prisma 8 / 适配器升级复检复用）
- **超时口径（R1-min8 / C）**: ≤0.5 天为「预装 + 双平台闭环」总预算；预装或 CI 排队超预算即按 no-go 处理（呈报，不无限等待）
- **双平台**: 本机 Windows 先跑 → 推 sprint 分支 → 触发 `.github/workflows/spike-prisma7.yml`（`workflow_dispatch` + `push` 的 spike paths 过滤双触发——R1-min15，**永久保留**）在 ubuntu-latest 复跑同一脚本；本地跑通后即可异步等 CI 结果，缩短关键路径
- **retry 观察（R1-min15）**: 记录 `retry:1` 在 PGlite 用例上的触发次数（spike #6/#6b 与 Stage B 后全量）；若 retry 掩盖真实失败（同一用例反复重试才绿）→ 对 PGlite 用例单独评估 `retry:0`，结论记入 spike 报告

产出：`.sprint-state/phase-outputs/stage0-spike-report.md`（判据逐项结果 + 结论）。

---

## 5. 采纳清单落实

### 5.1 R2 采纳清单（对应 delphi-r2-report.md §R2 非阻塞采纳）

| # | 项 | 落实位置 |
|---|-----|---------|
| 1 | 命名空间 re-export 策略显式化 | DD-003（选 `export *` + 契约测试） |
| 2 | spike #0 / #6b / #6 修正 | §4.1 |
| 3 | cleanup() 粒度定义 | DD-005 |
| 4 | 内存硬判据 | §3.6 |
| 5 | 降级 Y 映射表 + 决策人 | §4.2 |
| 6 | Stage A 门禁证据固化 | DD-007 |
| 7 | Plan B 层级纠正（`embedded-postgres` = PGlite 替代，代价：postinstall 二进制 + allowScripts） | §7 风险表 |
| 8 | getDb() / checkDatabaseConnection 适配 | DD-004、§3.3 |
| 9 | 杂项勘误（Json×8、prisma.config.ts 根级、Dockerfile runner COPY、node pin、冒烟拆分、cli-install 依据） | DD-009、§3.6、§6 |
| 10 | Stage A/B 合并策略 | DD-007 |

### 5.2 batch-grill-me 决策落实（DR-002）

| Q | 决策 | 落实位置 |
|---|------|---------|
| Q1 | 6 个 CI job 显式 generate | DD-008 |
| Q2 | spike 脚本 + 手动 workflow 载体 | §4.3 |
| Q3 | no-go 即停呈报决策 | §4.2 / DD-007 |
| Q4 | 性能软目标（优化→记录→确认收口） | §3.6 |
| Q5 | pr.yml 加 `workflow_dispatch:` | DD-007 / DD-008 |
| Q6 | 主树依赖预装 + 零污染回滚 | §4.3 / DD-007 / M1 |

---

## 6. 验收标准（最终）

1. Prisma 7.10.0 升级完成（package.json diff 为证）；`prisma generate` 通过；`tsc --noEmit` 零错误
2. PGlite 后端集成：TestDatabase / createTestPrisma 全部走 PGlite；27 处测试实例化替换完毕
3. **全部测试**（unit + 6 集成 + 11 e2e，~100 文件）在无 PG 环境全绿（Windows 本机证据 + CI 证据）
4. pr.yml 4 个 job + publish.yml 移除 postgres service 与 db push（逐 job 硬性验收）；**6 个 job 显式 generate 步就位**（DD-008 / Q1-A）
5. 本地 `npx vitest run`（口径补注：`npm test`＝watch 模式，验收以 run 模式计；含 e2e）无 PG 全绿；生产回归：`npm run build` + 无源码树冒烟（拆分为 (a) 无 PG 启动断言可进 CI / (b) `/health db ok` 本机或 compose 验收）+ `npm pack --dry-run` 产物含编译后 client + **docker build 端到端（R1-M4：Dockerfile 恰为改动面——alpine/musl × v7 WASM × `--ignore-scripts`；环境允许则必测，不可执行需记录理由 + 替代证据）**
6. Stage 0 spike 报告含 #0–#12 全部判据结果；非功能基线与回滚策略文档化；内存硬判据通过
7. 文档与架构更新：AGENTS.md（PG 表述/命令/CI job 数）、docs/setup-guide.md、README.md、README.zh-CN.md、DEPLOY.md、**architecture.yaml（DD-011：门面/工厂模块依赖声明——R1-M5）**

---

## 7. 风险与回滚

| 风险 | 等级 | 缓解 | 回滚 |
|------|------|------|------|
| adapter 0.x 与 Prisma 7.10 不兼容 | 高 | spike #0/#1 前置拦截；精确 pin | 全 no-go → 仅 Stage A / Plan B |
| PGlite 并发事务语义偏差 | 中 | spike #6b | 降级 Y |
| tsc 编译生成物报错（**strict 严格项全集**——非仅 EOPT/isolatedModules，R1-min7） | 中 | spike #9 验证零错误 | Stage A 内修复（改 generator 选项/lint 豁免） |
| 内存峰值 OOM | 中 | §3.6 硬判据 | 显式 maxWorkers |
| cli.mjs 全新安装场景断裂 | 中 | M4 验证；CLI pin | 回退 generate 步骤（交付 .ts 生成物并作为 files 内容） |
| Plan B（`embedded-postgres`） | — | Stage 0/B 受阻时启用；代价：postinstall 下载二进制、需恢复 `allowScripts` 键、**与 `--ignore-scripts`（CI / Dockerfile / deploy.sh 三处）冲突需逐处复查（R1-min15）**、非零外部进程 | — |

---

## 8. 实施序列（里程碑 → to-issues 切片输入）

| 里程碑 | 内容 | 门禁 |
|--------|------|------|
| M1 | 依赖预装提交（v7 + pglite，可回滚）+ Stage 0 spike + 报告 | §4.1 判据 #0-#12 全绿（或按 §4.2 收敛）；no-go 即停呈报（Q3-A） |
| M2 | Stage A：依赖/generator/config/门面/codemod/工厂改造 | 真 PG 全量测试绿 + CI run URL 记录 |
| M3 | Stage B：TestDatabase PGlite + globalSetup + 27+7 处 + e2e + CI 移除 | 无 PG 全量绿（本机 + CI）+ 内存判据 |
| M4 | 生产回归：build + 无源码树冒烟 + npm pack + 安装场景 + docker build（R1-M4） | 验收 #5 |
| M5 | 文档更新 + CHANGELOG | 验收 #7 |
| PR | merge commit 合并（禁 squash） | SHIP 阶段 |

---

## 9. 决策完备性自查

- 无待定决策项；§4.2 决策人已指定（用户）；grill 两轮 frontier 已清空（Q1-Q6 全确认）
- 所有 R2 采纳项均有明确落点（§5.1）；所有 grill 决策均有落脚（§5.2）
- 所有文件改造点均定位到具体文件/行号锚点（§3）
- 回滚路径可执行（DD-007 / §7）：M1 依赖预装回滚、Stage A/B 回滚、Plan B 预案三层齐备
- Delphi R1（2 Critical / 7 Major / ~15 Minor）修复已全部落实（映射与回填核验见 `round1-design-digest.md` §二）；Round 2 复审范围 = 映射落实核验 + 修复不引入新问题
