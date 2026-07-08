# 自动化测试防护网设计方案

> 创建日期: 2026-07-05
> 修订日期: 2026-07-05（修订版 v2，根据 Delphi 评审共识修改）
> 状态: REVISED (待重新评审)
> 关联: AGENTS.md, vitest.config.ts, .github/workflows/publish.yml

## 背景

本项目的端到端人工验收测试已进行两周，频繁发现回归问题。尽管对每个发现问题都补充了自动化测试，仍出现反复。

近期项目经历了大量变更，在重新启动人工验收测试之前，需要建设自动化测试防护网，用自动化手段（静态检查、自动化测试、浏览器无头测试等）最大程度保障项目质量。

## 目标

- **一键预验收**：运行 `npm run smoke` 关键子集测试，快速判断能否启动人工验收
- **CI 自动阻断**：每个 PR 自动跑质量门禁，回归即阻断
- **核心路径 E2E**：Playwright 覆盖 Admin 核心页面和 CRUD 交互
- **测试数据库隔离**：严格区分 TEST_DATABASE_URL 和 DATABASE_URL，防止污染生产数据

## 当前项目状态（基线）

| 维度 | 当前状态 |
|------|---------|
| 项目规模 | 53 TS 源文件，87 测试文件，1022 测试（全部通过） |
| ORM | Prisma 5.22.0，@prisma/adapter-pg 5.22.0 |
| CI | publish.yml（仅 tag 触发），含 PostgreSQL service container |
| 测试数据库 | TestDatabase.ts 已支持 TEST_DATABASE_URL 隔离 |
| Playwright | 1.61 已安装，浏览器已在 CI 中为 PDF 导出安装 |
| E2E 框架 | 已有 E2E 测试框架雏形（MockDingTalk + TestDatabase） |
| 质量门禁 | xp-gate 11 道，但 coverage 显示 "N/A" |
| 代码质量 | Biome lint + tsc strict + ast-grep |
| 安全扫描 | pre-commit hook 中已有 gitleaks + semgrep |
| 变异测试 | Stryker 已移除（原有配置已清理） |

## 执行计划（3 周，3 个 Phase）

### 核心原则

1. **高 ROI 先行**：PR CI trigger、coverage 基线、安全扫描无依赖，立即交付
2. **PGlite 不阻塞 CI**：CI 先用真实 PostgreSQL（当前即可工作），PGlite 为可选探索
3. **E2E 聚焦核心路径**：不追求全量覆盖，优先覆盖回归高频区域

### Phase 0: CI 基建 + 覆盖率先行（Week 1）

**不依赖任何外部技术变更，当前 Prisma 5.22 + 真实 PostgreSQL 即可完成。**

**Step 0.1**: 创建 `.github/workflows/pr.yml` — PR 自动触发

```yaml
on: [pull_request]
jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - Biome check src/
      - tsc --noEmit
      - ast-grep lint:prisma
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - vitest run --exclude '**/*.integration.test.ts' --exclude 'tests/e2e/**'
      # 无 DB 依赖，秒级运行
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: dialog_survey_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: [5432:5432]
    steps:
      - vitest run 'tests/**/*.integration.test.ts'
      env:
        TEST_DATABASE_URL: postgresql://test:test@localhost:5432/dialog_survey_test
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - semgrep --config=auto src/
      - gitleaks detect
  coverage:
    runs-on: ubuntu-latest
    steps:
      - vitest --coverage
      - 检查 80/80/70/80 阈值（lines/functions/branches/statements）
  smoke:
    runs-on: ubuntu-latest
    steps:
      - npm run smoke
```

**Step 0.2**: 区分 TEST_DATABASE_URL 和 DATABASE_URL

- `publish.yml` 和 `pr.yml` 中 test job **必须**使用 `TEST_DATABASE_URL` 指向 `dialog_survey_test`
- `DATABASE_URL` 仅用于 `prisma db push` 和 E2E 运行时 DB
- 确保 `tests/helpers/test-db.ts` 的 TEST_DATABASE_URL 检查逻辑在 CI 路径下被强制执行

**Step 0.3**: 修复 vitest coverage 数据采集

- 当前 xp-gate gate5 的 coverage 显示 "N/A"
- 验证 `vitest --coverage` 输出 JSON 能被 xp-gate 正确解析
- 阈值沿用 vitest.config.ts 现有配置：lines 80%, functions 80%, branches 70%, statements 80%

**Step 0.4**: 创建 `npm run smoke`

```json
{
  "scripts": {
    "smoke": "npm run type-check && npm run lint && vitest run tests/health.test.ts tests/server-api.test.ts tests/project-structure.test.ts tests/env-config.test.ts"
  }
}
```

Smoke test 只运行关键路径的少量测试（~50 个以下），目标是 **< 30s 完成**，而非全量 1022 个测试。在启动人工验收前先跑 `npm run smoke`，确保基础质量达标。

**Step 0.5**: 更新 CI 配置中 timeout 和 resource constraints

- 每个 job 设置显式 timeout-minutes
- Stryker：仅 pre-push hook，不加入 CI

### Phase 1: E2E 核心路径 + 回归分类（Week 2）

**Step 1.1**: 回归分类

- 回顾过去两周人工验收发现的回归问题类型
- 按频率/严重度排序，确定 E2E 测试的优先级

**Step 1.2**: Playwright E2E 核心路径

使用 publish.yml 中已有的 Playwright 浏览器安装（已在 CI 中为 PDF 导出安装 Chromium），覆盖以下核心路径：

- Health check：确认服务正常启动
- Templates 页面：列表加载、创建模板、编辑模板
- Plans 页面：列表加载、创建计划
- 管理后台导航：Shell → Fragment URL 路由正确

**不覆盖**（可后续扩展）：批量导入 CSV、JSON 模板导入、报表下载、DingTalk 集成交互。

**Step 1.3**: 外部依赖 mock 策略

Playwright E2E 测试中使用 Fastify 测试服务器，对以下外部依赖进行 mock：
- DingTalk webhook：`tests/e2e/helpers/mock-dingtalk.ts`（已有实现）
- LLM 调用：stub LLM API 返回固定响应

**Step 1.4**: 创建 `npm run test:e2e` 快捷命令

### Phase 2: PGlite 可选探索 + 收尾（Week 3, Optional）

**此 Phase 不阻塞前两个 Phase 的交付。如果 Phase 0/1 已满足验收需求，PGlite 可以推迟或取消。**

**Step 2.1**: Prisma 7 迁移评估 Spike

- 在独立分支上尝试 Prisma 5.22 → 7.x 升级
- 验证 `prisma-pglite-bridge`（npm 包名：`prisma-pglite-bridge`，v1.6.2）是否能与当前 schema 兼容
- 关键检查点：JSON 字段、enum 处理、relation 兼容性
- 输出：兼容性报告 + 迁移成本估计

**Step 2.2**: 条件决策

- **如果 PGlite 兼容且迁移成本可控**：推进 PGlite 替换部分集成测试
- **如果 PGlite 不兼容或迁移成本过高**：放弃 PGlite，保持真实 PostgreSQL 方案

**Step 2.3**: 文档更新

- 更新 AGENTS.md 记录新的质量门禁架构
- 更新 CHANGELOG

## 防御网层次（目标状态）

```
用户提交 PR
    │
    ▼
CI on PR ──────────────────────────────────────────
  ├── Static Analysis（Biome + tsc + ast-grep）
  │     └── 失败 → 阻断 ❌
  ├── Unit Tests（Mock 模式, 无 DB, ~30s）
  │     └── 失败 → 阻断 ❌
  ├── Integration Tests（真实 PostgreSQL, service container）
  │     └── 失败 → 阻断 ❌
  ├── Security Scan（semgrep + gitleaks）
  │     └── 安全漏洞 → 阻断 ❌
  ├── Coverage Check（80/80/70/80）
  │     └── 不达标 → 阻断 ❌
  ├── Smoke（type-check + lint + 关键子集测试）
  │     └── 失败 → 阻断 ❌
  └── Playwright E2E（Chromium, 核心路径 < 5min）
        └── 失败 → 阻断 ❌
    │
    ▼
人工验收启动前
    │
    ▼
npm run smoke ───────────────────────
  ├── type-check（~5s）
  ├── biome lint（~5s）
  └── 关键子集测试（~20s）
        └── 全部通过 → 可以开始人工验收 ✅
```

## 测试金字塔（目标状态）

```
         ╱╲
        ╱  ╲        E2E (Playwright, 核心路径)
       ╱    ╲
      ╱      ╲      Integration (真实 DB, ~30 个测试文件)
     ╱        ╲
    ╱          ╲    Unit (Mock, ~60 个测试文件)
   ╱            ╲
  ╱━━━━━━━━━━━━━━╲  Static Analysis (Biome + tsc + Security)
```

## 已决策事项（Delphi 评审结论）

| 议题 | 决策 | 理由 |
|------|------|------|
| **Phase 顺序** | PR CI + coverage + smoke = Phase 0 | 最高 ROI、零依赖，可立即交付 |
| **PGlite** | 可选 Phase 2，不阻塞 | prisma-pglite-bridge 需要 Prisma 7，当前 5.22 不兼容；桥接库较新(v1.6.2)且风险未验证 |
| **Playwright 范围** | 核心路径（4 个页面） | 全量覆盖 1 周不可行 |
| **CI 数据库** | 真实 PostgreSQL service container | 当前即可工作，无兼容性风险 |
| **TEST_DATABASE_URL** | CI 中强制执行 | 已有 support 但 CI 未使用，需强制隔离 |
| **安全扫描** | 加入 CI（semgrep + gitleaks） | 零依赖，pre-commit 已有，需提升到 PR gate |
| **Smoke test 范围** | 关键子集（~50 tests），不跑全量 | 全量 1022 tests 无法 <10s |
| **Stryker 变异测试** | 不引入（已移除） | 投入产出比低，CI 会增加 10-20min |
| **E2E 外部依赖 Mock** | 使用已有 MockDingTalk + LLM stub | 已有实现，无需重新造轮子 |

## 风险控制

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CI 配置变更影响现有 publish 流程 | 高 | 先在新 workflow (pr.yml) 中测试，不影响现有 publish.yml |
| Playwright 浏览器安装失败 | 中 | CI 中 `playwright install chromium --with-deps` 已有成功记录（PDF 导出） |
| E2E Mock 与真实行为不一致 | 中 | 保留真实 DingTalk 集成的手工验收作为补充 |
| PR CI job 超时 | 低 | 设置显式 `timeout-minutes: 10`，防止 CI 挂起 |
