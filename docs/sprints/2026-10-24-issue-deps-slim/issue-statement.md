chore(deps): 精简生产依赖树 — 剔除误装的开发工具与死依赖，并让导出库按需加载

## 背景

云主机部署时资源紧张。对 v1.11.9 的依赖树做了实测（测量方法见
`docs/reports/deployment-cost-evaluation-2026-10.md` §1 / §5）：

| 口径 | 数值 |
|------|------|
| `node_modules` 全量（含 devDeps） | 654 MB / 1,021 个包 |
| 其中「生产树」（`npm ci --omit=dev` 应得） | **458 MB / 322 个包** |
| 其中开发专属 | 196 MB |

拆开这 458 MB，发现**约 180 MB（39%）根本不是运行时依赖**，而是开发工具
被装进了生产环境：

| 包 | 体积 | 是否真的需要 | 谁引入的 |
|----|-----:|--------------|----------|
| `@prisma/client` | 71 MB | ✅ | 直接依赖 |
| **`prisma`（CLI）** | **40 MB** | ❌ 只在 generate/migrate 时用 | `devDependencies` + `@prisma/client` 的 optional peer |
| **`@prisma/dev` + `@prisma/studio-core`** | **84 MB** | ❌ Prisma Studio GUI + 内嵌 PGlite | 被 `prisma` CLI 引入 |
| `effect` | 26 MB | ❌ | 被 `@prisma/dev` 引入 |
| `@prisma/dev/node_modules/@electric-sql/pglite` | 22 MB | ❌ 测试用，应走 devDependencies | 同上 |
| `typescript` | 22.5 MB | ❌ | `@prisma/client` 的 optional peer |
| `@prisma/engines` | 21 MB | ❌ CLI 用的 schema-engine 二进制 | `prisma` CLI |
| **`@langchain/core` + `@langchain/langgraph` + SDK + `js-tiktoken`** | **~20 MB** | ❌ **死依赖** | 直接依赖（遗留） |

另有一类不是磁盘而是**内存**的问题：`playwright` 与 `xlsx` 在
`export.service.ts` 顶层静态 import，**仅被加载就吃掉 84 MB 常驻内存**
（Playwright +52 MB、XLSX +32 MB），约占应用常驻内存的近一半——而 PDF/Excel
导出是低频操作。

## 根因

1. **`scripts/deploy.sh:92`** 用的是 `npm ci --ignore-scripts`（缺 `--omit=dev`），
   部署机把全部 devDependencies 都装上了。而 `prisma` CLI 同时又是
   `@prisma/client` 的 optional peer，于是它连同 `@prisma/dev` /
   `@prisma/studio-core` / `effect` / 内嵌 PGlite 一起进入生产树。
2. **`@langchain/*` 是历史遗留**：`docs/langgraph-migration-evaluation.md`
   记录了「评估后决定不迁移」，但依赖没有从 `package.json` 摘掉。
   全仓核查：`src/` 与 `tests/` 对 `@langchain.*` 的 import **为 0**，
   `package.json:61-62` 是唯一引用点。
3. **导出库静态 import**：`export.service.ts:3-4` 在模块顶层
   `import { chromium } from 'playwright'` / `import * as XLSX from 'xlsx'`，
   无论是否导出都会被加载（`server.ts` 在启动时 `new ExportService(...)`）。

## 目标

在不改动业务逻辑、不改变运行行为的前提下：

1. 生产部署不再安装 devDependencies；
2. 摘掉零使用的 `@langchain/*` 死依赖；
3. PDF/Excel 导出库改为按需加载，未使用时不计入常驻内存。

## 验收标准

- [x] `@langchain/core`、`@langchain/langgraph` 从 `package.json` 移除，`package-lock.json` 同步更新（连带清理 18 个包）
- [x] 全仓 `grep "@langchain"` 在 `src/`、`tests/`、配置文件（stryker/vitest/tsconfig/biome）中零命中
- [x] `export.service.ts` 不在模块顶层静态 import `playwright` / `xlsx`；两者改为函数内动态 `import()`
- [x] `scripts/prune-runtime-deps.mjs`：从 `dist/` 真实 import 推导运行时闭包并瘦身，校验失败即非 0 退出
- [x] `scripts/deploy.sh` Phase 6.5 接入瘦身脚本，并注释说明与 Phase 4 迁移的排序约束
- [x] `tests/prune-runtime-deps.test.ts` 契约测试（6 例）
- [x] `npm run type-check` 通过
- [x] `npm run lint` / `biome check` 通过
- [x] `npx vitest run` 全绿（149 个测试文件 / 1713 passed / 13 skipped）
- [x] 实测并记录：生产树 **373 MB → 147 MB（-225 MB / -60%）**

## 实施中的一个反直觉发现（重要）

`npm ci --omit=dev` **不能**解决问题，`npm prune --omit=dev` 也不能。
`prisma` 与 `typescript` 同时是本项目 devDependencies 和 `@prisma/client` 的
**optional peerDependencies**，npm 因此在 lockfile 中把它们记为 `devOptional`，
而 `--omit=dev` 的语义是"保留 devOptional"（因为 optional peer 可能运行时需要）。

实测确认：`npm ci --omit=dev` 后树仍是 373 MB，`prisma` / `@prisma/dev` /
`@prisma/studio-core` / `effect` / `@prisma/engines` 一个都没少。

所以最终方案不是"给 npm 加个参数"，而是一个从应用本身推导依赖闭包的脚本：
解析 `dist/` 里真实的 import → 建立运行时闭包（排除 optional peer）→ 删除闭包外的包
→ 校验每个保留包的依赖仍可解析。硬编码删除清单会因为上游加依赖而静默失效，
这是本方案刻意避免的。

## 非目标

- ❌ 改数据库（PostgreSQL → MySQL）：见评估报告 §2，风险远大于收益
- ❌ 用 Rust/Python 重写：见评估报告 §3.3–3.4，性能瓶颈在 LLM 往返，不在运行时
- ❌ 移除 PDF/Excel 导出功能本身

## 参考

- 实测与评估报告：`docs/reports/deployment-cost-evaluation-2026-10.md`
- `docs/langgraph-migration-evaluation.md`（LangGraph 未采用的决策记录）
- `Dockerfile:64` 已有的 `node node_modules/prisma/build/index.js` 直接调 CLI 模式
  （绕开 `npx` 会去 registry 拉 latest 的问题），可作为迁移步骤的参考
