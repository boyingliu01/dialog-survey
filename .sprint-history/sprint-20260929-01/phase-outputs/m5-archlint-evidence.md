# M5 archlint 验证证据 — architecture.yaml 门面/工厂归属声明

> 生成时间: 2026-09-30 · Sprint #149 (Prisma 7) · Phase 3 BUILD / M5 治理与文档

## 1. 目标

AC-PRISMA7-006-01 要求 `architecture.yaml` 声明门面/工厂归属与依赖。验证方式：`archlint scan . --config architecture.yaml` 能解析该文件并产出报告（配置文件语法被接受）。

## 2. 命令与结果

```bash
archlint scan . --config architecture.yaml --no-cache -q \
  -f json -r C:/Users/think/AppData/Local/Temp/archlint-m5-config.json
# EXIT=1
```

- EXIT=1 来自存量 smells（见下），**不是配置解析错误**（配置错误会输出 schema 错误并不产出 JSON 报告）。
- 早前 `| head -12` 管道截断导致 SIGPIPE 伪报 EXIT=127；无管道重跑确认 EXIT=1。

## 3. master vs worktree 对比（--no-cache，同口径）

| 指标 | master 基线 | worktree (M5 配置) |
|------|------------|-------------------|
| smells 总数 | 208 | 219 (+11) |
| High/Critical | 10 | 10 |
| High/Critical 配对 diff | — | **新增 0，丢失 0** |

- High/Critical 配对集合在 master 与 worktree 完全一致 → 本 sprint **未引入任何 high/critical 级回归**。
- +11 增量全部为低/中级别噪音（tests/ 域）：
  - `Unused Class Method detected` 43 → 45 (+2)
  - `Unused file detected` 5 → 8 (+3)
  - `Side-Effect Import` 3 → 4 (+1)
  - `File has N lines` 6 → 7 (+1，新增测试文件行数）
  - `c11_freshInstall` 高认知/圈复杂度 (+2，本 sprint 新增的 cli e2e 测试函数)
  - `installCommand` 复杂度数值微调等

## 4. 结论

1. 更新后的 `architecture.yaml`（version/layers/api|services|core|repositories|integrations|utils|generated/pattern/depends）被 archlint 0.16.0 接受并解析，产出 vs master 可对比的报告。
2. Gate 6（`npx @archlinter/cli scan . --config architecture.yaml`）在 master 上即 EXIT=1（183 文件 / 208 smells / 10 High）——**既有失败，非 sprint 引入**。Phase 4 记录为 pre-existing baseline。
3. archlint 0.16.0 无 layer 规则支持（schema 零 "layer" 引用，受控探针无告警）；本仓库 architecture.yaml 的 layers 格式为**声明式文档**，供人工/未来工具消费，不代表运行时强制。
4. 证据文件: `C:/Users/think/AppData/Local/Temp/archlint-master.json`、`archlint-m5-config.json`、`archlint-ignore.json`（含范围 ignore 口径：77 smells / 1 High — 剩余 1 High 为既有 src/server.ts ↔ tests/helpers/test-server.ts 克隆）。
