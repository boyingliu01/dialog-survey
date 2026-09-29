# Round 1 匿名汇总反馈（受控反馈材料）

> 本文件为 Delphi Round 2 交换意见材料：汇总 Round 1 三位专家（架构/技术/可行性维度）提出的全部 Critical / Major / Minor 问题（**已去除专家归属**），并标注作者在 v2 修订版中的回应位置。
> Round 1 汇总结果：3/3 REQUEST_CHANGES。
> 评审对象：`requirements-149-v2.md`（同目录）。Round 2 请基于 v2 文档 + 本汇总重新评估。
> 项目代码可只读抽查：`e:\projects\dialog-survey\.worktrees\sprint-20260924-01\`

## Critical（必须修复才能通过）

| ID | 问题 | v2 回应位置 |
|----|------|------------|
| R1-C-01 | **E2E/buildApp() DI 缺口**：`tests/e2e/helpers/e2e-server.ts` 经 `buildApp()` 生产路径内部自建 PrismaClient，与 TestDatabase 实例无法共享；依赖篡改 `process.env.DATABASE_URL` 的隐式机制脆弱，e2e 的数据库策略从未被方案直面 | [R1-C] 第 1 节：`BuildAppOptions.prismaFactory` 注入缝（对齐既有 fastifyFactory 风格）；e2e 注入 `testDb.getPrisma()`；废弃 DATABASE_URL 改写；主方案 X（e2e 全 PGlite 化）/ 降级预案 Y 明确定义 |
| R1-C-02 | **验收标准自相矛盾**：AC5「本地 npm test 无需 PG」与 e2e 保留 postgres service 互斥；vitest include 覆盖 e2e 但方案的 e2e 数据库策略缺失 | 同 R1-C-01：e2e 全 PGlite 化（主方案 X）满足 AC5 最强解释；降级预案 Y 的两条附加条件（spike 判据 + 显式记录） |
| R1-C-03 | **生产/发布链路缺失**：Dockerfile、scripts/deploy.sh、scripts/cli.mjs（npm 安装场景在无源码树目录执行 generate/db push）、publish.yml、package.json（files/allowScripts）均未纳入；新 generator 生成物如何进入 dist 未论证（.ts 源码 vs 编译产物） | [R1-C] 第 3 节：6 处逐项处置；dist 自包含由 BUILD 阶段「无源码树冒烟」验证；npm 安装器改为交付已编译 client；publish.yml 同步 |
| R1-C-04 | **缺 spike 与回滚**：PGlite 关键兼容性假设未验证（交互式 `$transaction` 嵌套/回滚、`$queryRaw`、P2002 错误码一致性、String[]/Json/enum 全 schema、并发）；实施失败无退路、无量化 go/no-go | [R1-C] 第 2 节：Stage 0 限时 spike（≤0.5 天）7 项量化判据；Stage A（Prisma 7 + 真 PG）→ Stage B（PGlite）；各自绿灯门禁 + 回滚点 + Plan B（embedded-postgres） |

## Major（需认真处理）

| ID | 问题 | v2 回应位置 |
|----|------|------------|
| R1-M-01 | 83 个文件 import codemod 直接指向生成目录 `src/generated/prisma` 会让依赖散乱、mock 目标不稳定；建议收敛到门面模块 | [R1-M] 门面模块：`src/utils/prisma-client.ts` 显式 re-export（PrismaClient + 6 运行时枚举 + Prisma 命名空间 + model 类型）；codemod 与 vi.mock 目标统一为门面；符号清点前置 |
| R1-M-02 | vi.mock 真实数量为 7 个文件（材料误写 ≥2）；且现有 mock 工厂只导出 `{ PrismaClient }`，codemod 后运行时枚举缺失会爆 | 门面节：7 处逐一改造 + mock 工厂补全枚举导出（清单已列出） |
| R1-M-03 | 测试 schema 初始化命令参数错误：v7 应为 `--to-schema`（非 `--to-schema-datamodel`）；且与 #152（migrations 规范化）的衔接未定义 | [R1-M] 测试 schema 初始化：命令修正；抽象 `applyTestSchema(pglite)`，fromDatamodel() → #152 后切 fromMigrations()，双向链接写入 #152 DoD |
| R1-M-04 | CI 事实修正：带 postgres service 的 job 为 4 个（非 5）；publish.yml 另有 postgres service + db push 未纳入 | [R1-C] 第 3 节 + 验收 #4：pr.yml 4 job 逐 job 移除为硬性验收；publish.yml 同步 |
| R1-M-05 | 非功能基线缺失：CI job 时长、TestDatabase.setup() 性能、内存无目标值 | [R1-M] 非功能验收基线：记录基线 + ≤基线 / p95 ≤2s 目标 + +20% 回归 guard |
| R1-M-06 | 工具链排除清单不全：coverage.exclude 未含 src/generated（覆盖率坍塌风险）；biome 三处 ignore；.gitignore | [R1-M/M] 工具链排除清单（完整版）：biome ×3 + vitest coverage.exclude + .gitignore + tsconfig「不排除」理由 |
| R1-M-07 | 文档更新清单缺失：AGENTS.md「PG required」表述将失实 | [R1-M] 文档更新清单：AGENTS.md / docs/setup-guide.md / README ×2 / DEPLOY.md |
| R1-M-08 | 无分阶段执行与回滚点，一次性大爆炸变更风险高 | 同 R1-C-04（Stage 0/A/B + 回滚点 + 双里程碑提交序列） |

## Minor（建议性）

| ID | 问题 | v2 回应位置 |
|----|------|------------|
| R1-m-01 | engines 升 >=20.19.0 需与 deploy.sh 校验同步 | 杂项：engines + deploy.sh 同步 + .nvmrc 可选 |
| R1-m-02 | v7 连接池默认行为变化（pg driver 无默认 timeout），生产需显式配置 | 杂项：生产工厂显式连接池参数，对齐 v6 行为 |
| R1-m-03 | 0.x 社区包（pglite-prisma-adapter）供应链风险 | 杂项：精确 pin 0.7.2 + 单入口收敛便于替换 |
| R1-m-04 | 缺 Plan B 退路 | 杂项：embedded-postgres 记录为 Stage A 受阻退路 |
| R1-m-05 | ecosystem.config.cjs 的 dist/server.js vs dist/src/server.js 路径疑点 | 杂项：记为 emergent issue，不阻塞本 sprint |
| R1-m-06 | Prisma 8 RC 已存在，是否直升 | 杂项：升 7 不升 8 RC（8 GA 后另开 issue） |
| R1-m-07 | coverage job `if: always()` 是否一并处理 | 杂项：属 #150 范围，本 sprint 只留证据；#150 顺序在后 |

## Round 2 评估要求

1. 上述 4 项 Critical 是否已被 v2 充分解决（须有可执行判据，不接受仅「计划中的计划」——但实现级验证本身属于 BUILD/Stage 0 门禁，需求阶段的职责是判据是否量化、可行、可验证）？
2. 上述 8 项 Major 是否已妥善处置？
3. v2 修订是否**引入新问题**（重点检查：门面模块 re-export 完整性与类型导出形态；prismaFactory 注入与既有 fastifyFactory 缝的一致性；Stage 0 spike 判据是否足以支撑 go/no-go；发布链路处置是否自洽）？
4. 是否有新的、Round 1 未识别的 Critical/Major 问题？
