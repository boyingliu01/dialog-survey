# Sprint History — Learnings

## [2026-09-30] Sprint #149 (Prisma 7 + PGlite) — VERIFY Learnings

### Pattern: 对齐门禁要按「本 specification 的追溯域」计分，同时披露全域基线

- **Context**: `xp-gate check-alignment`（确定性引擎 `lib/test-alignment.ts`）会扫描 `tests/`
  下所有带 JSDoc 的测试。dialog-survey 的历史测试是按**更早的 specification** 标注的
  （REQ-002-5-01 / REQ-BATCH-001 / REQ-009-10-03 …），281 个测试缺 `@intent`。
- **Insight**: 用 SPEC-PRISMA7-001（6 REQ / 12 AC）做全域打分，得分恒为 0——扣分项几乎全是
  历史债，与本 sprint 无关；而真正的 #149 缺口（REQ-003/004/005/006 完全没有 `@test` 标注、
  12 个 AC 里 10 个没有断言）反而被噪音淹没。项目自己的 `docs/test-alignment/plan.md`
  早已声明「采用 Legacy Mode（测试先于规范存在）」，历史注解补全是一次独立的 19 文件专项。
- **Action**: 门禁报告按 specification 追溯域（`@test REQ-PRISMA7-*` 命中的 6 个文件）出分，
  并**在同一份 JSON 里保留** `scope.repo_wide_baseline`（score 0 / 281 MISSING_INTENT）作为
  诚实基线，历史债转 Phase 6 CLOSE 的 emergent issue。复现命令：
  `node_modules/.bin/tsx .sprint-state/phase-outputs/run-test-alignment.ts --write`。

### Pattern: AC 的可断言子句与不可断言子句要分开处置，禁止用「整条 AC 有 tag」蒙混

- **Context**: AC-PRISMA7-003-02 同时含「warm p95 ≤2s」（只能隔离测量——套件内并行下会变 flaky，见后一条 Pattern）和
  「冷启动 ≤5s 含 `prisma migrate diff` 子进程」（删缓存才能测，会拖慢其余测试）；
  AC-PRISMA7-005-02 的容器侧执行只能给 tier-(c) 替代证据；AC-003-01 的 CI 子句本质上在 push 之后。
- **Insight**: `@covers AC-*` 标签只证明「有测试引用了这条 AC」，不证明每个子句都被断言。
  若不做区分，100 分是对门禁的误读。
- **Action**: 能稳定断言的子句写成断言——即**决定性能的机制不变量**（模板 Blob 进程内 memoize
  同引用、模板自带 schema 且零行启动、删 `DATABASE_URL` 仍能建库查询、快路径失败时磁盘缓存与
  记忆化值同时作废并可观测降级）；数字预算（warm p95、冷启动 ≤5s）只是
  `docs/ac003-timing-and-memory-evidence.md` 里的隔离测量证据，
  **没有任何测试断言壁钟数值**，这一点写进报告 `disclosures[]` 供 SHIP/CLOSE 复查。

### Pattern: 治理类 AC 的测试要锚定「入库的不变量」，不能锚定 gitignore 的过程工件

- **Context**: AC-002-02（构造点清单勾销）与 AC-006-02（spike 报告）的原始工件
  `prisma-import-inventory.md` / `stage0-spike-report.md` 位于 `.sprint-state/`（已 gitignore）。
- **Insight**: 直接断言这些文件存在，本机恒绿、CI 必红（文件不在仓库里）。
- **Action**: 把 AC 翻译成代码/配置层面的等价不变量——测试域内零 `new PrismaClient(` 构造点、
  生成目录只允许 `import type`；spike 判据锚定已入库的 `tools/spike/prisma7-pglite-spike.mjs`
  里 #0–#12 的函数/注册表项。

### Pattern: 性能 SLA 不要写成套件内壁钟断言，改断言「决定性能的不变量」

- **Context**: AC-003-02 的 warm p95 ≤2s 先按字面写成「循环 20 次实例化并取 p95」。
  隔离测量是 ~230 ms，放进全量套件（`fileParallelism: true`，4 workers）后变成 2356 / 2712 ms，
  直接失败——不是业务代码退化，是 PGlite 实例化在与同机其他 worker 抢 CPU/内存。
- **Insight**: 壁钟断言在并行套件里测的是调度噪声，不是被测性质；它会把「预算」变成 flaky 源。
  引擎的 fast path 之所以快，是因为模板 Blob 被进程内 memoize 且已带 schema——这才是可稳定断言的因。
- **Action**: 断言改为确定性形式（`getTemplateDataDir()` 两次调用返回同一引用 + 模板实例零行且带 schema），
  数字预算回到 `docs/ac003-timing-and-memory-evidence.md` 的隔离测量并显式写明
  「并发争用下不可断言」，`@intent` 同步改口径，残留风险进 SHIP 复查清单。

### Pattern: 门禁红灯先做 master 基线对照，再决定是修还是披露

- **Context**: `xp-gate check --all` 在本分支 9/10 失败，失败项是 Gate 6 architecture（2.8/10 Poor，
  219 smells / 4680 pts）。
- **Insight**: 同一命令在主仓库 master 上也返回 EXIT=1、同样 2.8/10（208 smells / 4460 pts）；
  197 vs 183 文件的差值就是本 sprint 新增的测试文件，气味类别全是 legacy 测试里的 Code Clone。
  不看基线就会把历史债当成本 sprint 的回归去「修」，或者反过来把它当噪音直接删断言。
- **Action**: 门禁失败时在 master 复跑同一 gate，比较 EXIT 与指标差值；确认为既有债后写进
  `feedback-log.md` + emergent issues，不在本 sprint 内扩大范围处理。

### Pattern: 生产 .env 启动即生产副作用；`--env-file` 会覆盖同名 shell 变量

- **Context**: 为了做浏览器人工验证，在 Windows 主机上跑 `tsx --env-file=.env src/server.ts`，
  以为把 `DINGTALK_*` 在 shell 里置空就能隔离。
- **Insight**: 两点都不成立。(1) `.env` 的值覆盖了 shell 里的空值（日志 `injected env (24) from .env`），
  进程照常连上了生产 DingTalk Stream（`wss://wss-open-connection.dingtalk.com`，约 30 秒后被杀）；
  本次幸而日志里 0 条 `Received DingTalk message`、0 条 `Resending unsent message`，无消息进出。
  (2) `src/server.ts:316-339` 在 post-listen 会对每条 `ACTIVE/PROCESSING` 且末条非 assistant 的访谈
  **重发消息**，所以「本地起来看一眼 UI」这条路径本身就能对真实用户产生外发动作；
  而去掉 `DINGTALK_*` 又会在 `buildApp` 里抛 `clientId is required`（`src/server.ts:177` 无条件构造）——
  项目当前没有免凭据启动路径。
- **Action**: 需要 UI 人工验证时，用 e2e（Playwright 起 app，PGlite 供数）而不是主机 `.env` 启动；
  把「免凭据启动 + post-listen 重发开关」作为 emergent issue 交给后续 sprint，并在
  `phase4-browser-verification.md` 里留 SKIP 理由而非假装验证过。

### Pattern: 跨 Windows 调用 xp-gate 的 TS 引擎要走本地 tsx + file:// URL

- **Context**: `npx xp-gate check-alignment` 内部再嵌一层 `npx tsx -e`，在 Windows 上抛
  `Cannot find module …npm\bin\npx-cli.js`；且 CLI 用 `path.join(cwd,…)` 生成的反斜杠路径被
  插进 JS 单引号字符串后 `\p` 转义失效。
- **Insight**: 两个坑都是 Windows 路径/嵌套 npx 的产物，与被校验的代码无关。
- **Action**: 直接 `node_modules/.bin/tsx <driver>`，驱动脚本里 import 用
  `file:///C:/…`，路径参数一律正斜杠。
