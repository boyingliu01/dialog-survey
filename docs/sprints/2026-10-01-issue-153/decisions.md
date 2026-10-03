# Decisions — sprint-20261001-30 (issue #153)

## Decision DR-001
- **Phase**: 2/6 DESIGN
- **Question**: R1 requirements 评审跑满 5 轮仍为 3/3 GAPS_FOUND（共识率 0.00，阈值 0.90）。如何处置？
- **Options**:
  - A. 携带已处置缺口继续进入 Phase 2（推荐）
  - B. 再跑第 6 轮（超出 5 轮上限）
  - C. 缩小范围后重跑
  - D. 用户人工审阅设计文档后放行
- **Choice**: **A**
- **Rationale**: 五轮缺口已逐条处置；本轮评审修复了 7 个客观错误（含实测证伪 v1 核心方案）；
  最终 0 Critical / 11 Major / 16 Minor；第 4 轮已出现可证伪的陈旧复述，继续迭代边际收益低。
  用户在知情后明确接受"需求未经第三方确认"的风险。
- **Recorded as**: `requirements-reviewed.json` → `verdict: PASS_WITH_CAVEATS`, `user_decision.gate_option: A`
- **Timestamp**: 2026-10-01T15:5x:00Z

## Decision DR-002
- **Phase**: 2/6 DESIGN
- **Question**: 本地 hook 策略？
- **Options**: 保留可选 opt-in / 纯 CI 强制 / 仅交付不启用
- **Choice**: **保留可选 opt-in hook（默认不安装）**
- **Note**: 用户曾同时勾选"保留"与"纯 CI 强制"（互斥），经追问后明确裁定为"保留"。
- **Rationale**: 默认不安装 ⇒ 开箱状态不改变任何全局行为；CI 为主要强制保障；
  安装器提供幂等安装与精确恢复（AC-9）以控制风险。
- **Timestamp**: 2026-10-01T15:5x:00Z

## Decision DR-003
- **Phase**: 2/6 DESIGN
- **Question**: AC-10（把 commit-lint 设为 required status check）是否计入代码验收？
- **Choice**: **不计入**，作为运维步骤（需仓库管理员权限）
- **Rationale**: 该动作需要仓库管理员权限，代码无法交付也无法测试；
  将其伪装成代码验收项会制造不可验证的 AC。拆为 AC-4（代码可交付）+ AC-10（运维）。
- **Timestamp**: 2026-10-01T15:5x:00Z

## Decision DR-004
- **Phase**: 2/6 DESIGN
- **Question**: 是否纳入 `sync-version` 邻近修复？
- **Choice**: **纳入**，且范围扩大为"修 `--list-targets` + 新增 `scripts/sync-version.cjs`"
- **Rationale**: 实测发现 `--list-targets` 输出 7 项中 5 项不存在（文档原写 4，已修正）；
  更关键的是 xp-gate pre-commit:337 优先寻找 `scripts/sync-version.cjs`（不存在），
  且 `.sh` 在 WSL bash 下因 `node` 不在 PATH 而 **exit 127**。
  补 `.cjs` 可消除该失败模式，属发布链路的可靠性前提。
- **Timestamp**: 2026-10-01T15:5x:00Z

## Decision DR-005
- **Phase**: 2/6 DESIGN
- **Question**: tag 前缀？
- **Choice**: **统一 `v`**（bootstrap `v1.10.0`）
- **Rationale**: 当前零 tag；且 `GitBase.js:20` 的默认推断在零 tag 时退化为无 `v` 前缀，
  故必须显式配置 `git.tagName = "v${version}"`。
- **Timestamp**: 2026-10-01T15:5x:00Z

## Decision DR-006
- **Phase**: 2/6 DESIGN
- **Question**: 是否执行 batch-grill-me？
- **Choice**: **跳过**（以等效方式替代）
- **Rationale**: `sprint-state.json` 的 `auto_estimate.change_type` 为空，
  按 phase-2-design.md L163 应走标准路径。但 D1–D5 五组前置决策
  已通过 `AskUserQuestion` 一次性整批确认（含一次互斥消歧），
  功能上等价于 batch-grill-me 的"批量前置决策 + 一轮确认"，
  故不再重复询问以免造成用户负担。
- **Timestamp**: 2026-10-01T15:5x:00Z
