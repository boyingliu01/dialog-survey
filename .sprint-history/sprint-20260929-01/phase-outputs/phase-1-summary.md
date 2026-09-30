# Phase 1/6: PREP — Summary

**Sprint**: sprint-20260929-99
**Issue**: #149 — Prisma 7 + PGlite 集成：解除集成测试对真实 PostgreSQL 的依赖
**Branch**: sprint/2026-09-29-01
**Worktree**: `.worktrees/sprint-20260929-01`
**Base commit**: 5184fee (master)

## 执行结果

| 步骤 | 结果 |
|------|------|
| 保护分支检测 | master 为保护分支 → worktree 隔离 |
| 上游产物归档 | 旧 sprint（sprint-20260924-15 @ 61d616b）的 phase-outputs + decisions.md → `docs/sprints/2026-09-24-issue-149/` |
| 遗留清理 | `git worktree prune`（失效 E: 路径注册）+ 删除旧目录 `.worktrees/sprint-20260924-01` |
| Worktree 创建 | `.worktrees/sprint-20260929-01` @ 5184fee，分支 `sprint/2026-09-29-01` |
| 规模评估 | **complex**（大版本依赖升级 + 测试基础设施重构 + CI 改造 + 发布链路适配） |
| sprint-init | sprint-20260929-99 |
| 决策记录 | DR-001（范围：6 issues 连续推进）/ DR-002（复用设计）/ DR-003（清理遗留） |
| Phase transition | 1 → completed |

## 设计复用核验（DR-002 依据）

| 项 | 状态 |
|----|------|
| 需求评审 R1→R2 | Round 1 REQUEST_CHANGES(3/3) → v2 修订 → **Round 2 APPROVED（3/3，共识 0.94）** |
| 设计文档 | 12 项 DD + Stage 0 spike 协议（#0-#12）+ Stage A/B 分阶段 + 回滚点，**用户已批准（2026-09-24 DR-001）** |
| batch-grill-me | Q1-Q6 + 6 默认项已确认（DR-002/003） |
| 基线漂移 | 设计基线 61d616b vs 当前 5184fee：仅差 1 个文档文件（`docs/plans/2026-05-19-*.md`，+592 行），**代码零漂移** |
| 剩余 DESIGN 步骤 | Delphi 设计评审（≥90%）→ to-issues → specification.yaml + slices-manifest.json |

## 现状侦察（当前基线实测）

| 项 | 值 |
|----|-----|
| Prisma | `@prisma/client` 5.22.0 / CLI 5.22.0 / `@prisma/adapter-pg` ^5.22.0 |
| 集成测试 | 6 个（conversation-engine / export / interview-plan / interview-state-repository / stream-message / template-repository） |
| E2E 测试 | 11 个（tests/e2e/*.e2e.test.ts） |
| 测试文件总数 | 112 个 |
| `@prisma/client` import 文件 | 76 个（设计文档记录 83，Stage A 需按符号清单逐项重核） |
| `new PrismaClient` 实例化 | 36 处（设计记录 33 构造点 / 27 处测试实例化，Stage A 重核） |
| Prisma models | 10 个 / 6 enum |
| CI jobs（pr.yml） | 7 个（static-analysis / unit-tests / integration-tests / security-scan / coverage / e2e-tests / smoke） |
| 含 postgres service 的 job | 4 个（unit-tests / integration-tests / coverage / e2e-tests） |
| `if: always()` job | 3 个（coverage[#150 目标] / e2e-tests / smoke） |
| VERSION | 1.8.9（package.json 一致） |
| 本机环境 | Windows + WSL2 PG（localhost:5432 可选）；Playwright chromium 未安装 |

## 风险预判（沿用上游 + 更新）

- **R1**: Prisma 7 强制 driver adapter 架构 → 33+ 处构造点 Stage A 必须全改造（否则 tsc 不通过）
- **R2**: `pglite-prisma-adapter@0.7.2` 为社区 0.x 包，与 `@prisma/client@7.10.0` 兼容性 → Stage 0 spike #0 前置拦截
- **R3**: PGlite 并发事务语义偏差（乐观锁场景）→ spike #6/#6b
- **R4**: 内存峰值（每文件独占 PGlite × fileParallelism）→ §3.6 硬判据
- **R5**: 生成代码（`src/generated/prisma` .ts）过 strict tsc → spike #9
- **R6**: 本机 Windows 无 Playwright chromium → e2e 验收前需 `npx playwright install chromium`

## next_phase_context (for DESIGN)

- **复用输入**: `docs/sprints/2026-09-24-issue-149/phase-outputs/design-doc.md`（32KB，12 DD + spike 协议 + AC + 实施序列）
- **需求绑定**: `requirements_hash=c9ede78b…cd514e`、`head_commit=61d616b`（代码等价于 5184fee，hash 重绑定时需重新生成 evidence）
- **DESIGN 待办**: ① Delphi 设计评审（`--mode design`，3 专家，≥90%）② to-issues 切片（M1-M5 里程碑 → slices-manifest.json）③ specification.yaml（AC 7 条 → REQ 映射）
- **Stage 0 spike 脚本**: `tools/spike/prisma7-pglite-spike.mjs`（设计已定，BUILD 实现）
- **依赖预装决策（上游 Q6-A）**: 主 worktree 先装依赖；本 sprint 起 worktree 即为隔离环境，预装在 sprint worktree 内执行，回滚 = `git restore package*.json package-lock.json && npm ci`
