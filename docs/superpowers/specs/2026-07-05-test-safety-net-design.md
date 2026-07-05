# 自动化测试防护网设计方案

> 创建日期: 2026-07-05
> 状态: DRAFT (待用户审阅)
> 关联: AGENTS.md, vitest.config.ts, .github/workflows/publish.yml

## 背景

本项目的端到端人工验收测试已进行两周，频繁发现回归问题。尽管对每个发现问题都补充了自动化测试，仍出现反复。

近期项目经历了大量变更，在重新启动人工验收测试之前，需要建设自动化测试防护网，用自动化手段（静态检查、自动化测试、浏览器无头测试等）最大程度保障项目质量。

## 目标

- **一键预验收**：运行 `npm run smoke` 即可快速判断能否启动人工验收
- **CI 自动阻断**：每个 PR 自动跑全部质量门禁，回归即阻断
- **全量 UI E2E**：Playwright 覆盖 Admin 全量页面和 CRUD 交互
- **零外部依赖测试**：PGlite 内存数据库替代真实 PostgreSQL 跑集成测试

## 技术选型

### PGlite 方案: `prisma-pglite-bridge`（推荐）

| 方案 | Prisma 要求 | 生产代码改动 | 测试代码改动 | 原理 |
|------|------------|------------|------------|------|
| `pglite-prisma-adapter` | Prisma 7+ | 大（schema/import/config 全改） | 大 | 官方 driver adapter |
| **`prisma-pglite-bridge`** | **Prisma 7+** | **零改动** | **小（仅 test helper）** | **劫持 pg.Client TCP socket → Duplex stream → PGlite WASM** |

**选择 `prisma-pglite-bridge` 的理由：**
- 生产代码完全无感知——`new PrismaClient({ adapter: bridge.adapter })` 即可
- Prisma import 路径不变（`@prisma/client` 不走本地 generated）
- 性能优于原生 Postgres（M3 Max: 0.34ms p50 vs 0.51ms）
- 支持 snapshotDb()/resetDb() 模式——beforeEach 毫秒级恢复测试状态

### Prisma 7 升级范围（最小化）

```prisma
// schema.prisma 改动仅 1 行
generator client {
  provider = "prisma-client"  // prisma-client-js → prisma-client
}
datasource db {
  provider = "postgresql"
}
// url = env("DATABASE_URL")  → 移到 prisma.config.ts
```

新增 `prisma.config.ts`:
```typescript
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

生产代码除了 `db/index.ts`（统一 PrismaClient 工厂）和 `src/server.ts` 的 DI 初始化外，无需改动。

### 历史升级失败分析

之前尝试（commit `27ac83d`）失败的核心原因：
1. schema 大改——`provider = "prisma-client"` 配合 `output = "../src/generated/prisma/client"`，导致所有 import 路径改变
2. 新增了 `generated/prisma/client/` 目录（需要 git 管理）
3. 当时项目不稳定（97 个已有测试失败）

本次使用 `prisma-pglite-bridge` 不需要改 import 路径，风险大幅降低。

## 执行计划（4 周）

### Phase 0: Prisma 7 升级 + PGlite 集成（Week 1）

**Step 0.1**: 升级依赖
- `prisma@^7.6.0`, `@prisma/client@^7.6.0`, `@prisma/adapter-pg@^7.6.0`
- 新增 `prisma-pglite-bridge`, `@electric-sql/pglite` (devDependencies)

**Step 0.2**: 创建 `prisma.config.ts`（Prisma 7 必须）

**Step 0.3**: 更新 `schema.prisma`（generator provider、datasource url 迁移）

**Step 0.4**: 创建 `src/db/index.ts`——用 `PrismaPg` adapter 包装 PrismaClient

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;
export function getDb(): PrismaClient {
  if (!_prisma) {
    const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
    const adapter = new PrismaPg(pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}
```

**Step 0.5**: 更新 `src/server.ts`——用 `getDb()` 替代 `new PrismaClient()`

**Step 0.6**: 创建 PGlite test helper `tests/helpers/pglite-db.ts`

```typescript
import { PGliteBridge, pushSchema } from 'prisma-pglite-bridge';
import { PrismaClient } from '@prisma/client';
// 封装 snapshotDb/resetDb 模式
```

**Step 0.7**: 逐个迁移现有集成测试（interview-state-repo / conversation-engine / export / template-repo / stream-message / interview-plan）

**Step 0.8**: 全量测试验证：`npm run test` 通过（单元 + 集成）

**风险控制**: 如果 PGlite 兼容性遇到不可解问题，回退到真实 DB 跑集成测试方案

### Phase 1: CI on PR（Week 2）

**Step 1.1**: 创建 `.github/workflows/pr.yml`

```yaml
on: [pull_request]
jobs:
  static-analysis:
    - Biome check
    - tsc --noEmit
    - ast-grep lint:prisma
  unit-tests:
    - vitest run --exclude '**/*.integration.test.ts' --exclude 'tests/e2e/**'
    - 无 DB 依赖，秒级运行
  integration-tests:
    - vitest run 'tests/**/*.integration.test.ts'
    - 使用 PGlite，无需 PostgreSQL service
  e2e-tests:
    - 需要 Docker PostgreSQL
    - Playwright headless Chromium
  coverage:
    - vitest --coverage
    - 检查 80/80/70/80 阈值
  mutation:
    - stryker run（可选，可只在 pre-push）
```

**Step 1.2**: 配置 GitHub branch protection —— 必须所有 job 通过才能 merge

### Phase 2: Playwright Admin UI E2E（Week 3）

**Step 2.1**: `npx playwright install --with-deps chromium`

**Step 2.2**: 创建 E2E helper `tests/helpers/e2e-server.ts`（启动真实 Fastify + PGlite）

**Step 2.3**: Admin 核心页面 E2E（覆盖范围）:
- Templates 页面：列表渲染、创建/编辑/删除模板、发布/归档切换、JSON 导入
- Plans 页面：创建计划、成员管理（增/删/CSV 导入）、发送/提醒
- Analytics 页面：报表列表、报表查看/下载
- 管理后台导航、Shell/Fragment URL 正确性

**Step 2.4**: 创建 `npm run test:e2e` 快捷命令

### Phase 3: 覆盖率修复 + Smoke Test + 收尾（Week 4）

**Step 3.1**: 修复 vitest coverage 数据采集链路
- 当前 xp-gate gate5 的 coverage 显示 "N/A"——需要修复 `--coverage` 输出的 JSON 被 xp-gate 正确解析
- 阈值沿用 vitest.config.ts 现有配置：lines 80%, functions 80%, branches 70%, statements 80%

**Step 3.2**: 创建 `npm run smoke`

```json
{
  "scripts": {
    "smoke": "npm run type-check && npm run lint && vitest run --exclude '**/*.integration.test.ts' --exclude 'tests/e2e/**'"
  }
}
```

在启动人工验收前先跑 `npm run smoke`（< 10s），确保基础质量达标。

**Step 3.3**: 更新 AGENTS.md 新增的质量门禁文档

## 防御网层次

```
用户提交 PR
    │
    ▼
CI on PR ──────────────────────────────────────
  ├── Static Analysis（Biome + tsc, 无 DB, < 5s）
  │     └── 失败 → 阻断 ❌
  ├── Unit Tests（Mock 模式, 无 DB, < 10s）
  │     └── 失败 → 阻断 ❌
  ├── Integration Tests（PGlite, 进程内, < 30s）
  │     └── 失败 → 阻断 ❌
  ├── Coverage Check（80/80/70/80）
  │     └── 不达标 → 阻断 ❌
  └── Playwright E2E（Chromium, < 2min）
        └── 失败 → 阻断 ❌
    │
    ▼
人工验收启动前
    │
    ▼
npm run smoke ───────────────────────
  ├── type-check
  ├── biome lint
  └── unit tests（无 DB）
        └── 全部通过 → 可以开始人工验收 ✅
```

## 测试金字塔（目标状态）

```
         ╱╲
        ╱  ╲        E2E (Playwright, Admin UI 全量)
       ╱    ╲
      ╱      ╲      Integration (PGlite, ~30 个测试文件)
     ╱        ╲
    ╱          ╲    Unit (Mock, ~60 个测试文件)
   ╱            ╲
  ╱━━━━━━━━━━━━━━╲  Static Analysis (Biome + tsc)
```

## 未解决问题 / 待决策

1. **Mutation testing (Stryker)**：已有 stryker 配置但当前被移除，是否重新引入作为 pre-push gate？Phase 3 再评估
2. **E2E 测试数据隔离**：Playwright 测试使用的是 `dialog_survey_test` 真实 DB 还是 PGlite？——建议 E2E 使用真实 PostgreSQL（模拟生产环境），Unit/Integration 使用 PGlite
3. **Prisma 7 的 `@prisma/adapter-pg` peer dependencies**：需要确认 `pg` 版本兼容性
