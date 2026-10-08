# 项目状态报告 — Dialog Survey

> 生成时间：2026-10-08 15:20 · 版本 v1.10.0 · HEAD `7a0fcb1`（master，与 origin 同步）

---

## 1. 仓库状态：干净

| 检查项 | 结果 |
|--------|------|
| 未提交变更 | 无（仅未跟踪的 `.workbuddy/`，为 agent 工作记忆目录，可按需加入 `.gitignore`） |
| 未合并分支 | 无（本地与远程均只剩 master，今天 3 个修复分支已全部 squash 合并并删除） |
| 未清理 worktree | 无（仅主工作目录一个） |
| stash | 空 |
| Open issues / PRs | **0 / 0**（GitHub 上无任何遗留） |
| master 最近 CI | publish workflow ✅ 成功（前两次 failure 是今天排障过程，已被修复后的运行取代） |

**结论：无任何悬空工作，收尾状态完整。**

---

## 2. xp-gate 质量门禁：符合要求，无 FAILED

最新全量基线（master，2026-09-24）：**9/12 gates 通过，7.5/10**。
今天提交链路实测（2026-10-08 06:33 报告）：**8 PASS / 4 SKIP / 0 FAIL**。

| Gate | 状态 | 说明 |
|------|------|------|
| 1 静态分析（tsc + biome + ast-grep） | PASS | 本地今日复核：type-check ✅、lint 58 文件零问题 ✅ |
| 2 重复代码（≤5%） | PASS | |
| 3 圈复杂度 | SKIP | 不适用（非失败） |
| 4 Clean Code + SOLID | SKIP | 不适用 |
| 5 测试 + 覆盖率 | PASS | CI 强制 80/80/70/80，阻断式 |
| 6 架构 + Boy Scout | PASS | |
| 7 IaC 安全扫描 | SKIP | 不适用 |
| 8 Secret 扫描 | PASS | |
| 9 构建完整性 | PASS | |
| 10 SAST 安全扫描 | PASS | |
| 11 Sprint Flow | SKIP | 分支未绑定 sprint |
| 12 文件卫生 | PASS | 今日曾因环境缺 PyYAML 误报，已建托管 venv + shim 修复 |

**CI 交叉验证（PR #177，今日）：10/10 job 全绿**，含 Coverage Check（阻断）、E2E（Playwright + PGlite）、Integration（真实 PostgreSQL）、Semgrep + gitleaks、Mutation（advisory）、Smoke。

**结论：所有可适用的门禁全部通过，SKIP 均为不适用或环境限制，非质量缺陷。**

---

## 3. 测试与已知技术债

- **125 个测试文件 / ~1283 用例**：单元（mock）+ 集成（PGlite 进程内，无需 PostgreSQL）+ E2E 11 个文件（真实 Chromium）
- 覆盖率门槛 80/80/70/80 在 CI 阻断执行；变异测试增量运行（advisory）
- 已登记技术债（均有 issue/文档跟踪，非回归）：

| 债 | 量级 | 风险 |
|----|------|------|
| 架构债（legacy 测试 Code Clone 为主） | 2.8/10，219 smells | 中——几乎全在测试代码，不在生产路径 |
| legacy 测试缺 `@intent` 注解 | 281 个 | 低（项目已声明 Legacy Mode） |
| PGlite 冷构建跨进程争用 | 缺单写者锁 | 低（进程内 memoize 已规避） |

---

## 4. 距商用发布的 GAP

### 现状定位
工程质量（测试密度、CI 门禁、安全扫描、发布自动化）**已达到或超过多数内部商用工具的标准**。DEPLOY.md 提供一键安装（`npx dialog-survey install`，12 步自检）、PM2 托管、healthcheck。**作为企业内部自部署的调查工具，现状基本可交付。**

### GAP 清单（按离"对外商用"的距离排序）

| 维度 | 已具备 | 缺口 | 量级 |
|------|--------|------|------|
| **多用户/租户** | 单管理员（用户名+哈希）、8h 会话、CSRF、登录限流(5次) | 无多用户体系、无 RBAC、无多租户隔离 | 🔴 大（对外多客户商用必须） |
| **可观测性** | 结构化日志、healthcheck、Docker healthcheck | 无 metrics（Prometheus/OTel 均未接入）、无告警、无监控大盘 | 🔴 大 |
| **可用性/HA** | PM2 单实例、乐观锁、消息去重 | 无多实例支持（限流与会话 in-memory，DEPLOY 注明需 Redis，标 future）、无自动故障转移 | 🟡 中（内部自部署可接受） |
| **数据保护** | 手工 pg_dump 文档化、PII 工具 | 无自动定时备份、无恢复演练记录 | 🟡 中 |
| **性能验证** | — | 无系统性压测（仓库无 k6/artillery，无性能 CI job），吞吐容量未知 | 🟡 中 |
| **渠道** | 钉钉（REST + Stream） | 单渠道，无微信/网页端等 | 视产品定位 |
| **安全** | CSRF、限流、secret scanning、SAST、trusted publishing、依赖扫描（CI） | 无渗透测试记录 | 🟢 小（建议商用前做一轮） |

### 一句话结论
**内部商用：现在就能上，GAP 仅剩自动备份 + 基础监控两项运维补课（约 1-2 天工作量）。**
**对外多客户 SaaS：需补多租户/多用户、可观测性、HA 三大件，估计是 1-2 个 sprint 量级的专项，且多租户涉及数据模型改动，需要先做设计。**
