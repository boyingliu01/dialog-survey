# prisma-import-inventory — Stage A 审计工件（#149 / DD-005 M-A1）

- **生成时点**: 2026-09-29（BUILD M2 首步，依赖升级后、codemod 首文件改写前）
- **生成方式**: `node .sprint-state/phase-outputs/prisma-codemod.mjs --report`（BUILD 期重新生成，允许设计→BUILD 自然漂移；本工件为 AC#2 唯一审计对象）
- **原始数据**: `.sprint-state/phase-outputs/prisma-import-inventory.json`
- **门面**: `src/utils/prisma-client.ts`（纯 `export *`，DD-003）

## 0. 汇总计数（与设计闭合）

| 指标 | 设计预期 | 实测（本工件） | 状态 |
|------|---------|--------------|------|
| `@prisma/client` import 文件 | 79 | **79** | ✅ 闭合 |
| vi.mock 文件 | 7 | **7** | ✅ 闭合 |
| 构造点总计 | 32 | **32**（测试域 26 + 非测试域 6） | ✅ 闭合 |
| 测试域三分类 | a22 / b3 / c1 | **a22 / b3 / c1** | ✅ 闭合 |
| cleanup 调用点 | 8 | **8**（全部 afterEach） | ✅ 闭合 |
| tsc 基线（codemod 前，R4-T7） | — | **0 错误**（`tsc-codemod-baseline.log`） | 已采集 |

## 1. 目录 → 门面相对路径对照表（codemod 按表执行）

| 目录 | 门面相对路径 | 备注 |
|------|-------------|------|
| `src/`（server.ts） | `./utils/prisma-client.js` | |
| `src/utils/` | `./prisma-client.js` | 同目录 |
| `src/api/`、`src/services/`、`src/repositories/`、`src/core/` | `../utils/prisma-client.js` | |
| `src/core/nodes/` | `../../utils/prisma-client.js` | |
| `tests/` | `../src/utils/prisma-client.js` | |
| `tests/helpers/` | `../../src/utils/prisma-client.js` | |
| `tests/e2e/` | `../../src/utils/prisma-client.js` | |
| `tests/e2e/helpers/` | `../../../src/utils/prisma-client.js` | |
| `prisma/` | `../src/utils/prisma-client.js` | **仅 dev 场景可用（源码树 + tsx）；发布包内相对门面路径不可解析（R4-T5）** |
| `scripts/` | `../src/utils/prisma-client.js` | **仅 dev 场景可用（源码树 + tsx）；发布包内不可解析（R4-T5）** |

排除项：`src/generated/**`（生成代码，其 `@prisma/client/runtime/*` 子路径 import 不动）。

## 2. vi.mock 7 文件（partial-mock 模式，§3.4——手工改写，脚本跳过）

| 文件 | mock 行 | importOriginal 实测锚点（R4-T3） |
|------|--------|-------------------------------|
| `tests/db.test.ts` | 5 | ✅ |
| `tests/health-api.test.ts` | 20 | ✅ |
| `tests/security.test.ts` | 6 | ✅ |
| `tests/server-api.test.ts` | 59 | ✅ |
| `tests/server-lifecycle.test.ts` | 80 | ✅ |
| `tests/admin-templates-integration.test.ts` | 46 | ✅ |
| `tests/admin-templates-import.test.ts` | 45 | ✅ |

模式：`vi.mock('<facade-rel>', async (importOriginal) => ({ ...(await importOriginal()), PrismaClient: MockPrismaClient }))`。

## 3. 测试域 26 构造点三分类（DD-005）

### (a) 22 处 → `getSharedTestPrisma()`（其中顶层 eager 17 处须 beforeAll 惰性化）

| # | 文件:行 | 形态 | 处置 | 勾销 |
|---|---------|------|------|------|
| a1 | `tests/admin-delete.test.ts:16` | eager | beforeAll 惰性化 | ✅ |
| a2 | `tests/admin-templates-extra.test.ts:118` | eager | beforeAll 惰性化 | ✅ |
| a3 | `tests/admin-tree.test.ts:7` | eager | beforeAll 惰性化 | ✅ |
| a4 | `tests/analysis-api.test.ts:13` | eager | beforeAll 惰性化（与 :103 共享库语义保持） | ✅ |
| a5 | `tests/analysis-api.test.ts:103` | lazy | 直接 await（同文件多实例硬依赖） | ✅ |
| a6 | `tests/batch-aggregate-api.test.ts:6` | eager | beforeAll 惰性化 | ✅ |
| a7 | `tests/audit-cleanup.service.test.ts:5` | eager | beforeAll 惰性化 | ✅ |
| a8 | `tests/batch-import.test.ts:44` | eager | beforeAll 惰性化 | ✅ |
| a9 | `tests/dead-letter.test.ts:5` | eager | beforeAll 惰性化 | ✅ |
| a10 | `tests/interview-plan-members-phone.test.ts:47` | eager | beforeAll 惰性化 | ✅ |
| a11 | `tests/interview-repository.test.ts:5` | eager | beforeAll 惰性化 | ✅ |
| a12 | `tests/message-repository.test.ts:5` | eager | beforeAll 惰性化 | ✅ |
| a13 | `tests/plans-api.test.ts:27` | eager | beforeAll 惰性化 | ✅ |
| a14 | `tests/report-api.test.ts:7` | eager | beforeAll 惰性化 | ✅ |
| a15 | `tests/schema-analysis-dimensions.test.ts:4` | eager | beforeAll 惰性化 | ✅ |
| a16 | `tests/template-dimensions-api.test.ts:5` | eager | beforeAll 惰性化 | ✅ |
| a17 | `tests/templates-api.test.ts:15` | eager | beforeAll 惰性化 | ✅ |
| a18 | `tests/workflow-interview-lifecycle.test.ts:142` | eager | beforeAll 惰性化 | ✅ |
| a19 | `tests/admin-shell-csrf.test.ts:30` | lazy | 直接 await | ✅ |
| a20 | `tests/admin-plan-route-csrf.test.ts:100` | lazy | 直接 await | ✅ |
| a21 | `tests/admin-plan-csrf.test.ts:44` | lazy | 直接 await | ✅ |
| a22 | `tests/admin-template-csrf.test.ts:63` | lazy | 直接 await | ✅ |

### (b) 3 处 → 不替换（vi.mock 生效域内；import 统一改写为门面路径）

| # | 文件:行 | 说明 | 勾销 |
|---|---------|------|------|
| b1 | `tests/admin-templates-integration.test.ts:232` | 动态 `await import(门面)` 取 Mock 类 | ✅ |
| b2 | `tests/admin-templates-import.test.ts:160` | 同上 | ✅ |
| b3 | `tests/server-api.test.ts:71` | 同上，**后续细化**：该处 `vi.mock('../src/server.js')` 仅为复刻 `checkDatabaseConnection` 而存在；移除后三例直接覆盖真实实现（含新增「工厂抛错返回 false」守卫例），b 类保留实为 2 处 | ✅ |

### (c) 1 处 → helper 内部重构

| # | 文件:行 | 处置 | 勾销 |
|---|---------|------|------|
| c1 | `tests/helpers/test-db.ts:17` | `new PrismaClient({ adapter: PrismaPg(TEST_DATABASE_URL) })`（Stage A 中间态；Stage B 换 PGlite） | ✅ |

## 4. 非测试域 6 构造点

| # | 文件:行 | 处置 | 勾销 |
|---|---------|------|------|
| n1 | `src/server.ts:66`（checkDatabaseConnection） | 参数化 `prismaFactory = createPrismaClient`（DD-004） | ✅ |
| n2 | `src/server.ts:167`（buildApp） | `options.prismaFactory ?? createPrismaClient`（DD-004） | ✅ |
| n3 | `src/utils/db.ts:13`（getDb） | 委托 `createPrismaClient()`，import 同改门面 | ✅ |
| n4 | `prisma/seed-satisfaction-survey.ts:4` | `createPrismaClient()` | ✅ |
| n5 | `prisma/seed-test-interview.ts:4` | `createPrismaClient()` | ✅ |
| n6 | `scripts/fix-max-followups.ts:17` | `createPrismaClient()` | ✅ |

（新构造点 `src/utils/prisma-factory.ts:24` 为 M1 引入的唯一生产构造点，不属于历史 32。）

## 5. cleanup 调用点 8 处（全部 afterEach；DD-005 v5 T-M2）

| # | 文件:行 | 归属 | 依赖 isClosed 早退？ | 勾销 |
|---|---------|------|---------------------|------|
| 1 | `tests/conversation-engine.integration.test.ts:45` | afterEach | 否 | ✅ |
| 2 | `tests/export.integration.test.ts:67` | afterEach | 否 | ✅ |
| 3 | `tests/e2e/admin-auth.e2e.test.ts:105` | afterEach（finally 内） | 否 | ✅ |
| 4 | `tests/interview-plan.integration.test.ts:52` | afterEach | 否 | ✅ |
| 5 | `tests/e2e/template-lifecycle.e2e.test.ts:26` | afterEach | 否 | ✅ |
| 6 | `tests/interview-state-repository.integration.test.ts:60` | afterEach | 否 | ✅ |
| 7 | `tests/stream-message.integration.test.ts:44` | afterEach | 否 | ✅ |
| 8 | `tests/template-repository.integration.test.ts:29` | afterEach | 否 | ✅ |

结论：现有 8 点均为 afterEach（用例间隔离语义保持，DD-005 语义不变）；`isClosed` 早退守卫为防御性契约（`cleanup()` 首行 `if (this.isClosed) return;`），由单元断言覆盖。

## 6. 中点审计（M-A2，codemod ~50% 时记录）

| 指标 | 值 | 时点 |
|------|-----|------|
| ① 勾销率（本工件逐点） | import 改写 79/79 + vi.mock 7/7（脚本化单次完成，无有意义的 50% 观测点）；构造点变换在 A2 批一次完成 26/26 | 2026-09-29 import codemod 完成时 |
| ② tsc 错误计数趋势（相对基线 0） | 0（codemod 前，tsc-codemod-baseline.log）→ 29（import codemod 后，tsc-codemod-peak.log，全为 TS2554）→ 13（A2 变换后，控制台观测未留档）→ 0（非测试域 6 + b 站点 cast 后，tsc-a22-final.log） | 2026-09-29 A2 完成后 |

## 7. 最终勾销状态（Stage A 完成时记录，2026-09-29）

| 类别 | 勾销数 / 总数 | 证据 |
|------|--------------|------|
| (a) 22 | 22/22 ✅ | apply-a22.mjs 逐点改写；真 PG 全量 116/116 文件、1260 通过（stageA-full-suite-ci-parity.log） |
| (b) 3 | 3/3 ✅ | 保留 mock 域内构造 + 无参 ctor cast（TS2749→InstanceType 修正）；其中 server-api.test.ts 的 server.js mock 在评审后移除，改为直测真实 checkDatabaseConnection（b 类实际保留 2 处）；全量绿 |
| (c) 1 | 1/1 ✅ | TestDatabase Stage A 适配器形态（真 PG + PrismaPg 5s 超时），Stage B 换 PGlite |
| 非测试域 6 | 6/6 ✅ | n1-n3 DD-004 缝（prismaFactory/参数化/委托）；n4-n6 createPrismaClient()；tsc 0 错误（tsc-a22-final.log） |
| vi.mock 7 | 7/7 ✅ | §2 表锚点行；partial-mock 手工改写后对应测试在全量绿中通过 |
| cleanup 8 | 8/8 ✅ | 全为 afterEach（§5 表）；isClosed 早退契约由 tests/test-database.test.ts 覆盖 |
