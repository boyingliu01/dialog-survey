# 云主机资源约束下的部署成本评估（MySQL 适配 / 语言重写）

> 日期：2026-10-24
> 版本基线：dialog-survey v1.11.9（66 个源 TS 文件 / 9,701 行 + 16 个 Nunjucks 模板 / 2,159 行，146 个测试文件）
> 结论先行：**问题 2 的前提不成立——依赖体积的大头是"开发工具被装进生产环境"这个配置缺陷，改动部署脚本即可回收 150–180 MB；问题 1 的收益被高估了（PostgreSQL 服务本身仅约 30–60 MB）。** 两个"大改"都不该做。

---

## 0. TL;DR

| 问题 | 表面结论 | 实测结论 | 建议 |
|---|---|---|---|
| ① 改 MySQL 省一个数据库 | 省掉装 PG 的成本 | PG 服务本身仅 ~30–60 MB RSS / ~50 MB 磁盘；而改 MySQL 要重写 3 个 `String[]` 数组字段、给长文本补 `TEXT` 映射（否则静默截断）、全部 migration 重生成，并**失去 146 个测试文件的执行环境**（PGlite 是 PostgreSQL WASM，无 MySQL 等价物） | ❌ 不改。改用一个**独立 PG 实例**（一个 PG 服务内可并存多个数据库，与本机其他应用零耦合），成本几十 MB，低于任何改造 |
| ② 为减依赖重写 | TS 依赖太重，换语言 | **前提错误**：生产树 373 MB 中约 **225 MB（60%）是构建期工具**（`prisma` CLI + `@prisma/dev` + Studio + `effect` + 内嵌 PGlite + `typescript`），另有 **~20 MB 是零 import 的死依赖 `@langchain/*`**。而 Py/Rust 重写**并不能消除**这类成本——它们同样要装数据库驱动、模板引擎、Chromium | ✅ **已实施（#210）**：磁盘 **373 → 147 MB（-225 MB）**，内存 **-92 MB** |
| ③ Rust 重写 | 性能与占用大幅优化 | **性能不是瓶颈**：实测单实例 ~1,100 rps、消息链 80–152 calls/s，瓶颈在 LLM 往返（数百 ms~秒级）。Rust 侧**没有等价物**替代 Nunjucks 模板 + Alpine.js 管理后台，没有 PGlite 的测试替代，且要**手工重建** DingTalk Stream 重连、乐观锁事务、幂等去重这些已修好的坑 | ❌ 不做。唯一值得单独拆出来重写的，是那个最独立、最吃内存的 `export.service`（PDF/Excel，~320 行） |

---

## 1. 先量化：资源到底花在哪

测量方法：`node_modules` 按 `package-lock.json` 的 `packages[*].dev` 标记区分生产/开发树，逐个目录实测；内存用 Node 逐模块加载前后 `process.memoryUsage().rss` 差值（Windows / Node v24.19.0）。**绝对值受平台与 Node 版本影响，以下取 2–3 个数量级的判断，不当作精确数字**。

### 1.1 磁盘

| 项 | 体积 | 说明 |
|---|---|---|
| `node_modules` 全量（含 dev） | **654 MB** / 36,808 文件 / 1,021 个包 | 开发机口径 |
| 其中**生产树**（`npm ci --omit=dev` 实测） | **373 MB** / 307 个包 | 部署机口径（见 §3.2 关于 458 MB 的勘误） |
| **瘦身后实际部署树**（issue #210 完成后实测） | **147 MB** | 删除 147 个纯构建期包 |
| `dist/` 编译产物 | 2.2 MB | 业务代码本体 |
| Playwright Chromium 浏览器 | **~150 MB**（压缩包）/ ~400 MB（解压） | PDF 导出用，`npx playwright install chromium` 单独下载 |
| 仓库内 CJK 字体 | ~十几 MB | PDF 中文字体 |

### 1.2 生产树的构成（× 标记为已在本轮清除）

| 包 | 体积 | 是否真的需要 | 谁引入的 |
|---|---:|---|---|
| `@prisma/client` | 71 MB | ✅ 需要（含全部数据库方言的 WASM 查询编译器，约 60 MB 只用到 1 种） | 直接依赖 |
| **`prisma`（CLI）** × | **40 MB** | ❌ **不需要**——只在 `migrate deploy` / `generate` 时用，是**开发工具** | 见 §3.2 |
| **`@prisma/dev` + `@prisma/studio-core`** × | **84 MB** | ❌ **完全不需要**——Prisma Studio（GUI 数据库浏览器）+ 内嵌 PGlite | 被 `prisma` CLI 引入 |
| `effect` × | 26 MB | ❌ 运行时用不到 | 被 `@prisma/dev` 引入 |
| `@prisma/dev/node_modules/@electric-sql/pglite` | 22 MB | ❌ 运行时用不到（测试用，应走 devDependencies） | 同上 |
| `typescript` | 22.5 MB | ❌ 运行时用不到 | `@prisma/client` 的 **optional peerDependency**，npm 自动装了 |
| `js-tiktoken` × | 21 MB | ❌ 代码里**根本没 import LangChain** | `@langchain/core` 的依赖 |
| `@prisma/engines` × | 21 MB | ❌ 运行时不需要（CLI 用的 schema engine 二进制） | `prisma` CLI |
| `sodium-native` | 17 MB | ✅ 需要（secure-session 加密） | `@fastify/secure-session` |
| `playwright-core` + `playwright` | 17 MB | ⚠️ 仅 PDF 导出需要 | 直接依赖 |
| `@langchain/core` + `@langchain/langgraph` + SDK × | ~20 MB | ❌ **死依赖**：`grep -rn "@langchain" src/` 零命中 | 直接依赖（遗留） |
| `react-dom` / `elkjs` / Radix × | ~20 MB | ❌ 运行时用不到 | `@prisma/studio-core` |
| `xlsx` + `codepage` | 12.5 MB | ✅ 仅 Excel 导出需要 | 直接依赖 |
| 其余 ~180 个包 | ~100 MB | ✅ fastify 插件族、zod、pino、pg 等真实依赖 | — |

**结论**：生产树里 **约 270 MB（实测可删 225 MB）是构建期工具，而非运行时依赖**，其中绝大部分是"开发工具被当生产依赖装上"这一个配置问题（× 标记项），和"用 TS 还是 Rust"毫无关系。

### 1.3 内存（这才是真正吃资源的地方）

逐模块加载实测 RSS 增量：

| 模块 | RSS 增量 | 备注 |
|---|---:|---|
| Node 空进程 | 55 MB | 运行时底座 |
| `fastify` + 全部 `@fastify/*` 插件 | ~16 MB | 框架本体很轻 |
| `zod` + 其余业务库（pg/pino/nunjucks/marked…） | ~13 MB | |
| **`playwright` + `xlsx`** × | **+97 MB** | **只是 `import`，还没启动浏览器** |
| `@prisma/adapter-pg` | +1 MB | 查询在 WASM 里编译，不额外起进程 |
| 应用启动常驻合计（改造前） | **~160–180 MB RSS** | 各模块累计 |
| **应用启动常驻（惰性化后，实测）** | **导出服务仅 +5 MB** | issue #210 A/B 实测：`import export.service.js` 后 RSS `56→61 MB`，改造前同样的加载是 `56→153 MB` |
| 稳态运行（含堆增长） | 200–300 MB | 经验值，`/metrics` 的 `dialog_survey_process_memory_bytes{kind="rss"}` 可实测 |
| PM2 `max_memory_restart` | 500 MB | 仓库既有配置 |

**关键发现**：**`playwright` + `xlsx` 两个"导出功能"的库，光被 import 就吃掉 ~97 MB 常驻内存**（A/B 实测，Node 空进程 56 MB → 153 MB）。这才是"资源占用"问题的真正来源，且和语言选择无关：Python 里 `reportlab`/`openpyxl`、Rust 里 `printpdf`/`rust_xlsxwriter` 也要装进来（Rust 会小一些，但导出功能的根本成本是**无头浏览器**——Chromium 本身 100–200 MB，换语言也省不掉）。

> × 标记项已在 issue #210 中处理：`playwright`/`xlsx` 改为函数内动态 `import()` 并缓存结果，未触发导出时不加载。**实测节省 ~92 MB 常驻内存**（`56→61 MB` vs 改造前 `56→153 MB`）。

### 1.4 数据库服务的真实成本

| 项 | PostgreSQL（现状） | MySQL（对比） |
|---|---|---|
| 空闲 RSS（默认配小 shared_buffers） | **~30–60 MB** | ~300–400 MB（默认配置） |
| 磁盘 | ~50 MB + 数据 | ~200 MB + 数据 |
| **套接字协议** | 独占（PG 不允许与其他服务共用端口） | 独占（同样不允许） |

> 注：RSS 为社区常见经验区间，**不是本机实测**（本机未安装 PG/MySQL）。请把这一行当作"两者都是几十~几百 MB 量级"的定性结论使用。MySQL 默认配置**比 PG 更吃内存**，这是很多人的直觉误区。

---

## 2. 问题 1 评估：改 PostgreSQL → MySQL

### 2.1 结论

**不建议改。** 理由分三层，按重要性排序：

**(a) 省不到你想要的那部分成本。**
企业云主机上装一个 PG 实例的边际成本 ≈ 50 MB 磁盘 + 30–60 MB 内存 + 一个 systemd unit。这和 `node_modules` 里那 225 MB 白装的构建期工具、以及 92 MB 的导出库常驻内存比起来，是零头。**真正的浪费不在这里。**

**(b) 技术上这不是"改个 provider 配置"，是一次数据库移植。**

审查 `prisma/schema.prisma` 与 `src/` 的实际用法后，需要改动的地方：

| 障碍 | 涉及位置 | 严重度 |
|---|---|---|
| **`String[]` 原生数组字段** | `AnalysisReport.keyFindings` / `recommendations` / `emergentTags`（schema 第 144/146/148 行） | 🔴 **MySQL 不支持数组**，必须改成 JSON 字段 `Json` 或关联表；`export.service.ts:163,166,212-219` 直接遍历数组、`admin-templates.ts:200-207` 直接 `for...of` → 需同步改造 |
| **`Json` 字段** | `Template.dimensions/analysisConfig`、`InterviewPlan.inviteeData`、`AnalysisReport.dimensionTags`、`BatchAnalysisReport.metrics/topics/emergents/checkpoint`（共 9 个字段） | 🟡 MySQL 的 `JSON` 类型可用，但 Prisma 的 `Json` 语义在 MySQL 上返回形态不同（字符串 vs 已解析对象），`inviteeData` 在 `interview-plan-members.service.ts:20,200,240,492-501` 有 5 处 `Array.isArray(plan.inviteeData)` 判断，改动后必须逐一回归 |
| **长文本 `String` → `TEXT`** | `Message.content`、`AnalysisReport.content`、`Template.content`、`BatchAnalysisReport.content` 等默认映射为 `VARCHAR(191)` | 🔴 **必须全部显式加 `@db.Text`/`@db.LongText`**，否则长对话/报告会**静默截断**——这是最危险的"看起来能跑"的坑 |
| 唯一索引长度 | `ApiKey.keyHash`、`AnalysisFailure.(interviewId,errorType)`、各类 `@@index` | 🟡 `utf8mb4` 下索引长度上限会触发错误，需要确认字符集与索引长度策略 |
| `TEXT[]` / `JSONB` 语义 | 全库无 `@@index` 建于 Json/数组字段上（已核查） | 🟢 幸运：没有 JSON 路径索引的迁移负担 |
| **全部 migration 重写** | `prisma/migrations/20261004000000_init/migration.sql`（242 行，含 `CREATE TYPE` 枚举）+ `migration_lock.toml` | 🔴 历史记录必须作废重建；`deploy.sh:100`、`Dockerfile:64`、`scripts/cli.mjs:1261` 三处 `migrate deploy` 流程都要改 |
| **测试体系** | 146 个测试文件，集成测试全部跑在 **PGlite（PostgreSQL WASM）** 上（`tests/helpers/pglite-template.ts`） | 🔴 **没有 MySQL 的 WASM 等价物**。改 MySQL 后 146 个测试文件里所有集成测试要么指向真 MySQL（CI 加 service、本地要求装 MySQL），要么**失去数据库层测试能力**。这不是"改一下测试"，是"测试基础设施要重建" |

**(c) 收益是负的。** 改完 MySQL 后：多一条 `VARCHAR` 截断风险、JSON 语义差异风险、`String[]` 数据迁移风险，而换来的只有"少装一个 PG 服务（几十 MB）"。**风险远大于收益。**

> 补充：Prisma 官方文档确认 MySQL 5.6/5.7/8.0/8.4 都在支持矩阵内，`Json` 类型可用，`CASCADE`/`RESTRICT`/`SET NULL` 等引用动作也都支持——所以**理论上可行**，本评估否定它是因为成本收益比，不是因为"跑不起来"。同时注意 Prisma 8 的新 driver 架构里 MySQL 仍是"coming soon"，本项目 pinned 在 Prisma 7.10.0，选 MySQL 会在未来的升级路径上多分叉一个变量。
> （来源：[Prisma v7 Supported databases](https://www.prisma.io/docs/orm/v7/reference/supported-databases)、[Database Features](https://www.prisma.io/docs/orm/v7/reference/database-features)、[Prisma 8 Supported databases](https://www.prisma.io/docs/orm/supported-databases)）

### 2.2 如果非要省：成本更低的 4 个选项（按推荐度排序）

| 选项 | 成本 | 磁盘 | 内存 | 风险 |
|---|---|---|---|---|
| **A. 独立 PG 实例 + 独立端口/用户**（推荐） | 30 分钟 | ~50 MB | 30–60 MB | 无。PG 实例天然支持多数据库共存，与本机其他应用零耦合 |
| **B. Docker 起 postgres:16-alpine** | 10 分钟 | 镜像 ~80 MB | 30–60 MB | 低，但需要 Docker（本身又是磁盘与内存开销） |
| **C. 用 SQLite 替代**（Prisma 原生支持，社区有 pglite→sqlite 路径） | **不是改 provider 就能完成**——`String[]` 在 SQLite 上同样不支持；且 PGlite 测试体系要换 | ~5 MB | 0（进程内） | 🔴 同 MySQL 的技术障碍，但**测试生态还需另建**；且 SQLite 单写者模型与乐观锁事务并发语义不同，生产行为需重测 |
| **D. 远程 PG（另一台机器/云托管）** | 视情况 | 0 | 0 | 🟡 跨机延迟进入每条消息路径（消息链 P95 会明显抬升） |

**推荐 A。** 云主机上 PG 用独立 `initdb` 数据目录 + 独立端口（或直接默认 5432 独占），`DATABASE_URL` 指向本机即可，和现有其他应用（MySQL）**完全不相干**。这里要先纠正一个常见误解：**PostgreSQL 和 MySQL 是两种不同的服务端程序，本来就无法共用一个进程**——"主机上已经有 MySQL"并不构成"不需要 PG"的理由，因为 MySQL 省下的只是"再跑一个几十 MB 的守护进程"这件事。

### 2.3 什么情况下才该考虑改数据库

只有一种：**运维标准强制单一数据库**（例如公司基线只允许 MySQL、不允许额外装服务），且接受 §2.1 的移植成本和测试能力下降。这是运维政策问题，不是技术问题——请让提出方明确"不允许装 PG"这个前提是否真的成立。

---

## 3. 问题 2 评估：为减依赖而重写

### 3.1 结论

**前提不成立，方向错了。** 依赖体积里的 ~180 MB 是"开发工具装进生产环境"的**配置缺陷**，改动部署脚本即可回收；另有 ~20 MB 是零 import 的死依赖；剩下的大头（Playwright/XLSX 导出）是**功能成本**，换语言省不掉多少；而性能从来不是瓶颈。

### 3.2 先把"免费的 225 MB"拿走（已完成，issue #210）

问题根因：`scripts/deploy.sh` 的安装步骤是 `npm ci --ignore-scripts || npm install`（缺 `--omit=dev`），
部署机把全部 devDependencies 都装上了。而 `prisma` CLI 之所以会被带上，是因为它既是
`devDependencies`（`package.json:100`），又通过 `@prisma/client` 的
`peerDependencies: { prisma: "*" }`（optional）被解析。

**执行过程中发现的一个反直觉事实**：单加 `--omit=dev` **并不能**解决问题。
`prisma` 与 `typescript` 在 lockfile 里被标记为 `devOptional`（因为它们是 optional peer），
npm 对它俩的语义是"可能是运行时需要的"，所以 `--omit=dev` **保留**它们，
`npm prune --omit=dev` 也一并保留。实测：`npm ci --omit=dev` 后树仍为 373 MB，
prisma CLI / `@prisma/dev` / `@prisma/studio-core` / `effect` 全部还在。

因此最终实现为一个**从应用本身推导**的瘦身脚本 `scripts/prune-runtime-deps.mjs`：
解析 `dist/` 编译产物里真实的 import，建立运行时依赖闭包（**不含 optional peer**），
删除闭包之外的包，最后校验所有保留包的依赖仍可解析——不通过就以非 0 退出，
宁可让部署失败也不发布残缺依赖树。

| # | 动作 | 实测效果 | 状态 |
|---|---|---|---|
| F1 | `scripts/prune-runtime-deps.mjs` + `deploy.sh` Phase 6.5 调用 | **磁盘 -225 MB（373 → 147 MB，-60%）** | ✅ 已完成 |
| F2 | 删除 `@langchain/core`、`@langchain/langgraph`（连同 `js-tiktoken` 等 18 个包） | **磁盘 -20 MB** | ✅ 已完成 |
| F3/F4 | `playwright`、`xlsx` 改惰性 `import()`（`export.service.ts`） | **内存 -92 MB**（A/B 实测 56→153 MB 变为 56→61 MB） | ✅ 已完成 |

关键排序约束（已写入 `deploy.sh` 注释）：`prisma migrate deploy` 必须在 Phase 4 执行，
**早于** Phase 6.5 的瘦身，否则 CLI 已被删除导致迁移失败。
（`Dockerfile` 走的是另一条路径——先 `node node_modules/prisma/build/index.js migrate deploy` 再启动，
故 Docker 镜像暂未接入该脚本。）

**同时纠正一个关于磁盘的旧结论**：`npm ci --omit=dev` 得到的 373 MB 才是"生产树"的真实基线；
先前报告里"458 MB 生产树"是按 lockfile 的 `dev` 标记算出的，没有计入 `devOptional` 的解析行为。

### 3.3 关于"Python 重写能复用现有依赖"

**不能，而且恰好相反：**

1. **依赖不通用。** Python 服务不需要 node_modules，但它需要自己的 `fastapi` + `uvicorn` + `psycopg`/`asyncpg` + `sqlalchemy` + `alembic` + `pydantic` + `jinja2`… 这是一整套**并列**的依赖树，不是复用。实际磁盘占用 Python 通常更省（无 WASM、无 chromium 依赖），但**你得到的是"换了一套东西要维护"**，不是"复用"。
2. **迁移代价是全量重写。** 66 个文件 / 9.7k 行业务逻辑 + 16 个 Nunjucks 模板（2,159 行）+ 146 个测试文件。按本项目 `docs/langgraph-migration-evaluation.md` 的估算口径（那次只是替换一个 500 行的状态机引擎，估算 4–8 周），**整语言重写的量级至少 3–6 个月**，且期间生产环境无人维护。
3. **重写会重新引入已经修好的坑。** 仓库里沉淀了大量"踩过坑才修对"的行为：DingTalk Stream 的重连与令牌缓存（`stream-client.ts` / `token-manager.ts`）、消息幂等去重（`dedupCache` 1000 条 LRU）+ 用户级锁、乐观锁版本冲突重试（`interview-state.repository.ts` 两阶段提交）、PII 脱敏、SSRF allowlist（`stream-message-utils.ts` 的 `isAllowedWebhookUrl`）、CSRF、PM2 环境变量泄密清理（#193）……**这些是资产，重写等于清零。**

### 3.4 关于"更倾向 Rust"

**先说性能：本项目不是 CPU 或内存受限型，是 I/O 等待型。**

仓库 `docs/reports/loadtest-baseline-2026-10.md` §6 有真实 PG 校准数据：

| 指标 | 实测值 | 说明 |
|---|---:|---|
| 单实例业务 API 吞吐 | ~1,100 rps（部署机）／≥500 rps（弱主机） | 200 并发 P95 197–222 ms |
| 消息 handler 链 | 80–152 calls/s/进程 | 200 并发 P95 1.49 s |
| 无 DB 端点（metrics） | 7,482 rps | 说明框架本身开销不是瓶颈 |
| **真实瓶颈** | **LLM 往返（数百 ms～数秒）+ 钉钉 API** | 报告中明确写了："真实消息延迟由 LLM 往返主导" |

**在一条消息的处理链路里，99% 的时间在等外部 HTTP 响应。** 把运行时的单核性能提升 10 倍、把内存降低 5 倍，对端到端延迟和并发能力的改善**接近于零**——瓶颈在等 LLM。这与"Rust 更快所以更省资源"的直觉相反：**省下的那部分恰好是占比最小的部分。**

**再说 Rust 的具体障碍：**

| 障碍 | 详情 |
|---|---|
| 🔴 **管理后台无处安放** | 16 个 Nunjucks 模板 + HTMX + Alpine.js，服务端渲染。Rust 侧没有 Nunjucks 等价物（`tera`/`askama` 语法不同，模板需**逐行重写**），更没有与 `@fastify/view` 等价的一体化方案。2,159 行模板 + 交互逻辑等于重做一遍前端 |
| 🔴 **PDF 导出仍是 Chromium** | 现在是 Playwright 驱动 chromium。Rust 可以用 `chromiumoxide`，但**无头浏览器照样 100–200 MB**。若改用纯 Rust 的 `printpdf`/`typst`，则 `export.service.ts` 里那段 HTML 渲染（含 CJK 字体 base64 内嵌）**整套要重写**，且导出排版会变 |
| 🔴 **Excel 导出** | `xlsx`（SheetJS）功能完整；Rust 的 `rust_xlsxwriter` 可写但**读/兼容性版图不同**，且当前用的是 `json_to_sheet`/`writeFile` 便捷 API |
| 🟡 **数据库层** | `sqlx`/`diesel` 能力足够，但**乐观锁 + 两阶段提交 + upsert 幂等**这些业务不变量要手工重建；Prisma 的 migration 体系换成 `sqlx migrate` 后，`deploy.sh`/`Dockerfile`/`cli.mjs` 三处流程全部重写 |
| 🔴 **没有测试等价物** | **PGlite 没有 Rust 等价物**（无进程内 PG WASM）。146 个测试文件里所有集成测试要改用真 PG 或 `testcontainers`，**CI 从"零外部依赖"变成"需要 PG service"**——AGENTS.md 明确把"No DB for tests"当作项目核心优势 |
| 🟡 **生态成熟度** | DingTalk Stream（WebSocket 长连接 + 心跳 + 重连 + 令牌缓存）、bcrypt（`bcryptjs` 是纯 JS；Rust 有 `argon2` 但密码哈希算法变更会导致**现有管理员密码全部失效**） |
| 🟡 **团队可维护性** | 现在团队能维护 TS/Python；Rust 的 async 生命周期、`Send`/`Sync` 约束会显著抬高日常改需求的成本。**重写完成那天才开始付这笔账** |

**粗略工期估算（3–6 个月是乐观值）**：业务逻辑移植 6–10 周；DingTalk Stream + LLM 集成 3–4 周；管理后台模板重写 4–6 周；PDF/Excel 重写 3–4 周；测试体系重建 4–8 周；双轨并行验证与灰度 4 周。**期间生产系统无法迭代，且没有任何阶段性收益可提前兑现。**

### 3.5 什么情况下才值得考虑重写（留给未来）

只在这些条件**同时**成立时：

1. 云主机资源真的到了硬上限（先确认：§3.2 的 225 MB 磁盘与 92 MB 内存已经在 #210 里清掉了）
2. 业务量增长到 API 吞吐成为瓶颈（当前 1,100 rps 对应的是内部访谈机器人，量级差得很远）
3. 团队有 Rust 生产经验，且愿意承担 6 个月无功能迭代

**即使那时，也应该先做"绞杀者式"迁移**：先把 `export.service`（PDF/Excel，最独立、最吃内存）拆成独立进程/服务，这是唯一"重写能立刻见效"的部分，且只需重写 ~320 行。

---

## 4. 行动建议（按投入产出比排序）

| 优先级 | 动作 | 工期 | 收益 | 风险 |
|---|---|---|---|---|
| **P0** | 删 `@langchain/*` 死依赖 | ✅ 已完成 | **磁盘 -20 MB** | 🟢 极低 |
| **P0** | 部署树瘦身脚本（派生自 `dist/` 真实 import，非硬编码清单） | ✅ 已完成 | **磁盘 -225 MB（373 → 147 MB，-60%）** | 🟢 已验证 |
| **P0** | **不改数据库**，用独立 PG 实例（§2.2 选项 A） | 30 分钟 | 满足"不额外装一个数据库软件"的诉求 | 无 |
| **P1** | `playwright`/`xlsx` 惰性加载 | ✅ 已完成 | **内存 -92 MB（实测）** | 🟢 已验证 |
| **P2** | 用 `/metrics` 采集部署机真实 RSS，建立基线 | 1 小时 | 让后续所有优化有据可依 | 无 |
| ❌ | 改 MySQL | 3–6 周 | 负收益 | 🔴 高 |
| ❌❌ | Rust / Python 重写 | 3–6 个月 | 性能收益 ≈ 0（瓶颈在 LLM） | 🔴 极高 |

### 给提出这两个问题的同学的一句话总结

> ① PostgreSQL 在这个项目里不是"随便换个配置"就能替掉的——schema 里有 3 个原生数组字段、9 个 JSON 字段、若干长文本列，改 MySQL 要连带改查询代码、重生成 migration、重建测试体系，而 PG 服务本身只占 30–60 MB，比 `node_modules` 里那 180 MB 被装进来的开发工具小得多。**先把那 180 MB 拿走，比换数据库划算一个数量级。**
>
> ② 依赖体积的大头不是"TypeScript 的锅"，是部署脚本把 `prisma` CLI + Prisma Studio + `effect` + 内嵌 PGlite 一起装进了生产环境。换成 Rust 一样要装数据库驱动、一样要装模板引擎、一样要拉 Chromium 做 PDF。而性能上，这条链路 99% 的时间在等 LLM 返回，换运行时把那 1% 优化得很漂亮，用户感知不到——**先把 `playwright`/`xlsx` 改成按需加载，内存实测省 92 MB，这才是"资源紧张"的对症药。**

---

## 5. 附录：测量方法与本机数据

**环境**：Windows 10/11，Node v24.19.0，npm registry 走 npmmirror。仓库为 v1.11.9 checkout，`node_modules` 已完整安装（含 devDeps）。

**磁盘**：按 `package-lock.json` 的 `packages[*].dev` 标记遍历目录求和；`node_modules` 全量 654 MB，生产树（无 `dev` 标记）322 个包 / 458.4 MB，其中直接声明的 29 个依赖合计 109.1 MB，其余 349.4 MB 为传递依赖。

**内存**：逐个 `await import(mod)` 前后读取 `process.memoryUsage().rss`，等待 30 ms 让 V8 稳定后取差值；Node 空进程基线 55 MB RSS。测量脚本临时置于项目根目录（以便 Node 解析 `node_modules`），测完即删。

**未实测项**：PostgreSQL / MySQL 服务的真实 RSS（本机未安装，§1.4 为社区经验区间）；应用稳态 RSS（需部署机 `/metrics` 采集，建议作为 P2 动作补上）。
