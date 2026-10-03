# Phase 1/6: PREP — Summary

**Sprint**: sprint-20261001-30 · **Branch**: `sprint/2026-10-01-01` · **Issue**: #153

## AUTO-ESTIMATE

| 维度 | 评估 |
|------|------|
| 分类 | **standard** |
| 理由 | 跨工具链配置（commitlint + husky + 自动发布），非单文件改动；但无业务逻辑/数据模型变更，风险集中在 CI 与开发者工作流 |
| 预估切片 | 3–4 个 |
| 风险等级 | 中（会改变所有后续提交的行为，配错会阻塞团队） |

## 交付物

| 输出物 | 路径 |
|--------|------|
| Worktree | `.worktrees/sprint-20261001-230743` |
| Sprint 状态 | `.sprint-state/sprint-state.json` |

## PREP 阶段关键发现（影响 DESIGN 决策）

### F1 — `core.hooksPath` 已被全局 xp-gate 占用 ⚠️

```
git config --get core.hooksPath
→ C:/Users/think/.config/xp-gate/hooks
```

**含义**：husky 的默认机制是设置 `core.hooksPath=.husky`。
若直接 `npx husky init`，会**覆盖**全局 xp-gate hooks 路径，导致
pre-push 的 Gate 10 / Gate M / Gate MD / Gate MW 全部失效。

这是 #153 原始描述**完全没有提及**的约束，必须在 DESIGN 阶段解决。
候选方案见 Phase 2。

### F2 — `scripts/sync-version.sh` 携带其他项目的死目标

`--list-targets` 输出 6 个 fan-out 目标，其中 4 个在本仓库**不存在**：

| 目标 | 状态 |
|------|------|
| `package.json` | EXISTS |
| `AGENTS.md` | EXISTS |
| `src/npm-package/package.json` | **MISSING** |
| `plugins/claude-code/.claude-plugin/plugin.json` | **MISSING** |
| `plugins/opencode/package.json` | **MISSING** |
| `src/npm-package/plugins/**` (×2) | **MISSING** |

脚本对缺失文件静默跳过（`[ -f "$pkg" ] || return 0`），因此当前能工作，
但 `--list-targets` 是给 pre-commit hook 消费的，输出与实际不符。

### F3 — 现状盘点：无任何提交规范化工具

| 能力 | 现状 |
|------|------|
| commitlint | 未安装 |
| husky | 未安装 |
| semantic-release / release-it | 未安装 |
| CHANGELOG.md | 存在，**手工维护**（当前有 1.10.0 / 1.8.9 两节） |
| `VERSION` 文件 | 存在 = `1.10.0`，与 package.json 一致 |
| 版本同步 | `scripts/sync-version.sh`（纯手写 bash + node） |
| git tag | 无自动化 |
| GitHub Release | 无自动化 |

**重要**：项目已有相当成熟的**手工**版本机制（VERSION 单一真源 → sync-version.sh 扇出），
因此 #153 的正确方向是**在其之上加自动化**，而不是推翻重来。

### F4 — 历史提交已基本符合 Conventional Commits

抽查 `git log` 最近的提交，格式为 `fix(test):` / `docs:` / `chore(release):` 等，
说明**团队已在自觉遵守**，commitlint 的作用是防回归而非纠偏。
这也意味着启用 commitlint 的历史兼容风险低。

## 门禁状态

| 门禁 | 状态 |
|------|------|
| 保护分支检测 | ✅ 检测到 master 为保护分支，已创建 worktree 隔离 |
| worktree 隔离 | ✅ `.worktrees/sprint-20261001-230743` |
| xp-gate 可用 | ✅ v0.19.3 |
| sprint-init | ✅ 已初始化 |

## Status

```
status: completed
outputs: [.worktrees/sprint-20261001-230743, .sprint-state/sprint-state.json]
decisions: [分类=standard, 采用 worktree 隔离, 关闭 #149]
next_phase_context: F1 (hooksPath 冲突) 是 DESIGN 阶段必须解决的核心设计问题；F3 表明应在现有手工版本机制之上做自动化
```
