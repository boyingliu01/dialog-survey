# 需求评审输入：Issue #149 — Prisma 7 + PGlite 集成

## 原始需求（Issue #149 全文）

**标题**: feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖

**背景**:
当前集成测试（`tests/*.integration.test.ts`）需要真实 PostgreSQL 实例，CI 中通过 Docker service 启动。这导致：
- 本地开发无法直接运行集成测试（需手动启动 PG）
- CI 启动 PG service 增加延迟
- 并发测试可能出现竞态条件

**目标**:
升级到 Prisma 7 + PGlite（嵌入式 PostgreSQL），使集成测试零外部依赖。

**验收标准**:
- [ ] Prisma 升级到 7.x
- [ ] PGlite 作为测试数据库后端集成
- [ ] 所有集成测试通过（无外部 PG 依赖）
- [ ] CI pr.yml 中 integration-tests job 移除 postgres service
- [ ] 本地 npm test 无需手动启动 PG

**参考**: 项目复盘报告 6.2 节：P0 优先级；当前版本：v1.8.5，Prisma 5.22

## 项目现状基线（sprint 侦察数据）

- **版本**: v1.8.9（VERSION 与 package.json 一致）
- **Prisma**: `@prisma/client` 5.22.0（精确 pin）/ `prisma` CLI 5.22.0；`@prisma/adapter-pg` ^5.22.0 已在 dependencies 但代码中未使用
- **技术栈**: Fastify 5 + TypeScript 5.9 + Vitest 4.1 + ESM（`"type": "module"`）+ tsx + Biome 1.9
- **Node**: engines `>=20.0.0`（Prisma 7 要求 >=20.19.0）；CI 用 node 20
- **tsconfig**: moduleResolution: bundler，rootDir "."，outDir dist，include ["src/**/*", "tests/**/*"]
- **构建**: 纯 tsc；生产 `node dist/src/server.js`；Dockerfile 已显式 `npx prisma generate`

### 影响面清单（已审计）

| 类别 | 数量 | 明细 |
|------|------|------|
| `@prisma/client` import 点 | 83 个文件 | src 28、tests ~52、scripts 1、prisma seeds 2 |
| `new PrismaClient()` 实例化 | 33 处 | src/utils/db.ts:13、src/server.ts:66,167、tests 27 处、scripts/fix-max-followups.ts:17、prisma/seed-*.ts 2 处 |
| `vi.mock('@prisma/client')` | ≥2 个测试 | tests/db.test.ts 等 |
| `$transaction` 使用 | ≥15 处 | api/plans.ts、interview-state.repository.ts、interview-plan-members.service.ts、多测试 |
| `$queryRaw/$executeRaw` | ~13 处 | health.ts（SELECT 1）、server.ts 健康检查、多测试 |
| 集成测试文件 | 6 个 `.integration.test.ts` + e2e | conversation-engine、export、interview-plan、interview-state-repository、stream-message、template-repository |
| 测试 helpers | 3 个 | test-db.ts（TestDatabase 类，33 文件注册）、test-server.ts（DI 装配路由）、admin-auth.ts |
| CI jobs 依赖 postgres | 5 个 | unit-tests、integration-tests、coverage（if: always()）、e2e-tests + db push 步骤 |
| E2E server | tests/e2e/helpers/e2e-server.ts | 走 `buildApp()` 生产路径（内部自建 PrismaClient） |

### Prisma 7 关键破坏性变更（来自官方升级指南）

1. 仅发 ESM；Node >= 20.19.0、TS >= 5.4
2. `prisma-client-js` → 新 `prisma-client` generator（Rust-free），**output 字段必填**，client 不再生成到 node_modules
3. 导入路径变化：`@prisma/client` → 生成目录（如 `./generated/prisma/client`）
4. **driver adapter 成为必需**：PG 需 `@prisma/adapter-pg`（PrismaPg）
5. datasource `url` 等移入 `prisma.config.ts`；环境变量不再自动加载（需 dotenv 显式加载）
6. Client middleware（$use）移除（本项目未使用）
7. `migrate dev`/`db push` 不再自动 generate；`--skip-generate` 等 flag 移除
8. 连接池行为变化（pg driver 默认无 timeout，v6 是 5s）；SSL 校验默认收紧
9. migrate diff 参数变化（`--from-url`→`--from-config-datasource` 等）

### 关键可行性调研（npm registry 实测）

- `@prisma/client@7.10.0` / `prisma@7.10.0` 为当前稳定线（8.x 仍在 RC）
- `pglite-prisma-adapter@0.7.2`：peerDeps `@electric-sql/pglite >=0.2.0` + `@prisma/client >= 7.1.0`（兼容 7.10.0）
- `@electric-sql/pglite@0.5.8`
- PGlite 为 in-process WASM PostgreSQL（PG 16 内核），支持 schema 全部特性（enum、String[]、Json、@default(uuid())、复合索引）

### 拟定技术方案（供评审）

1. **依赖升级**: prisma/@prisma/client → 7.10.0；@prisma/adapter-pg → 7.x；新增 devDeps `@electric-sql/pglite` + `pglite-prisma-adapter`
2. **schema.prisma**: generator 改 `prisma-client` + output `../src/generated/prisma`；datasource url 移 prisma.config.ts
3. **新增 prisma.config.ts**（项目根，dotenv 显式加载）
4. **生产 client**: 工厂 `createPrismaClient()` 用 PrismaPg adapter；server.ts、db.ts、seeds、scripts 统一改造
5. **测试 client**: TestDatabase 改造为 PGlite 后端（每实例独立 in-memory DB）；新增 `createTestPrisma()` helper 供 27 处直接实例化的测试使用
6. **测试 schema 初始化**: vitest globalSetup 用 `prisma migrate diff --from-empty --to-schema-datamodel` 动态生成 SQL（缓存文件），PGlite exec 建表（与 #152 的 migrations 规范化解耦）
7. **import 路径**: codemod 批量替换 83 文件 `@prisma/client` → 相对路径 `src/generated/prisma/client.js`（含 vi.mock 路径）
8. **CI**: integration-tests job 移除 postgres service 与 db push 步骤；unit/coverage/e2e 评估同步移除
9. **biome.json**: ignore `src/generated`
10. **engines**: >=20.19.0；package.json 加 `postinstall: prisma generate`

## 评审要求

作为 Delphi Round 1 匿名独立评审，请基于以上材料评审**需求的完整性与合理性**，重点：
1. 需求目标与验收标准是否清晰、可测、无歧义？
2. 拟定的技术方案是否与需求对齐？是否有范围蔓延或缺漏？
3. 是否存在未识别的风险、约束或依赖？（如 PGlite 兼容性、E2E 场景、生产行为变化）
4. 验收标准 5 条是否均可通过客观证据验证？

输出 delphi_expert_result JSON（verdict: APPROVED | REQUEST_CHANGES | REJECTED）。
