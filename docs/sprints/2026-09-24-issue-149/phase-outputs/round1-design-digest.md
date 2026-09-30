# Delphi 设计评审 Round 1 — 匿名汇总与修复映射（sprint-20260924-15 / Issue #149）

- 评审对象: `.sprint-state/phase-outputs/design-doc.md`（经用户批准 + grill Q1-Q6 修订后的版本）
- 模式: delphi-review design（3 专家：A=architecture / B=technical / C=feasibility）
- Round 1 裁决: A=REQUEST_CHANGES(0.80) · B=APPROVED(0.93) · C=REQUEST_CHANGES(0.86) → 聚合 0.86 < 0.90 → 迭代
- 三专家共执行约 50 项代码级事实抽查（大量行号级锚点命中）

## 一、Round 1 问题合并清单（去重后）

### Critical（2 项）
| # | 提出 | 问题 | 
|---|------|------|
| C1 | A（C 同向 Major） | **cli.mjs 发布安装链路断裂**：`filesToCopy`/`verifyInstallation` 缺 `prisma.config.ts`（cli.mjs:655-662/352-363 为显式白名单）；v7 下 schema 已移出 url 且 CLI 不再自动加载 .env → 安装目录 `db push` 无 url 来源必失败；`db push` 的自动 generate 行为需核验（若默认生成需 `--no-generate` 防污染安装目录） |
| C2 | A（B/C 同向 Major） | **createTestPrisma() 契约未定义**：同步/异步未定 vs 27 处大量模块顶层 eager 构造（analysis-api:13/:103 等）；「每次调用独立实例」与现状「同文件多实例共享同一物理库」语义冲突（analysis-api 跨实例硬依赖）；mock 拦截实例（admin-templates-integration:232 等 3 处）不应替换；disconnect 所有权缺失；直接冲击 §3.6 内存/时长判据 |

### Major（合并后 7 项）
| # | 提出 | 问题 |
|---|------|------|
| M1 | A | 生产 client 构造所有权未闭合：`defaultPrismaFactory` vs `createPrismaClient()` 两名一物无归属；纯 re-export 门面无法承载工厂（需 adapter/env/池）；db.ts「行为不变」与 v7 adapter 模型冲突；R2 采纳项 8 未落实 |
| M2 | A（C 同向） | **Stage A 中间态空白 + 切分错位**：C 核实 v7 的 PrismaClient 构造强制传 adapter → 27 处 + TestDatabase 在 Stage A 就无法通过 tsc，不能留到 Stage B；Stage A 时 TestDatabase 如何接线真 PG 无规格 → M2 门禁不可核验 |
| M3 | A（C 同向） | spike 判据缺口：无「生成物在 strict tsconfig 下 tsc 零错误」判据（§7 却引用之）；无生产 adapter 路径判据（DD-010 自评高风险区零验证）；无全新安装场景判据；#6 需混合负载增强（多普通请求 + 长事务并发） |
| M4 | A | 需求 v2 AC#5 的 docker build 验证被静默删除（Dockerfile 恰是本次改动面：alpine/musl × v7 WASM × --ignore-scripts） |
| M5 | A | 需求 v2 [R1-M] 明列的 architecture.yaml 声明在设计中缺失 |
| M6 | A | globalSetup 职责过重：DDL 缓存管理耦合进 smoke/纯 unit 路径（spawn prisma CLI），与 §3.6 时长目标及既有测试分层相悖 |
| M7 | B | 降级 Y 未覆盖 coverage job（pr.yml:207 全量含 e2e）与 publish.yml 的连锁影响 |

### Minor（合并去重后 ~15 项）
1. 「9 model」实为 10（含 AuditLog/ApiKey）——A/B/C 三方共识勘误
2. DD-005「新增 teardown()」措辞错误：已存在 teardown()（test-db.ts:40）——三方共识，应改「重构」并定义 cleanup-after-teardown 行为
3. tests/helpers/test-server.ts 未列 §3.5 改造清单（仅 import 改造）
4. cli.mjs `MIN_NODE_MAJOR=20` 未同步 20.19
5. publish.yml 移除 service 后 `secrets.DATABASE_URL` env 残留处置未写明
6. facade 契约测试「类型符号断言」机制未指明（expectTypeOf / test-d.ts）
7. §7 风险表 tsconfig 报错措辞应收窄为「严格项全集」
8. M1 预装后应立即检查 `npm ls` 零 peer 警告（前置拦截）
9. `.nvmrc` 加入后 CI 用 `node-version-file` 单一来源
10. seeds 在发布包内不可解析（prisma/ 在 files 内但 src/utils 不在）→ 明确「seeds 仅 dev 场景」
11. deploy.sh 20.19 校验口径需具体（现为 major-only 比较）
12. 门面 import 无副作用断言（保「unit 不触 DB」分层）
13. DDL 缓存冷启动口径（CI 每次 npm ci 冷启动 2-4s 计入基线）+ helper 惰性初始化
14. PGlite 官方 `pglite-socket` 可作第三降级路径记录（暴露 wire 协议 → 保留 PG service 形态）
15. retry:1 对 PGlite 用例隔离影响的观察记录；Plan B 与 --ignore-scripts 冲突代价补记；`ecosystem.config.cjs` 路径疑点、coverage thresholds 缺失（实为既有问题）记 emergent

## 二、修复映射（v3 修订如何回应）——已回填（2026-09-24 对照 design-doc.md v3 逐项核验）

| R1 问题 | v3 处置 |
|---------|---------|
| C1 | DD-009 cli.mjs 行补三项：filesToCopy += prisma.config.ts、verifyInstallation.requiredFiles += 同、db push 行为按 spike 验证（若自动 generate 则 --no-generate）；spike 新增 #11（无 devDep 环境 npx prisma@7.10.0 加载 prisma.config.ts 的可解析性：defineConfig import vs type-only import vs 纯对象） |
| C2 | DD-005 定义 createTestPrisma() 契约：异步文件级单例（getSharedTestPrisma）+ 独立实例双形态；替换规则三分类（真实 DB 实例/mock 拦截实例不替换/顶层 eager 构造改 beforeAll）；disconnect 所有权归 afterAll/teardown；§3.6 增补判据 |
| M1 | 拆分两模块：`src/utils/prisma-client.ts`（纯符号缝，无副作用）+ `src/utils/prisma-factory.ts`（唯一生产构造点 `createPrismaClient()`，DD-004 defaultPrismaFactory 统一改名）；db.ts getDb() 委托工厂 + 注明回退不可达 |
| M2 | DD-007/DD-005/§8 修订 Stage 切分：Stage A 即引入 `tests/helpers/create-test-prisma.ts`（内部 PrismaPg + TEST_DATABASE_URL）并完成 27 处切换 + TestDatabase 适配；Stage B 仅把 helper 与 TestDatabase 内部实现替换为 PGlite（diff 面收缩）；补 Stage A TestDatabase 中间态规格 |
| M3 | §4.1 新增 #9（strict tsconfig 下 tsc 零错误 + 门面 re-export 完整性）、#10（生产 adapter 路径：bare client 合法性 + PrismaPg 连真 PG + 池/timeout/SSL）、#11（全新安装场景）；#6 修订为混合负载；§4.2 补映射 |
| M4 | §6 AC#5 补回 docker build（如环境允许；不可执行则记录理由+替代证据）；§8 M4 增列 |
| M5 | DD-011 增 architecture.yaml 行 + AC#7 纳入 |
| M6 | DD-006 修订：globalSetup 只做生成物守卫；DDL 生成/缓存惰性化到 TestDatabase 首次 setup |
| M7 | DD-012 补 Y 形态下 coverage job / publish.yml 处置 |
| Minor 1-15 | 逐项并入 design-doc v3（详见修订后文档） |

## 三、Round 2 复审要求（对三专家）
1. 核验上述映射是否已全部落实到位（对照修订后 design-doc.md）
2. 核验修复本身是否引入新问题
3. C1/C2 是否 resolved；M1-M7 是否妥善处置
4. 给出 R2 裁决与置信度
