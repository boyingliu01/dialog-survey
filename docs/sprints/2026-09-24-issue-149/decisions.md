# Sprint 决策记录 — sprint-20260924-15（Issue #149）

> 格式遵循 sprint-flow 决策记录模板。时间戳为本地时间（UTC+8）。

## Decision DR-001
- **Phase**: 2/6 DESIGN
- **Question**: 设计文档（DD-001~DD-012 + Stage 0 spike 协议 + 验收标准）是否批准？
- **Options**: ① 批准（推荐）② 提出修改意见 ③ 先审阅设计文档全文
- **Choice**: ① 批准
- **Rationale**: 设计决策完备、无待定项；12 项 DD 均有理由/备选/验证路径；R2 采纳清单全部落点明确。
- **Timestamp**: 2026-09-24T14:35:00+08:00

## Decision DR-002
- **Phase**: 2/6 DESIGN
- **Question**: batch-grill-me 两轮 frontier 盘问（6 项决策 + 6 项默认落实）
- **Options**: 每项 2-3 个方案（见下）
- **Choice**:
  - Q1（CI 生成物覆盖）: **A — 6 个 job 显式加 `npx prisma generate`**（static-analysis / unit / integration / coverage / e2e / smoke；security-scan 不需要）
  - Q2（spike 双平台载体）: **A — `tools/spike/prisma7-pglite-spike.mjs` 可重跑脚本 + 手动 workflow（永久保留）**，M1 内双平台闭环
  - Q3（no-go 路径）: **A — no-go 即停，呈报 spike 报告 + 三选项（Plan B / 推迟 / 仅 Stage A）由用户拍板**
  - Q4（性能口径）: **A — 软目标**：超基线×1.2 先自动优化（maxWorkers/实例复用/DDL 缓存），仍不达标记录根因 + 呈报确认收口
  - Q5（里程碑全量 CI）: **A — pr.yml 加 `workflow_dispatch:`（一行）**，里程碑推送后手动触发记录 Stage A/B run URL
  - Q6（spike 依赖预装）: **A — 主 worktree 先装依赖（v7+pglite）**，no-go 时 `git restore package*.json package-lock.json && npm ci` 零污染回滚；M1 定义修订为"依赖预装+spike"
  - 默认落实项: publish.yml 对齐加 generate 步；`.nvmrc`=20.19 加入；spike 脚本+workflow 两者保留；AC#5 口径补注 `vitest run`；spike 补充判据 #8（generate 阶段 env 校验）；M1 产出物含依赖预装提交
- **Rationale**: Q1 显式方案与 DD-009"不加 postinstall"保守取向一致且可诊断；Q2/Q5 解决"M1/M2 阶段无 PR 即无 CI 载体"的证据链缺口；Q3 因 no-go 会作废 AC#3/#4/#5 属重大范围变更必须用户拍板；Q4 性能为体验非正确性问题，硬阻塞可能卡住交付；Q6 主树最接近真实工程上下文且回滚零成本。
- **Timestamp**: 2026-09-24T14:45:00+08:00

## Decision DR-003
- **Phase**: 2/6 DESIGN
- **Question**: batch-grill-me 共享理解（Q1-Q6 + 6 默认项）是否确认达成？
- **Options**: ① 确认，进入设计评审（推荐）② 有个别项要调整
- **Choice**: ① 确认
- **Rationale**: frontier 已清空，设计树全分支访问完毕；确认后修订 design-doc.md（§5.2 落实表）并进入 delphi 设计评审。
- **Timestamp**: 2026-09-24T14:50:00+08:00
