# 设计文档 — Issue #149: Prisma 7 + PGlite 集成

| 项目 | 值 |
|------|-----|
| Sprint | sprint-20260929-99（分支 `sprint/2026-09-29-01`；源自 sprint-20260924-15 设计沿用） |
| Issue | #149 feat: Prisma 7 + PGlite 集成 — 解除集成测试对真实 PostgreSQL 的依赖 |
| 日期 | 2026-09-24（v1）· 2026-09-29（v2/v3/v4/v5/v6 修订） |
| 状态 | ✅ 设计已获用户批准（2026-09-24）· ✅ batch-grill-me 共识确认（Q1-Q6 + 6 项默认）· ✅ Delphi 设计评审 R1 → v2 → R2 → v3 → v4 → v5（R3 5M/10m 处置）→ **v6（R4 复审 3/3 APPROVED、均值 0.8933；T 4M/5m + F 4m 落点补强）→ 待 R5 终审** |
| 上游产物 | `requirements-149-v2.md`（需求 v2，R2 APPROVED）· `delphi-r2-report.md`（共识 0.94）· `requirements-reviewed.json` · grill 决策：`docs/sprints/2026-09-24-issue-149/decisions.md` DR-002 |
| 需求绑定 | `head_commit=61d616b5ed954123eb4ee9b0958ba58b61a6c547` · `requirements_hash=c9ede78b52b409c382b37948d6433d82ebf86f49fe059bd475cfe9c979cd514e`（代码等价于 5184fee） |

## 0. v2 修订记录（Delphi 设计评审 R1 → v2）

R1 产物：`.sprint-state/phase-outputs/delphi-round1.json`（architecture：APPROVED；technical：REQUEST_CHANGES 3C/5M；feasibility：调用失败重试）。以下为逐项处置（R2 复审核验对象）：

| R1 问题 | 级别 | v2 处置 | 落点 |
|---------|------|---------|------|
| C-1 门面 `export *` 与 factory 类型身份未验证（strict + nominal brand 风险） | Critical | 新增硬规则：`prisma-factory.ts` 的 `PrismaClient` **必须从门面 `./prisma-client.js` 导入**（禁止直连 `../generated/prisma/client.js`）；spike #9 增加跨路径类型同一性核验 | DD-003 / §4.1 #9 |
| C-2 `cleanup()` 在 `teardown()` 之后「静默 no-op」缺实现落点（现有 cleanup 无 isClosed 守卫，会抛错） | Critical | 明确实现契约：`teardown()` 置 `isClosed=true`；`cleanup()` 首行 `if (this.isClosed) return;`；新增单元断言（teardown 后 cleanup 不抛） | DD-005 / §3.5 |
| C-3 `globalSetup` 守卫对象与 DDL 缓存生成时机冲突（冷启动 2-4s 落入首次 setup，与 p95 ≤ 2s 冲突） | Critical | 明确边界：globalSetup 仅守卫生成物存在性；DDL 缓存惰性生成于首次 setup，单独计量「冷启动 ≤ 5s」，p95 ≤ 2s 仅计 warm 路径 | DD-006 / §3.6 |
| M-1 生产启动路径创建两个 client（探活 + 应用）未显式说明 | Major | 显式声明为**有意保留的 v6 既有行为**（server.ts:66 / :167），DD-010 池参数对两者生效；代码注释登记 | DD-004 / DD-010 |
| M-2 CI generate 步顺序与 dummy env 分支落点缺失 | Major | 明确 generate 步**置于 tsc/test 之前**；spike #8 若需 dummy env → 6 个 job 的 generate 步统一补 `DATABASE_URL: postgresql://placeholder`（落点已定） | DD-008 |
| M-3 spike #11 未实际覆盖 `db push` 的自动 generate 路径 | Major | spike #11 增补「无 devDeps 环境实际执行 db push 并观察生成物写入」步骤 | §4.1 #11 |
| M-4 3 处 vi.mock 域内实例化的 codemod import 改写语义未明确 | Major | 明确：codemod **统一改写**为门面路径；mock 生效域内 `new PrismaClient()` 构造 Mock 实例 = 「不替换为 getSharedTestPrisma」的原意（mock 目标与 import 目标一致，不失效） | DD-005 / §3.4 |
| M-5 性能软目标缺具体参数（maxWorkers / 实例上限） | Major | 给出初始参数：`maxWorkers = min(4, cpus)`、DDL 缓存命中为前提；自动优化路径参数化 | §3.6 |
| A-M1 `export *` 严格再导出核验须进 spike #9 | Major | 已并入 C-1 处置（spike #9 显式核验项） | §4.1 #9 |
| A-M2 cleanup/teardown 竞态须实现级强制 | Major | 已并入 C-2 处置（实现契约 + 单元断言） | DD-005 |

### v3 修订记录（Delphi 设计评审 R2 → v3）

R2 产物：`.sprint-state/phase-outputs/delphi-round2.json`（architecture：APPROVED；technical：REQUEST_CHANGES，确认 v2 已闭环 R1 全部 3C，新提 2C/5M 均为落点/口径细化）。逐项处置：

| R2 问题 | 级别 | v3 处置 | 落点 |
|---------|------|---------|------|
| C-1 `server.ts` 的 `PrismaClient` import 改写未登记（DD-003 硬规则闭环缺口） | Critical | §3.3 server.ts 行显式登记「import 由 `@prisma/client` 改门面路径」，与 factory 同源 | §3.3 |
| C-2 `teardown()` 的 `isClosed` 置位顺序未规定（并发 afterEach 竞态） | Critical | 增硬约束：`isClosed = true` **在任何 await 之前同步置位**（现状 test-db.ts:40-42 即此形态，注释固化） | DD-005 |
| M-1 integration-tests job 时长基线未说明是否含冷启动 | Major | 基线口径明确：job 时长目标按「冷启动 + warm 混合」的**端到端 job 墙钟时间**度量；§3.6 的 setup p95 ≤ 2s 仅针对 warm 单次 setup（两者不混算） | §3.6 |
| M-2 spike #8 未隔离 `.env` 的 dotenv 副作用（本地 .env 会注入 DATABASE_URL 使验证失真） | Major | spike #8 验证方法增补：`env -i`（或临时移走 `.env`）后再跑 `prisma generate`，确保无 DATABASE_URL 注入 | §4.1 #8 |
| M-3 spike #11 的 npm pack 形态与全局安装形态不等价 | Major | spike #11 增补「全局安装形态」验证（`npm i -g` 到隔离 prefix 后执行 `db push`）；若环境受限无法验证，按已知残余风险显式记录并回填 DD-009 | §4.1 #11 |
| M-4 `vi.mock` 的 `importOriginal()` 触发门面模块求值的时机未覆盖 | Major | 契约测试 `prisma-facade.test.ts` 增补断言：门面模块**求值期零副作用**（top-level 无 env 读取/无连接），importOriginal 模式在 7 个 mock 文件中至少 1 处实测通过 | DD-003 / §3.4 |
| M-5 PGlite 单实例内存缺前置估算（OOM 硬判据属事后验证） | Major | §3.6 增补前置估算：按 PGlite 每实例 ~30-80MB 量级 × min(4, cpus) worker 估算峰值，预留 CI runner 余量；超预算即刻降 maxWorkers（先验而非事后） | §3.6 |

### v4 修订记录（R3 预备 → feasibility 预审发现）

feasibility 预审（g-glm-5.3-flash，16k tokens/900s；APPROVED conf=8）产物：`.sprint-state/tools/probe-feas-900.json`。以下逐项处置：

| 预审问题 | 级别 | v4 处置 | 落点 |
|---------|------|---------|------|
| M-A1 计数口径未闭合（83 import 文件 / 33 实例化点 / 27 处 / 27+7 多口径并存且与实测不符），AC#2 不具客观可审计性 | Major | 以 grep 实测统一口径并给出**恒等式闭合**：import 改写文件 **79**（= src 26 + tests 50 + prisma 2 + scripts 1）；构造点 **32**（= 测试域 26 + 非测试域 6）；测试域 26 = (a)22 + (b)3 + (c)1。新增 **Stage A 清单工件** `prisma-import-inventory.md`（grep 派生 + 逐点 a/b/c 标注）作为唯一审计对象，AC#2 绑定该工件 | §1.2 / DD-005 / §3.5 / §8 / AC#2 |
| M-A2 M2（Stage A）无时间盒/中点检查点（最大切片：79 文件 codemod + 32 构造点 + 6 CI job） | Major | §8 各里程碑补时间盒：M1 ≤0.5 天 / M2 ≤1.5 天（含 codemod ~50% 处中点审计：对账 inventory 逐点进度 + `tsc --noEmit` 通过率）/ M3 ≤1 天 / M4 ≤0.5 天 / M5 ≤0.25 天；任一里程碑超预算 2× 即呈报用户 | §8 |
| M-A3 §4.3 将 infra 延迟（CI 排队）与技术 no-go 混同，spike 报告可能误标决策上下文 | Major | 超时口径拆分：**infra-timeout**（预装慢/CI 排队/网络）≠ no-go —— 按改期/等待/本地先行处理并记录为「infra 延迟」；仅**技术判据失败**且 §4.2 映射为 no-go 时才进入 no-go 呈报流程 | §4.3 |
| m-1 AC#5 docker 豁免分支的「替代证据」未定义可接受形态 | Minor | 预定义三级替代证据（按优先级）：(a) `docker build --target builder` 单阶段执行 + runner 阶段静态审查（Dockerfile diff + `npm pack` 产物清单）；(b) buildah/podman 等价工具端到端；(c) 前两者组合 + 显式残余风险声明，经用户门禁确认 | AC#5 |
| m-2 spike #11（npm pack + 隔离 prefix 全局安装 + db push）手工执行可能耗时数小时 | Minor | #11 优先脚本化：pack → 解包 → `npm i --omit=dev` → 执行 db push 全自动；全局形态验证若受环境所限无法在预算内完成，按已知残余风险条款记录（已有） | §4.1 #11 |
| m-3 DD-006「一次自动兜底 generate」与「纯 unit 路径不 spawn prisma CLI」在生成物缺失场景下表述矛盾 | Minor | 澄清：兜底 generate 仅存在于**失败路径**（生成物缺失时）；CI 因 DD-008 显式 generate 步不会命中——「不 spawn」承诺限于**正常路径**（生成物存在 → 守卫零子进程通过） | DD-006 |
| m-4 §3.6 内存启发值（~30-80MB/实例）未实测，先验决策缺实测输入 | Minor | 标注为**设计期启发值**；spike #12 实测单实例 RSS 后**回填替换**，再作为 Stage B maxWorkers 先验决策的输入（现有 OOM 硬判据 + 降阶阶梯仍为兜底） | §3.6 / §4.1 #12 |
| m-5 Stage B 延期的 AC 重基线路径缺失（AC#3/#4/#5 为全有全无语义，无「部分达成」验收） | Minor | 复用 DD-012 降级机制：Stage B 延期/受阻时正式**修订 AC**（保留 Stage A 真 PG 证据 + CI 继续 PG service），修订记录写入 sprint decisions 并在 CLOSE 阶段呈报用户 | DD-007 |

### v5 修订记录（R3 复审 → v5）

R3 产物：`.sprint-state/phase-outputs/delphi-round3.json`（三专家全部 APPROVED：architecture conf=9 无新增关切；technical conf=8 新提 5 Major/5 Minor；feasibility conf=8 新提 5 Minor）。逐项处置（15/15，R4 复审核验对象）：

| R3 问题 | 级别 | v5 处置 | 落点 |
|---------|------|---------|------|
| T-M1 `src/utils/db.ts` 的 `PrismaClient` 类型 import 来源未登记（DD-004 委托工厂后，若 db.ts 仍从 `@prisma/client` 导入类型 → strict + nominal brand 下 not assignable 风险同存） | Major | §3.3 db.ts 行显式登记「`PrismaClient` import 同改门面路径」——与 server.ts / factory 同源，DD-003 硬规则覆盖全部消费方 | §3.3 |
| T-M2 §3.5 的 TestDatabase 重构描述未同步 isClosed 顺序约束；8 个 cleanup 调用点未标注 afterEach/afterAll 归属 | Major | §3.5 措辞与 DD-005 全量对齐（isClosed 早退守卫 + 任何 await 之前同步置位 + JSDoc 双向契约）；inventory 工件为 8 个 cleanup 调用点逐个标注 afterEach/afterAll 归属（afterAll 路径经早退分支 = no-op，语义等价以此为准） | §3.5 / DD-005 |
| T-M3 spike #11「全局安装形态」的受限环境判定标准未定义（BUILD 期主观判断风险） | Major | §4.1 #11 给出**可判定**受限条件：命中 (i) `npm config get prefix` 指向不可写目录且 `--prefix` 重定向不可行，或 (ii) 无 registry 访问（`npm ping` 失败）任一项 → 按已知残余风险条款显式记录并回填 DD-009 | §4.1 #11 |
| T-M4 单文件多实例场景（analysis-api.test.ts 跨实例硬依赖）峰值可能高于 4×2 估算模型；spike #12 未记录单文件最大实例数 | Major | spike #12 增补「单文件最大实例数」实测值，作为 §3.6 maxWorkers 先验决策输入之一 | §4.1 #12 / §3.6 |
| T-M5 `--no-generate` 标志在 prisma@7.10.0 的可用性未列为 spike 核验子项；DD-009 修复项 (c) 缺备选 | Major | spike #11 增补子项「`--no-generate` 存在性核验」（`npx prisma db push --help`）+ 备选链：不可用 → ①`PRISMA_SKIP_GENERATE=1` env ②`--schema` 指向只读路径（按序验证）——结论回填 DD-009 (c) | §4.1 #11 / DD-009 |
| T-m1 codemod 逐目录「目录 → 相对路径」映射表缺失（79 文件路径推导易错） | Minor | inventory 工件附加「目录 → 门面相对路径」对照表（src / tests / tests/e2e / tests/e2e/helpers / prisma / scripts / tools 逐目录一行），BUILD 期按表执行不逐文件推导 | DD-005 / §3.4 |
| T-m2 DDL 缓存键不匹配行为未明确（报错 vs 自动重生成） | Minor | DD-006 明确：缓存键不匹配 → **自动重新 spawn `migrate diff` 并覆写缓存**（非报错、无需手动清缓存）；仅 spawn 失败时报错 | DD-006 |
| T-m3 vitest worker 复用下 PGlite 实例累积未释放风险（fileParallelism + maxWorkers 组合） | Minor | spike #12 增补「单 worker 连续跑 N 文件后 RSS 增长曲线」记录，验证实例释放时机 | §4.1 #12 |
| T-m4 AC#5 替代证据 (a) 的 runner 静态审查清单未定义 | Minor | 给出最小清单：runner 阶段全部 `COPY --from=builder` 源路径逐个核验 ∈ `npm pack` 产物 ∪ 基础镜像（重点三组：`prisma.config.ts` / `dist/**` / `node_modules/**`），交集缺失即整改 | AC#5 |
| T-m5 rebase 后 Stage A CI 证据保真路径缺失 | Minor | DD-007 明确：若 Stage B 前发生 rebase（如解冲突）→ **必须重新触发 `workflow_dispatch` 记录新 run URL**（旧 run 标记作废），门禁证据以新 run 为准 | DD-007 |
| F-m1 M1（≤0.5 天）需在预算内完成 spike 脚本全量编写 + 双平台闭环，为全计划最紧时间盒 | Minor | §4.3 spike 脚本**骨架先行、判据分批填充**：先落骨架 + 核心判据 #0/#1/#8/#9，压测类 #6/#6b/#12 随后补入，避免 M1 尾段集中编写拖爆时间盒 | §4.3 / §8 M1 |
| F-m2 M2 中点审计「tsc --noEmit 通过率」口径不可执行（codemod 半程必然整体不过） | Minor | 中点审计改**双指标**：①`prisma-import-inventory.md` 逐点勾销率（%）②`tsc --noEmit` **错误计数下降趋势**（相对基线计数，不要求通过） | §8 M2 |
| F-m3「超预算 2× 呈报」对 M5（≤0.25 天）过于敏感 | Minor | 升级阈值统一为 `max(2× 预算, 绝对下限 0.5 天)`；M5 实际阈值 = 0.5 天 | §8 |
| F-m4 M1 回滚「零污染」表述与未跟踪文件残留（spike 脚本 / `.sprint-state` 产物）不符 | Minor | 措辞收敛为「**依赖状态零污染**」：`git restore` 仅覆盖受跟踪的 package*.json / lockfile；新增未跟踪文件保留，不影响构建与依赖基线 | §4.3 / DD-007 |
| F-m5 AC#5「/health db ok 本机或 compose 验收」的环境前提未登记 | Minor | §8 M4 登记环境前提：本机 WSL2 PG 或 `docker compose up postgres` 二选一，与 docker 三级替代证据口径并列 | §8 M4 / AC#5 |

### v6 修订记录（R4 复审 → v6）

R4 产物：`.sprint-state/phase-outputs/delphi-round4.json`（三专家全部 APPROVED：architecture conf=9 ratio=0.95；technical conf=8 ratio=0.85；feasibility conf=8 ratio=0.88；均值 0.8933 < 0.90 → 按技能规则继续）。v5 已闭环 R3 全部 15 项；R4 新增项均为「落点已定、验证手段/失败契约未闭合」的执行期补强。**architecture 的 3 Major/3 Minor 为 v5 已处置项的强制核验要求**（逐项映射：db.ts import 强制 → T-M1；isClosed 顺序强制 → R2-C-2/T-M2；spike #12 实例数与 RSS → T-M4/T-m3；`--no-generate` 子项 → T-M5；受限条件 → T-M3；DDL 缓存自动再生成 → T-m2），v6 对其中 3 项增核验锚点（R4-T1/T2/T3 与下列条目同源）。technical 4 Major/5 Minor + feasibility 4 Minor 逐项处置：

| R4 问题 | 级别 | v6 处置 | 落点 |
|---------|------|---------|------|
| R4-T1 `--no-generate` 与两条备选（`PRISMA_SKIP_GENERATE=1` / `--schema` 只读路径）均未核实存在性——若全不可用，DD-009 (c) 无落地手段 | Major | §4.1 #11 go 标准升级：**三路径至少一条实测可用**；全不可用 → 显式记录残余风险（含声明与用户呈报）并回填 DD-009 | §4.1 #11 / DD-009 |
| R4-T2 §3.6 内存模型（4×2×80MB）与「每文件独占 PGlite + 单文件多实例（analysis-api 跨实例）」口径不一致 | Major | §3.6 标注 `maxWorkers` 初始值为「**待 #12 实测后确认**」暂定值：单文件最大实例数 >2 或 RSS 曲线显著高于 ~80MB/实例启发值 → 估算模型失效、先验阈值重定；BUILD 不得以未回填模型做最终决策 | §3.6 |
| R4-T3 (b) 类 3 处 vi.mock 的 importOriginal 因果链未逐点标注验证方式 | Major | inventory 为 (b) 类 3 处各标注「**importOriginal 实测通过**」证据锚点（实测通过前不得勾销该点） | DD-005 |
| R4-T4 `getDb()` fallback 失败行为契约未定义（抛错 vs undefined vs 静默降级） | Major | 明确失败行为 = **抛错**（构造期 PrismaClientInitializationError，与 v6 语义一致；不静默降级、不返回 undefined）；写入 db.ts JSDoc + 反模式观察清单验收项 | DD-004 / §3.3 |
| R4-T5 inventory 对照表 `prisma/` `scripts/` 行未标注包内不可解析约束 | Minor | 两行显式标注「**仅 dev 场景可用**（源码树 + tsx）；发布包内相对门面路径不可解析」 | DD-005 |
| R4-T6 spike #9 失败修复路径（tsconfig 豁免）与 DD-002 冲突 | Minor | §4.2 #9 增第二修复路径：门面改显式 `export type { PrismaClient }`（值符号保留 `export *`）——不改 tsconfig、不与 DD-002 冲突；修复按序 ①generator 选项 ②门面显式 type re-export ③tsconfig 豁免（末选，需正式修订 DD-002） | §4.2 #9 |
| R4-T7 M2 中点审计的 tsc 错误计数基线采集时点未定义 | Minor | 基线采集时点明确为「**依赖升级后、codemod 首文件改写前**」 | §8 M2 |
| R4-T8 dummy env 补入是否污染 job-level env 语义 | Minor | DD-008 注明：dummy env 为 **step-level** env（仅 generate 步作用域），不写入 job-level env，不影响后续 vitest 的 env 读取 | DD-008 |
| R4-T9 AC#5 (a) 核验范围是否含 devDeps 传递依赖 | Minor | 明确核验第一对象 = **builder 阶段实际产物路径**（`docker build --target builder` 后列出）；`npm pack` 清单仅交叉核对发布包形态；devDeps 传递依赖**不参与**核验（runner 仅 COPY builder 产物） | AC#5 |
| R4-F1 基线采集时序未入里程碑（M1 预装后本机基线丢失） | Minor | §8 M1 增首步「**预装前完成本机基线采集**」（`npx vitest run` 变更前实测）；CI 基线从 main 历史 run 均值取回 | §8 M1 / §3.6 |
| R4-F2 spike #12 内存子项需真实 vitest worker 场景，工时未在 M1 列项 | Minor | §4.1 #12 明确载体二选一（①spike 内最小临时 vitest 场景实测 ②顺延 M3 入口补测并留痕），选择记录入 spike 报告 | §4.1 #12 |
| R4-F3 M1/M2 时间盒残余排期风险 | Minor | 已由骨架先行（F-m1）+ 呈报阀（F-m3）+ 中点双指标（F-m2）三项约束收敛为可控残余，明确**不构成阻塞项**、无设计变更；BUILD 期按中点数据动态复核 | §8 |
| R4-F4 docker tier (c) / Stage B 重基线依赖用户同步门禁（用户不可用拖慢收口） | Minor | 登记为操作依赖：用户不可用时 tier (c) 暂缓、沿用 (a)+(b) 组合 + 残余风险声明；Stage B 重基线顺延（不阻塞 M3 其余收口） | §8 M4 / DD-007 |


---

## 1. 目标与范围

### 1.1 目标

1. Prisma 5.22.0 → **7.10.0**（新 `prisma-client` generator，Rust-free）
2. 测试数据库后端 → **PGlite**（in-process WASM PostgreSQL 16，`@electric-sql/pglite@0.5.8` + `pglite-prisma-adapter@0.7.2`）
3. **全部测试**（unit + 6 集成 + 11 e2e，~100 文件）无外部 PG 全绿
4. pr.yml 4 个 job（unit-tests / integration-tests / coverage / e2e-tests）+ publish.yml 移除 postgres service 与 db push
5. 本地 `npm test`（含 e2e）零手动步骤

### 1.2 In Scope

依赖升级、schema/generator/prisma.config.ts、门面模块、生产/测试/脚本/种子全量适配（**v4 口径闭合（M-A1）**: import 改写 **79** 文件 = src 26 + tests 50 + prisma 2 + scripts 1；构造点 **32** = 测试域 26 + 非测试域 6，明细见 DD-005 恒等式；以 Stage A `prisma-import-inventory.md` 工件为唯一审计对象）、CI workflows、发布链路 6 处（Dockerfile / deploy.sh / cli.mjs / publish.yml / package.json / ecosystem 路径疑点）、工具链排除、文档更新、Stage 0 spike 与分阶段执行。

### 1.3 Out of Scope

- `prisma migrate` 工作流规范化（**#152**：仅保留衔接契约，见 DD-006）
- coverage job `if: always()` 修复（**#150**：本 sprint 仅留证据）
- Admin UI Playwright 扩展（#154）、变异测试并行（#155）、Conventional Commits（#153）
- Prisma 8 RC（8 GA 后另开 issue）
- `ecosystem.config.cjs` 的 `dist/server.js` vs `dist/src/server.js` 路径疑点（记为 emergent issue）
- coverage thresholds 缺失（实为既有问题；R1-min15 记录，归入 emergent，不重复占用 sprint 范围）

---

## 2. 设计决策记录（DD）

### DD-001 版本选择

- **决策**: `@prisma/client@7.10.0`、`prisma@7.10.0`、`@prisma/adapter-pg@7.10.0`（三者同版精确 pin）；devDeps `@electric-sql/pglite@0.5.8`、`pglite-prisma-adapter@0.7.2`（精确 pin）
- **理由**: 7.10.0 为 v7 稳定线；adapter 0.x 社区包单入口收敛便于替换；不升 8 RC（升级指南仍在演化）
- **备选**: 直升 8 RC（拒绝：稳定性）；Prisma 6（拒绝：不满足 issue「升级到 7.x」）

### DD-002 生成器与构建路径

- **决策**: `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`；生成物为 **.ts 源码**；tsconfig **不排除** `src/generated`，由 `tsc` 编译进 `dist`；运行时 wasm/query-compiler 由 `node_modules/@prisma/client/runtime` 承载
- **理由**: 官方推荐路径（GitHub prisma/orm#29036 维护者回复）；Dockerfile runner 已 COPY node_modules
- **验证**: BUILD 阶段「无源码树冒烟」：仅 dist + node_modules 环境跑 `node dist/src/server.js` 断言启动与 `/health` 行为

### DD-003 门面模块（单一依赖缝）+ 生产工厂拆分（R1-M1）

- **决策**: 拆两个模块，职责分离：
  - `src/utils/prisma-client.ts` —— **纯符号缝（无副作用）**：`export * from '../generated/prisma/client.js';`（整体 re-export）+ JSDoc 符号清单；**不承载任何构造逻辑**（79 文件 codemod 与 `vi.mock` 的收敛目标）
  - `src/utils/prisma-factory.ts` —— **唯一生产构造点**：导出 `createPrismaClient(): PrismaClient`（内部：读 env + `PrismaPg` adapter + DD-010 连接池参数）；`server.ts` 的 `defaultPrismaFactory` 统一改名引用此符号（消除 R1 指出的「两名一物」）
- **理由**: 79 文件 codemod 与 `vi.mock` 目标收敛到稳定路径；`export *` 在 `isolatedModules` 下对 type-only 符号安全（B 专家核验：本库 `Prisma` 命名空间全部为 `import type` 用法）；纯 re-export 门面**无法承载工厂**（adapter/env/池配置），拆分是唯一自洽结构
- **类型同一性硬规则（v2，R1 C-1/A-M1）**: `prisma-factory.ts` 与所有消费方（含 `server.ts`、测试、seeds）**必须**从门面 `prisma-client.js` 导入 `PrismaClient`，**禁止直连** `src/generated/prisma/client.js`。理由：Prisma 7 生成 client 含私有 brand/内部字段，strict 模式下跨模块路径的两份类型可能被判 not assignable；单一导入路径消除该风险。核验落到 spike #9（断言：门面导出类型与生成目录类型相互 assignable + `prismaFactory` 返回值可赋给 `BuildAppOptions.prismaFactory` 形参）。
- **符号清单（清点基准，Stage A 逐项验证）**: 值 —— `PrismaClient`、`InterviewStatus`、`SendStatus`、`TemplateStatus`、`PlanStatus`、`BatchReportStatus`、`BatchReportType`；类型 —— `Prisma` 命名空间（`Prisma.InputJsonValue`、`Prisma.InterviewPlanUpdateInput`、`Prisma.TransactionClient` 等）、model 类型
- **契约测试** `tests/prisma-facade.test.ts`: 断言运行时符号（PrismaClient + 6 枚举）与类型符号（`Prisma.*`，经 `expectTypeOf` / `*.test-d.ts` 形态）可用；**并断言门面 import 无副作用**（不建连、不读 env 抛错——保「unit 不触 DB」分层）；**v3 增补（R2 M-4）**: 断言门面**模块求值期**零副作用（top-level 无 env 读取/无连接/无异常），并至少在 1 个 vi.mock 文件实测 `importOriginal()` partial-mock 模式（门面求值期安全 → mock 生效域不因门面报错而整文件失败）
- **备选**: 逐符号命名导出（拒绝：79 文件改造后补漏成本高，完整性校验难）；`export type *` 叠加（拒绝：无增量收益）

### DD-004 prismaFactory 注入缝

- **决策**: `BuildAppOptions` 增加 `prismaFactory?: () => PrismaClient`，与既有 `fastifyFactory` 同构；消费点 `options.prismaFactory ?? createPrismaClient`（`defaultPrismaFactory` 即 `src/utils/prisma-factory.ts` 的 `createPrismaClient`，命名统一——R1-M1）；`checkDatabaseConnection(prismaFactory: () => PrismaClient = createPrismaClient)` 显式参数化（默认参数保持 `startServer()` 零改调用）；buildApp 对自己持有的 client 在 `onClose` 调 `$disconnect()`（与 TestDatabase.teardown 的双重断连幂等无害，写入代码注释）
- **双 client 显式声明（v2，R1 M-1）**: 生产启动路径 `startServer()` 会**有意**创建两个 client —— ①`checkDatabaseConnection()` 的探活 client（server.ts:66，探活后即断连）②`buildApp()` 持有的应用 client（server.ts:167）。此为 v6 既有行为，本 sprint 保持不变（零回归面）；DD-010 连接池参数对两者同时生效。在 `checkDatabaseConnection` 与 `buildApp` 的 JSDoc 中登记该事实，避免后续误判为泄漏。
- **§3.3 连带（R1-M1）**: `src/utils/db.ts` 的 `getDb()` 改为**委托 `createPrismaClient()`**（构造模型与生产一致——原「行为不变」措辞与 v7 adapter 模型冲突）；`getDb()` 唯一消费点 `src/core/graph.ts:65` 为 fire-and-forget 回退，生产调用方 `stream-message.service.ts:222/278` 始终显式传 prisma（A 专家核验：近似不可达）→ 代码与 JSDoc 注明「fallback 近似不可达；如需启用须确保 DATABASE_URL 存在」，并登记反模式观察清单；**失败行为契约（v6 R4-T4）**: 该路径在 DATABASE_URL 缺失/无效时**抛错**（构造期 PrismaClientInitializationError，与 v6 语义一致）——不静默降级、不返回 undefined/空 client；行为写入 db.ts JSDoc 并纳入反模式观察清单验收项
- **理由**: PGlite 内存库无 TCP 监听，`DATABASE_URL` 隐式共享机制物理不可行；注入是 e2e 与生产路径共享同一 client 的唯一通路

### DD-005 TestDatabase → PGlite（含 Stage A 中间态 + createTestPrisma 契约 — R1-C2/M2）

- **决策**: `tests/helpers/test-db.ts` 重构：每实例独占 in-memory PGlite；`setup()` = 新建 PGlite + 回放 DDL（缓存）；`getPrisma()` 返回 `new PrismaClient({ adapter: new PrismaPgAdapter(pglite) })`；**`cleanup()` 保留现有语义**（表数据清理，服务 afterEach 用例间隔离——6 个集成测试实测依赖此语义）；**重构既有 `teardown()`**（现状已存在：test-db.ts:40 `$disconnect` + 恢复 env——R1-min2 勘误）为新语义：`$disconnect` + 关闭 PGlite 实例 + 幂等 `isClosed` 守卫（移除 env 恢复逻辑）；**`cleanup()` 在 `teardown()` 之后调用 = 静默 no-op**（防 afterEach/afterAll 顺序踩坑；**v2 实现契约（R1 C-2/A-M2；v3 顺序闭环 R2-C-2）**：现状 `cleanup()`（test-db.ts:56 起）直接 `this.prisma.<model>.deleteMany(...)` 且无守卫，teardown 后调用会抛错——故 v2 明确 `cleanup()` 首行增加 `if (this.isClosed) return;`，两方法 JSDoc 双向注明顺序契约，并新增单元断言（`await teardown(); await cleanup({...})` 不抛错、静默返回）；**v3 顺序硬约束**：`teardown()` 的 `this.isClosed = true` 必须**在任何 await 之前同步置位**（现有实现 test-db.ts:40-42 已是此形态，保持并注释固化），后续 `$disconnect()` / PGlite `close()` 的 await 期间并发 `cleanup()` 只会命中早退分支——竞态闭合；废弃 `getDatabaseUrl()` 与 `process.env.DATABASE_URL` 改写
- **Stage A 中间态规格（R1-M2）**: Stage A（真 PG 阶段）的 TestDatabase = 保留现有 setup 流程（migrate deploy → db push 回退，指向 TEST_DATABASE_URL）+ client 换 `PrismaPg(TEST_DATABASE_URL)`；Stage A→B 的 diff 面**仅限** adapter 与 `setup()` 内部实现（公共签名不变）；M2 门禁按此规格核验
- **createTestPrisma() 契约（R1-C2，BUILD 期逐点审计依据）**:
  - 新增 `tests/helpers/create-test-prisma.ts`（**Stage A 即引入**，内部先用 `PrismaPg(TEST_DATABASE_URL)`；Stage B 仅替换其内部实现为 PGlite——R1-M2 切分修正）：
    - `getSharedTestPrisma(): Promise<PrismaClient>` —— **文件级单例**（同文件多次调用共享同一实例/库）；disconnect 所有权归 `afterAll`/`teardown`
    - `createTestPrisma(): Promise<PrismaClient>` —— 独立实例（仅限真正需要隔离的场景）；调用方负责 `$disconnect()`
    - **异步初始化**：PGlite DDL 回放本质异步 → 返回 Promise；**模块顶层 eager 构造必须惰性化**（顶层 `const prisma = ...` → `let prisma` + `beforeAll(async () => { prisma = await getSharedTestPrisma(); })`）
  - **测试域替换三分类（v4 计数闭合，M-A1；实测快照 2026-09-29，最终以 Stage A 工件为准）**（不再「统一替换」——R1-C2/B-Major）: 测试域构造点 **26** = 25 个测试文件内调用点 + 1 helper 内部:
    - (a) 真实 DB 实例 **22 处** → `getSharedTestPrisma()`；同文件多实例共享库语义保持（analysis-api.test.ts:13/:103 跨实例硬依赖实证）；**其中顶层 eager 形式 17 处**须同并做 beforeAll 惰性化改造（loudly fail，不静默错绿——原 (c) 类并入 (a) 的改造手法，不独立计数）
    - (b) **vi.mock 域实例 3 处（admin-templates-integration:232、admin-templates-import:160、server-api:71）→ 不替换**（处于 mock 生效域内，创建的是 Mock/Fake 实例）；**v2 语义澄清（R1 M-4）**：codemod 对全部文件（含这 3 处）**统一改写 import 为门面路径**，因此这 3 处 `new PrismaClient()` 构造的是 vi.mock 注入的 Mock 类——mock 目标与 import 目标一致（均为门面路径），mock 不失效；「不替换」专指**不改写为 `getSharedTestPrisma()`**，与 import 改写不冲突；**v6 R4-T3 证据锚点**: inventory 为 (b) 类 3 处各标注「importOriginal 实测通过」锚点（实测通过前不得勾销该点）
    - (c) **helper 内部构造 1 处**（test-db.ts:17）→ 随本 DD 重构为 `new PrismaClient({ adapter })`
  - **恒等式（验收审计基准，v4 M-A1）**: 测试域 26 = (a)22 + (b)3 + (c)1；非测试域构造点 6 = server.ts:66 / server.ts:167 / db.ts:13 / seed-satisfaction-survey.ts:4 / seed-test-interview.ts:4 / fix-max-followups.ts:17；构造点总计 32 = 26 + 6；vi.mock 文件 7（§3.4 清单）
  - **Stage A 清单工件（v4，M-A1；v5 T-m1/T-M2 补强）**: `.sprint-state/phase-outputs/prisma-import-inventory.md` —— grep 派生全量清单（79 import 文件 + 32 构造点 + 测试域 26 三分类逐点标注 a/b/c，含文件:行号），BUILD 期首步重新生成（允许设计→BUILD 间的自然漂移，数字以工件为准）；**AC#2 的唯一审计对象**：替换进度与完成以工件逐点勾销计；**附带对照表（v5 T-m1）**: 「目录 → 门面相对路径」映射表（如 `src/*` → `../utils/prisma-client.js`、`tests/*` → `../src/utils/prisma-client.js`、`tests/e2e/*` → `../../src/utils/prisma-client.js`、`prisma/`、`scripts/`、`tools/` 逐目录一行），BUILD 期按表执行 codemod 不逐文件推导；**附带 cleanup 归属列（v5 T-M2）**: 8 个 cleanup 调用点逐个标注 afterEach / afterAll；**dev 场景标注（v6 R4-T5）**: `prisma/` 与 `scripts/` 两行显式标注「仅 dev 场景可用（源码树 + tsx）；发布包内相对门面路径不可解析」
  - **§4.1 增补判据 #12**: 顶层同步构造 + DDL 就绪时序核验（首查询不落空 schema）；单文件多实例的内存/时长实测
- **8 个 cleanup 调用点（v5 T-M2 补强）**: 保留调用形态（afterEach deleteMany / afterAll 整库丢弃），逐点审计确认语义等价；**inventory 工件为每个调用点标注 afterEach / afterAll 归属**——afterAll 路径下若 `cleanup()` 仍被调用，依赖 `isClosed` 早退分支静默返回（语义等价确认即以此为准）；`isClosed` 顺序硬约束见上（任何 await 之前同步置位）

### DD-006 测试 schema 初始化

- **决策**: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`（v7 参数，已核实）生成 DDL；抽象 `applyTestSchema(pglite)`；缓存文件 `node_modules/.cache/dialog-survey/test-schema.sql`，缓存键 = `schema.prisma` 内容 SHA-256；**缓存失效行为（v5 T-m2）**: 缓存键不匹配 → **自动重新 spawn `migrate diff` 并覆写缓存文件**（非报错、无需手动清缓存；仅 spawn 失败时报错并指向 `npm run prisma:generate` 前置检查）；**vitest `globalSetup` 职责收缩（R1-M6）**：只做生成物存在性守卫（缺失则报错指向 `npm run prisma:generate`，一次自动兜底 generate）；**DDL 生成与缓存逻辑惰性化到 TestDatabase 首次 setup**（避免 smoke/纯 unit 路径 spawn prisma CLI 子进程，保护 §3.6 时长目标与「unit 不触 DB」分层）
- **守卫对象与时机边界（v2，R1 C-3）**: 明确二者边界，消除冲突 —— ①`globalSetup` **仅**守卫「生成物存在性」（`src/generated/prisma` 缺失 → 报错指向 `npm run prisma:generate`，一次自动兜底 generate）；**不**守卫 DDL 缓存、**不**预生成 DDL。②DDL 缓存（`node_modules/.cache/dialog-survey/test-schema.sql`）的生成**惰性发生在首次 `TestDatabase.setup()` 内**（spawn `prisma migrate diff` 约 2-4s）。③因此「冷启动 2-4s 落在首次 setup」是**设计接受**的代价，与 §3.6 的口径切分配套：`setup()` p95 ≤ 2s **仅计 warm 路径**（缓存命中）；冷启动单独计量（首次 setup ≤ 5s 含 DDL spawn）。④理由：把 DDL 预生成放进 globalSetup 会让 smoke/纯 unit 路径也 spawn prisma CLI，违背「unit 不触 DB」分层与时长保护。
- **冷启动口径（R1-min13 → v2 修订）**: CI 每次 `npm ci` 后缓存为冷启动（DDL diff 子进程约 2-4s，按「冷启动 ≤ 5s」单独记录，不计入 warm p95）；helper 采用惰性初始化（首个查询时才创建 PGlite + 回放 DDL；从不查询 DB 的文件零成本）
- **兜底 generate 语义澄清（v4，m-3）**: 「一次自动兜底 generate」仅存在于**失败路径**——生成物缺失时（本地未跑过 `npm run prisma:generate`）；CI 因 DD-008 在 6 个 job 显式 generate，正常路径不会命中该分支。故与「纯 unit 路径不 spawn prisma CLI」不矛盾：「不 spawn」承诺限于**正常路径**（生成物存在 → 守卫直接通过、零子进程）
- **衔接契约（#152）**: `applyTestSchema()` 内部当前实现 `fromDatamodel()`；#152 完成后切 `fromMigrations()`（拼接 migrations SQL）——双向链接已写入 #152 DoD
- **零扩展预期**: `@default(uuid())` 为应用层生成，DDL 无 `CREATE EXTENSION`（spike 判据 #1 验证）

### DD-007 分阶段执行与回滚

- **决策**: Stage 0 spike（≤0.5 天，go/no-go，含依赖预装） → Stage A（Prisma 7 + 真 PG 全绿） → Stage B（PGlite 替换 + CI service 移除）；两 Stage 在同一 PR 内以两个里程碑提交推进
- **Stage 范围切分修正（R1-M2/C-M1；v4 计数闭合 M-A1）**: v7 的 `PrismaClient` 构造强制传 adapter（类型层+运行时）→ 全部构造点（实测 32：测试域 26 + 非测试域 6）在 Stage A 就必须改造（否则 tsc 无法通过）：
  - **Stage A 含**: `create-test-prisma.ts` helper（PrismaPg 版）+ 测试域三分类处置（(a)22 切换、(b)3 语义保持、(c)1 重构）+ 非测试域 6 处（server.ts ×2 / db.ts / seeds ×2 / scripts ×1，经工厂或显式 adapter）+ TestDatabase 适配（DD-005 中间态）+ 工厂拆分 + codemod（79 文件）；门禁 = 真 PG 全量绿
  - **Stage B 含**: 仅替换 helper 与 TestDatabase 的内部实现为 PGlite + e2e 注入 + CI service 移除 + globalSetup；**diff 面收缩、更可回滚**
- **回滚点**: M1 依赖预装后 spike no-go → `git restore package*.json package-lock.json && npm ci`（源码未动，**依赖状态零污染**——v5 F-m4 措辞收敛：仅覆盖受跟踪文件，spike 脚本与 `.sprint-state` 产物等未跟踪文件保留、不影响构建与依赖基线）；Stage A 失败 → `git revert` + `npm ci`（schema 未变，零成本）；Stage B 失败 → 保留 Stage A，CI 继续 PG service，PGlite 推迟
- **合并策略**: PR 采用 **merge commit（禁止 squash）**；Stage A 里程碑提交推送后记录 CI run URL 到 sprint outputs，Stage B 前不得 rebase/squash（保真 Stage A 门禁证据）；**v5 T-m5 兜底**: 若确需 rebase（如解冲突），Stage A 证据以「rebase 后重新触发 `workflow_dispatch` 的新 run URL」为准，旧 run 标记作废
- **里程碑 CI 载体（grill Q5-A）**: pr.yml 顶部新增 `workflow_dispatch:`（一行）——sprint 分支在 Phase 5 建 PR 前，手动触发全量 job 记录 Stage A（有 PG）/ Stage B（无 PG）的 run URL；对正常 PR 流程零影响
- **no-go 处置（grill Q3-A）**: 判定全 no-go 时 M1 即停，产出 spike 报告，呈报用户三选项决策（Plan B / 推迟 / 仅 Stage A），不自动推进
- **Stage B 延期/降级的 AC 重基线（v4，m-5）**: AC#3/#4/#5 为全有全无语义，无「部分达成」验收；若 Stage B 受阻（PGlite 不可行）而 Stage A 保留，参照 DD-012 Y 机制**正式修订 AC** —— 保留 Stage A 真 PG 证据 + CI 继续 PG service，修订记录写入 sprint decisions 并在 CLOSE 阶段呈报用户

### DD-008 CI workflows

- **决策**:
  - pr.yml 4 个有 PG service 的 job（unit-tests / integration-tests / coverage / e2e-tests）逐 job 移除 postgres service + `npx prisma db push`；各 job 的 `TEST_DATABASE_URL`/`DATABASE_URL` env（仅服务 PG 的）一并移除
  - **generate 覆盖（grill Q1-A）**: **6 个 job** 显式新增 `npx prisma generate` 步 —— static-analysis（tsc --noEmit）/ unit-tests / integration-tests / coverage / e2e-tests / smoke（npm run smoke 含 type-check）。理由：v7 生成物位于 `src/generated`（.gitignore 排除），checkout 后缺生成物即失败；security-scan 不跑 tsc/vitest，不需要
  - **步序硬规则（v2，R1 M-2）**: generate 步**必须置于**同 job 内任何 `tsc` / `vitest` / `npm run smoke` 之前（static-analysis 的 Biome→**generate**→tsc→ast-grep；其余 job 的 npm ci→**generate**→测试命令），否则严格模式下类型报错为假失败
  - **触发载体（grill Q5-A）**: pr.yml 顶部新增 `workflow_dispatch:`（一行）；sprint 分支里程碑提交推送后手动触发全量 job，作为 Stage A/B 门禁证据载体
  - publish.yml 同步对齐：移除 postgres service + db push；**清理 `secrets.DATABASE_URL` env（含测试 env 段——R1-min5）**；**并在 `npm run test:coverage` 与 `npm run build` 之前新增 `npx prisma generate` 步**（v7 下 db push 不再自动 generate，且生成物不入库）
  - **node 版本单一来源（R1-min9）**: 各 job `setup-node` 改用 `node-version-file: '.nvmrc'`（DD-009 加入 20.19），engines / .nvmrc / CI 三者同源
- **generate 的 env 注意（v2 落点已定，R1 M-2）**: `prisma.config.ts` 的 `env("DATABASE_URL")` 在 generate 阶段是否强制校验尚未确认 → spike 判据 #8 验证；**两分支落点均已预定**：若无需 env → 保持现状；若需 dummy env → **6 个 job 的 generate 步统一补 `DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder`**（+ Dockerfile builder 的 generate 步同款），该修改在 Stage B（CI service 移除）时一并落地，不留给 BUILD 期临时决策；**作用域（v6 R4-T8）**: dummy env 为 **step-level** env（仅 generate 步作用域），不写入 job-level env——不影响同 job 后续测试命令的 env 语义（vitest 对 DATABASE_URL 的既有读取逻辑不受影响）
- **保持不动**: coverage job 的 `if: always()`（#150 范围）；test 执行命令与 reporter

### DD-009 发布链路适配

| 位置 | 变更 |
|------|------|
| Dockerfile | builder 保持 `npm ci --ignore-scripts` → `npx prisma generate` → `npm run build`；**runner 阶段增加 COPY `prisma.config.ts`**（容器内 db push 场景） |
| scripts/deploy.sh | Phase 4-8 的 generate/db push 保留（v7 需显式 generate）；`.env` 加载职责移交 prisma.config.ts（dotenv 已是依赖）；Node 最低版本校验同步 20.19（**semver 口径，非 major-only——R1-min11**） |
| scripts/cli.mjs | 移除 `npx prisma generate` 步骤（发布包交付已编译 client）；保留 `db push`，CLI 版本 pin `prisma@7.10.0`；**三项修复（R1-C1/C-M2）**: (a) `filesToCopy` += `prisma.config.ts`（cli.mjs:655-662 为显式白名单，仅加进 package.json `files` 不够）；(b) `verifyInstallation.requiredFiles` += `prisma.config.ts`；(c) `db push` 的自动 generate 行为按 spike **#11** 核验——若默认生成则加 `--no-generate`（防写入安装目录）；**v5 T-M5**: `--no-generate` 存在性核验 + 备选链（`PRISMA_SKIP_GENERATE=1` → `--schema` 只读路径）结论回填本行；**v6 R4-T1**: 备选链存在性同样实测（三路径至少一条可用）；全不可用 → 残余风险声明（防全局写入手段缺失）+ 用户呈报；`checkNodeVersion` 升级为 20.19 比较（R1-min4） |
| publish.yml | 移除 postgres service + db push（测试链路与 pr.yml 对齐） |
| package.json | `files` += `prisma.config.ts`；`allowScripts` 移除 Prisma 5 键名（`@prisma/engines@5.22.0`/`@prisma/client@5.22.0`/`prisma@5.22.0`），保留 esbuild/biome；新增 `"prisma:generate": "prisma generate"`；**不添加 postinstall**（消费者全局安装时 devDeps 不存在会失败——关键决策，cli.mjs 交付编译产物） |
| engines | `>=20.19.0`；deploy.sh 与 cli.mjs 同步为 20.19 比较；**加入 `.nvmrc`（20.19）**；CI 用 `node-version-file`（DD-008，R1-min9） |

### DD-010 连接池与生产行为基线

- **决策**: 生产 `defaultPrismaFactory` 显式配置 `PrismaPg({ connectionString, connectionTimeoutMillis, ... })` 对齐 v6 语义（pg driver 默认无 timeout，v6 为 5s）；SSL 行为按部署环境显式声明（不依赖 v6 的宽松默认）
- **理由**: v7 driver adapter 连接池默认值变化是官方标注的高风险点

### DD-011 工具链排除

- `biome.json` 三处（files.ignore / linter.ignore / formatter.ignore）加 `src/generated`
- `vitest.config.ts` `coverage.exclude` 加 `src/generated/**`（防覆盖率坍塌；B 专家核验口径无争议）
- `.gitignore` 加 `src/generated/`；DDL 缓存目录（node_modules/.cache）天然被忽略
- tsconfig **不排除**生成目录（DD-002）
- **architecture.yaml（R1-M5）**: 声明新模块归属 —— `src/utils/prisma-client.ts` 对 `src/generated` 的依赖（登记为 utils 允许依赖或新增 generated 层标注）+ `prisma-factory.ts` 归 utils 层；纳入 AC#7

### DD-012 e2e 策略（主方案 X + 降级 Y/Y'/Y''）

- **主方案 X（默认）**: e2e 全 PGlite 化 —— `e2e-server.ts` 以 `buildApp({ prismaFactory: () => testDb.getPrisma() })` 注入；`npm test`（含 e2e）无 PG
- **降级 Y（触发条件见 §4.2 映射表）**: e2e job 保留 postgres service；`npm test` 排除 e2e；**连锁路径补齐（R1-M7）**: coverage job（pr.yml 全量含 e2e）与 publish.yml `test:coverage` 同步保留 postgres service（或排除 e2e——二选一在触发时按覆盖率基线决策并记录）；**触发时须正式修订 AC#4/#5 并重新基线**（记录到 sprint decisions）
- **Y'（仅 Windows 单平台失败）**: CI 走 PGlite；本地 Windows 保留 PG 可选路径，AC#3 证据口径修订
- **Y''（第三备选，R1-min14）**: PGlite 官方 `pglite-socket` 暴露 PG wire 协议端口，可继续走 `@prisma/adapter-pg` + DATABASE_URL 形态而无需 injection（覆盖「注入缝改造受阻但 PGlite 本身可用」场景）；代价：多一个 socket 进程/端口、Windows 兼容未知——记录为备选，不作默认
- `cli-install.e2e.test.ts` 为子进程模型且用例不触 DB（Stage 0 记录判断依据），不受注入影响

---

## 3. 详细设计

### 3.1 依赖变更清单

```diff
 dependencies:
-  "@prisma/adapter-pg": "^5.22.0"
-  "@prisma/client": "5.22.0"
+  "@prisma/adapter-pg": "7.10.0"
+  "@prisma/client": "7.10.0"
 devDependencies:
-  "prisma": "5.22.0"
+  "prisma": "7.10.0"
+  "@electric-sql/pglite": "0.5.8"
+  "pglite-prisma-adapter": "0.7.2"
```

`dotenv@^17.3.1`、`pg@^8.20.0` 已存在，复用。

### 3.2 schema 与 prisma.config.ts

- `prisma/schema.prisma`: datasource `url` 移出（v7 由 config 接管），generator 按 DD-002
- 新增项目根 `prisma.config.ts`: `import "dotenv/config"` + `defineConfig({ schema, migrations: { path: "prisma/migrations" }, datasource: { url: env("DATABASE_URL") } })`

### 3.3 生产路径改造点

| 文件 | 改造 |
|------|------|
| `src/utils/prisma-client.ts` | 新建**纯符号门面**（DD-003，无副作用，不承载构造逻辑） |
| `src/utils/prisma-factory.ts` | 新建**唯一生产构造点** `createPrismaClient()`（DD-003/DD-004/DD-010） |
| `src/utils/db.ts` | `getDb()` 委托 `createPrismaClient()`（构造模型与生产一致）；**`PrismaClient` import 同改门面路径（v5，R3 T-M1）**——与 server.ts / factory 同源，消 strict + nominal brand 下 not assignable 风险；JSDoc 注明 fallback 近似不可达（R1-M1） |
| `src/server.ts` | `BuildAppOptions.prismaFactory`；`checkDatabaseConnection` 参数化；`buildApp` 消费工厂；`$disconnect` 所有权注释；**`PrismaClient` 的 import 由 `@prisma/client` 改为门面路径（v3，R2-C-1）——`BuildAppOptions.prismaFactory` 形参类型与 factory 返回值同源，否则 strict + nominal brand 下 not assignable** |
| `prisma/seed-satisfaction-survey.ts`、`prisma/seed-test-interview.ts`、`scripts/fix-max-followups.ts` | import 改门面；client 经 `createPrismaClient()`（生产工厂）创建；**注（R1-min10）**: seeds 打进发布包（files 含 `prisma/`）但相对门面路径在包内不可解析 → 明确「seeds 仅 dev 场景（源码树 + tsx）可用」 |

### 3.4 codemod 规则（79 文件）

- `@prisma/client` → 相对门面路径（带 `.js`）：按文件所在目录计算相对路径（src `../utils/prisma-client.js`、tests `../src/utils/prisma-client.js`、prisma/scripts 同理）；**逐目录对照表以 inventory 工件为准（v5 T-m1）**——BUILD 期按表执行，不逐文件推导
- 7 个 `vi.mock` 文件：mock 目标改门面路径；工厂采用 **partial mock 模式**：
  `vi.mock('…/prisma-client.js', async (importOriginal) => ({ ...(await importOriginal()), PrismaClient: MockPrismaClient }))` —— 真实枚举 + mock client，一次解决「工厂缺枚举」问题
- 清单文件：`tests/db.test.ts`、`health-api.test.ts`、`security.test.ts`、`server-api.test.ts`、`server-lifecycle.test.ts`、`admin-templates-integration.test.ts`、`admin-templates-import.test.ts`

### 3.5 测试基础设施

- `tests/helpers/test-db.ts`: 按 DD-005 重构（保留 `setup/getPrisma/cleanup` 公共签名；**重构既有 `teardown`**——非新增）；**重构须同步 DD-005 全部硬约束（v5 T-M2 措辞对齐）**: `cleanup()` 首行 `isClosed` 早退守卫、`teardown()` 的 `isClosed = true` 在任何 await 之前同步置位、两方法 JSDoc 双向注明顺序契约——§3.5 描述与 DD-005 不得存在措辞漂移
- `tests/helpers/create-test-prisma.ts`: 新建（DD-005 契约：`getSharedTestPrisma` 文件级单例 + `createTestPrisma` 独立实例；**Stage A 即引入**）
- `tests/helpers/global-setup.ts`: 新建（DD-006：只做生成物守卫）
- `tests/helpers/test-server.ts`: **仅 import codemod**（createTestServer 直用 testDb.getPrisma()，不经 buildApp，无需注入改造——R1-min3）
- `vitest.config.ts`: `globalSetup` 接入 + `coverage.exclude` 加 `src/generated/**`
- 测试域 26 构造点 → **三分类替换**（DD-005：a22 切换 / b3 语义保持 / c1 重构）；以 Stage A `prisma-import-inventory.md` 工件逐点审计勾销（v4，M-A1）
- `tests/e2e/helpers/e2e-server.ts`: 按 DD-012 注入

### 3.6 非功能基线与目标

| 指标 | 基线采集 | 目标 |
|------|---------|------|
| integration-tests job 时长 | 变更前最近 3 次 CI run 均值 | ≤ 基线（**v3 口径（R2 M-1）**: 按 job 端到端墙钟时间度量，含冷启动；§3.6 的 setup p95 ≤ 2s 仅针对 warm 单次 setup，两者不混算） |
| 本地 `vitest run` 总时长 | 变更前本机实测 | ≤ 基线 ×1.2（**软目标，grill Q4-A**：超出先自动优化 —— maxWorkers / 实例复用 / DDL 缓存命中；仍不达标则记录根因 + 呈报用户确认收口，不阻塞） |
| `TestDatabase.setup()` | — | **v2 口径切分（R1 C-3）**: warm 路径（DDL 缓存命中）p95 ≤ 2s；冷启动（首次 setup，含 DDL diff 子进程 2-4s）单独计量 ≤ 5s——两者分开记录，不混算 |
| 并行度初始参数（v2，R1 M-5；**v3 前置估算 R2 M-5；v4 实测回填 m-4**） | — | `maxWorkers = min(4, os.cpus().length)`、`fileParallelism: true` 起步；**前置内存估算**：按 PGlite 每实例 ~30-80MB（**设计期启发值 — spike #12 实测单实例 RSS + 单文件最大实例数 + 单 worker 连续多文件 RSS 增长曲线（v5 T-M4/T-m3）后回填替换，再作为 Stage B maxWorkers 先验决策的输入**）× worker 数 × 单文件实例数估算峰值（如 4 worker × 2 实例 × 80MB ≈ 640MB，含 Vitest + Node 基线 ~1GB → 预留 CI runner 余量）；预算不足则**先验下调** maxWorkers（先验而非事后）；自动优化阶梯：①DDL 缓存命中确认 ②`maxWorkers` 降至 2 复测 ③单实例复用（同文件内共享库）——每步记录耗时/内存数据，仍不达标则记录根因 + 呈报用户确认收口；**v6 R4-T2 口径一致性**: 回填前 `maxWorkers` 初始值为「**待 #12 实测后确认**」的暂定值——单文件最大实例数 >2 或 RSS 曲线显著高于 ~80MB/实例启发值 → 估算模型失效、先验阈值重定，BUILD 不得以未回填模型做最终决策 |
| CI 内存峰值 | — | **硬判据（R2-B）**: 全量无 OOM；否则显式配置 maxWorkers 后复跑通过 |

---

## 4. Stage 0 Spike 协议（≤0.5 天）

### 4.1 go/no-go 判据

| # | 判据 | 方法 | go 标准 |
|---|------|------|---------|
| 0 | 适配器兼容性（R2-C） | `pglite-prisma-adapter@0.7.2` peerDeps 兼容 `@prisma/client ^7`；`npm ls` 无 peer 警告 | 无警告 |
| 1 | DDL 生成与回放 | `migrate diff --from-empty --to-schema … --script` → PGlite exec | 成功、无 CREATE EXTENSION |
| 2 | 全 schema 特性 | **10 model**（R1-min1 勘误：含 AuditLog/ApiKey）/ 6 enum / String[]×3 / Json×8 / uuid / 复合索引 CRUD + relation | 全部通过 |
| 3 | 交互式 `$transaction` | 嵌套/回滚；对齐 5 处生产用法（interview-state.repository:44,159、interview-plan-members.service:126,204、api/plans.ts:512） | 语义与真 PG 一致 |
| 4 | `$queryRaw` tagged template | server.ts:70、api/health.ts:28 形态 | 通过 |
| 5 | P2002 唯一约束冲突错误码 | 与真 PG 行为比对 | 一致 |
| 6 | Fastify 层**混合负载**（R2 修正 + R1-M3）：20 并发 HTTP 请求（多普通请求 + 长事务并发混合）打到共享 PGlite | 压测断言 | 无死锁/数据错乱 |
| 6b | 并发交互式事务（R2-C） | 双 `$transaction` 同行乐观锁更新（复现 interview-state 乐观锁） | 一方冲突、一方成功（非串行化假绿/交错假红） |
| 7 | 双平台 | Windows 本机 + ubuntu-latest | 均通过 |
| 8 | generate 阶段 env 校验（grill 默认项；**v3 隔离性 R2 M-2**） | 无 `DATABASE_URL` 环境（模拟 Dockerfile builder / CI）跑 `npx prisma generate`；**必须 `env -i` 或临时移走 `.env` 后再跑**（否则 `prisma.config.ts` 的 `import "dotenv/config"` 会注入本地 `.env` 的 DATABASE_URL 使验证失真）；观察 `prisma.config.ts` 的 `env()` 行为 | 明确结论：无 env 可跑 **或** 需 dummy env（记入 CI + Dockerfile 预案） |
| 9 | 生成物在 strict tsconfig 下编译（R1-M3；**v2 扩充 C-1/A-M1**） | 临时提交生成物 + `tsc --noEmit`（**strict 严格项全集**，非仅 EOPT/isolatedModules）+ 门面 `export *` 对 DD-003 符号清单逐项可用性 + **跨路径类型同一性**：断言门面导出的 `PrismaClient` 与 `src/generated/prisma/client.ts` 的类型相互可赋值，且 `createPrismaClient()` 返回值可赋给 `BuildAppOptions.prismaFactory` 形参（factory 从门面导入，DD-003 硬规则） | 零错误 + 符号完整 + 类型同一性通过 |
| 10 | 生产 adapter 路径（R1-M3） | bare `createPrismaClient()`（DD-010 配置）连真 PG：`PrismaPg` 合法性 + 池 / `connectionTimeoutMillis` / SSL 行为 | 与 v6 行为对齐，无回归 |
| 11 | 全新安装场景（R1-M3 / 收口 C1；**v2 扩充 M-3 / v3 全局形态 R2 M-3 / v4 脚本化 m-2 / v5 T-M3+T-M5**） | 无 devDeps 环境（`npm pack` 产物解包 + 仅生产 deps）`npx prisma@7.10.0` 加载 `prisma.config.ts` 可解析性（defineConfig 运行时 import vs type-only import vs 纯对象三形态）+ **实际执行 `db push`**（指向一次性 schema/database，观察是否写入生成物与写入位置）+ 观察自动 generate 触发 + **全局安装形态复核**（隔离 prefix `npm i -g` 后执行 db push）+ **受限条件（v5 T-M3，可判定）**：命中 (i) `npm config get prefix` 指向不可写目录且 `--prefix` 重定向不可行，或 (ii) 无 registry 访问（`npm ping` 失败）任一项 → 按已知残余风险条款显式记录并回填 DD-009；**`--no-generate` 存在性核验（v5 T-M5 子项）**：`npx prisma db push --help` 确认标志可用性；不可用时按序验证备选链 ①`PRISMA_SKIP_GENERATE=1` env ②`--schema` 指向只读路径——结论回填 DD-009 修复项 (c)；**优先脚本化**（pack → 解包 → `npm i --omit=dev` → db push 全自动，避免手工数小时） | 结论定案：config 写法 + 是否需 `--no-generate`；**且三路径（`--no-generate` / `PRISMA_SKIP_GENERATE=1` / `--schema` 只读路径）至少一条实测可用（v6 R4-T1）**——全不可用则显式记录残余风险（含声明与用户呈报）并回填 DD-009 |
| 12 | createTestPrisma 时序（R1-C2；**v5 T-M4+T-m3；v6 R4-F2**） | 顶层同步构造 + DDL 就绪时序（首查询不落空 schema）；单文件多实例内存 / 时长实测 + **单文件最大实例数实测值（v5 T-M4）** + **单 worker 连续跑 N 文件后 RSS 增长曲线（v5 T-m3，验证实例释放时机）**；**内存子项载体二选一（v6 R4-F2）**: ①spike 内最小临时 vitest 场景实测 或 ②顺延 M3 入口补测并留痕——选择记录入 spike 报告 | 无 schema 落空；内存 / 时长符合 §3.6；最大实例数与 RSS 曲线作为 §3.6 maxWorkers 先验决策输入 |

### 4.2 判据 → 结论映射表（决策人：用户 / sprint owner）

| 失败判据 | 结论 |
|---------|------|
| #0 / #1 / #2 | 全 no-go → 仅执行 Stage A；记录决策，评估 Plan B 或推迟 |
| #3 / #5 | 集成测试核心语义不可行 → 全 no-go（仅 Stage A） |
| 仅 #6 / #6b | 触发降级预案 Y（e2e 保留 PG service + 修订 AC） |
| 仅 #7（Windows） | 触发 Y'（CI PGlite、本机保留 PG 可选） |
| 仅 #8 | 非 no-go：按结论在 CI / Dockerfile 的 generate 步补 dummy env 即可 |
| #9 | 非 no-go：Stage A 内按序修复——①generator 选项 ②门面显式 `export type { PrismaClient }`（值符号保留 `export *`，不改 tsconfig、不与 DD-002 冲突）③tsconfig 豁免（末选，需正式修订 DD-002）；修后重验（v6 R4-T6） |
| #10 | 生产路径回归 → 呈报决策（调整 DD-010 配置或推迟 Stage B） |
| #11 | 非 no-go：按结论落地 prisma.config.ts 写法与 cli.mjs `--no-generate`（回填 DD-009） |
| #12 | 非 no-go：helper 契约调整（惰性化范围 / 共享策略修订） |

**no-go 处置（grill Q3-A）**: 全 no-go 判定成立时 M1 即停 —— 产出 spike 报告，呈报用户三选项决策（Plan B / 推迟 / 仅 Stage A），不自动推进。

### 4.3 执行载体（grill Q2-A / Q6-A）

- **环境**: 主 worktree 先做依赖预装（package.json → v7 + pglite，`npm install`）→ **预装后立即 `npm ls` 检查零 peer 警告（R1-min8 前置拦截：有警告先处置再跑 spike）** → 跑 spike；no-go 时 `git restore package*.json package-lock.json && npm ci` 回滚至**依赖状态零污染**（v5 F-m4：仅覆盖受跟踪文件；spike 脚本 / `.sprint-state` 产物等未跟踪文件保留，不影响构建与依赖基线）
- **脚本**: `tools/spike/prisma7-pglite-spike.mjs`（纯 node 可重跑工具，**永久保留** —— 未来 Prisma 8 / 适配器升级复检复用）；**骨架先行、判据分批填充（v5 F-m1）**：先落脚本骨架 + 核心判据 #0/#1/#8/#9（day-0 可跑），压测类 #6/#6b/#12 随后补入——避免 M1 尾段集中编写拖爆时间盒
- **超时口径（R1-min8 / C；v4 拆分 M-A3）**: ≤0.5 天为「预装 + 双平台闭环」总预算。两类超时分开处置：①**infra-timeout**（依赖预装慢 / CI 排队 / registry 或网络慢）**≠ no-go** —— 按改期 / 等待 / 本地先行（跑通本地后异步等 CI）处理，记录为「infra 延迟」；若延误使 spike 超出时间盒，呈报用户裁决是否改期（不标 no-go，避免误标决策上下文）。②**technical no-go**：判据失败且 §4.2 映射为 no-go 的情形——才进入 no-go 呈报流程（三选项 / 不无限等待）
- **双平台**: 本机 Windows 先跑 → 推 sprint 分支 → 触发 `.github/workflows/spike-prisma7.yml`（`workflow_dispatch` + `push` 的 spike paths 过滤双触发——R1-min15，**永久保留**）在 ubuntu-latest 复跑同一脚本；本地跑通后即可异步等 CI 结果，缩短关键路径
- **retry 观察（R1-min15）**: 记录 `retry:1` 在 PGlite 用例上的触发次数（spike #6/#6b 与 Stage B 后全量）；若 retry 掩盖真实失败（同一用例反复重试才绿）→ 对 PGlite 用例单独评估 `retry:0`，结论记入 spike 报告

产出：`.sprint-state/phase-outputs/stage0-spike-report.md`（判据逐项结果 + 结论）。

---

## 5. 采纳清单落实

### 5.1 R2 采纳清单（对应 delphi-r2-report.md §R2 非阻塞采纳）

| # | 项 | 落实位置 |
|---|-----|---------|
| 1 | 命名空间 re-export 策略显式化 | DD-003（选 `export *` + 契约测试） |
| 2 | spike #0 / #6b / #6 修正 | §4.1 |
| 3 | cleanup() 粒度定义 | DD-005 |
| 4 | 内存硬判据 | §3.6 |
| 5 | 降级 Y 映射表 + 决策人 | §4.2 |
| 6 | Stage A 门禁证据固化 | DD-007 |
| 7 | Plan B 层级纠正（`embedded-postgres` = PGlite 替代，代价：postinstall 二进制 + allowScripts） | §7 风险表 |
| 8 | getDb() / checkDatabaseConnection 适配 | DD-004、§3.3 |
| 9 | 杂项勘误（Json×8、prisma.config.ts 根级、Dockerfile runner COPY、node pin、冒烟拆分、cli-install 依据） | DD-009、§3.6、§6 |
| 10 | Stage A/B 合并策略 | DD-007 |

### 5.2 batch-grill-me 决策落实（DR-002）

| Q | 决策 | 落实位置 |
|---|------|---------|
| Q1 | 6 个 CI job 显式 generate | DD-008 |
| Q2 | spike 脚本 + 手动 workflow 载体 | §4.3 |
| Q3 | no-go 即停呈报决策 | §4.2 / DD-007 |
| Q4 | 性能软目标（优化→记录→确认收口） | §3.6 |
| Q5 | pr.yml 加 `workflow_dispatch:` | DD-007 / DD-008 |
| Q6 | 主树依赖预装 + 零污染回滚 | §4.3 / DD-007 / M1 |

---

## 6. 验收标准（最终）

1. Prisma 7.10.0 升级完成（package.json diff 为证）；`prisma generate` 通过；`tsc --noEmit` 零错误
2. PGlite 后端集成：TestDatabase / createTestPrisma 全部走 PGlite；**测试域 26 构造点按 Stage A `prisma-import-inventory.md` 工件逐点勾销完毕**（v4，M-A1：三分类 a22/b3/c1；工件为 grep 派生 + 分类标注的唯一审计对象）
3. **全部测试**（unit + 6 集成 + 11 e2e，~100 文件）在无 PG 环境全绿（Windows 本机证据 + CI 证据）
4. pr.yml 4 个 job + publish.yml 移除 postgres service 与 db push（逐 job 硬性验收）；**6 个 job 显式 generate 步就位**（DD-008 / Q1-A）
5. 本地 `npx vitest run`（口径补注：`npm test`＝watch 模式，验收以 run 模式计；含 e2e）无 PG 全绿；生产回归：`npm run build` + 无源码树冒烟（拆分为 (a) 无 PG 启动断言可进 CI / (b) `/health db ok` 本机或 compose 验收）+ `npm pack --dry-run` 产物含编译后 client + **docker build 端到端（R1-M4：Dockerfile 恰为改动面——alpine/musl × v7 WASM × `--ignore-scripts`；环境允许则必测；不可执行时按预定义三级替代证据（v4，m-1）：(a) `docker build --target builder` 单阶段执行 + runner 阶段静态审查（Dockerfile diff + **最小核对清单（v5 T-m4；v6 R4-T9 范围澄清）**: 核验第一对象 = **builder 阶段实际产物路径**（`docker build --target builder` 后列出）；`npm pack` 清单仅用于交叉核对发布包形态；devDeps 传递依赖**不参与核验**（runner 仅 COPY builder 产物），重点三组 `prisma.config.ts` / `dist/**` / `node_modules/**`，缺失即整改）；(b) buildah/podman 等价工具端到端；(c) 前两者组合 + 显式残余风险声明经用户门禁确认）**
6. Stage 0 spike 报告含 #0–#12 全部判据结果；非功能基线与回滚策略文档化；内存硬判据通过
7. 文档与架构更新：AGENTS.md（PG 表述/命令/CI job 数）、docs/setup-guide.md、README.md、README.zh-CN.md、DEPLOY.md、**architecture.yaml（DD-011：门面/工厂模块依赖声明——R1-M5）**

---

## 7. 风险与回滚

| 风险 | 等级 | 缓解 | 回滚 |
|------|------|------|------|
| adapter 0.x 与 Prisma 7.10 不兼容 | 高 | spike #0/#1 前置拦截；精确 pin | 全 no-go → 仅 Stage A / Plan B |
| PGlite 并发事务语义偏差 | 中 | spike #6b | 降级 Y |
| tsc 编译生成物报错（**strict 严格项全集**——非仅 EOPT/isolatedModules，R1-min7） | 中 | spike #9 验证零错误 | Stage A 内修复（改 generator 选项/lint 豁免） |
| 内存峰值 OOM | 中 | §3.6 硬判据 | 显式 maxWorkers |
| cli.mjs 全新安装场景断裂 | 中 | M4 验证；CLI pin | 回退 generate 步骤（交付 .ts 生成物并作为 files 内容） |
| Plan B（`embedded-postgres`） | — | Stage 0/B 受阻时启用；代价：postinstall 下载二进制、需恢复 `allowScripts` 键、**与 `--ignore-scripts`（CI / Dockerfile / deploy.sh 三处）冲突需逐处复查（R1-min15）**、非零外部进程 | — |

---

## 8. 实施序列（里程碑 → to-issues 切片输入）

| 里程碑 | 内容 | 门禁 |
|--------|------|------|
| M1 | 依赖预装提交（v7 + pglite，可回滚）+ Stage 0 spike + 报告 | 预算 ≤0.5 天；**首步：预装前完成本机基线采集（v6 R4-F1：`npx vitest run` 变更前实测；CI 基线取 main 历史 run 均值）**；脚本骨架先行、判据分批填充（v5 F-m1）；§4.1 判据 #0-#12 全绿（或按 §4.2 收敛）；no-go 即停呈报（Q3-A） |
| M2 | Stage A：依赖/generator/config/门面/codemod（79 文件）/工厂改造/helper 切换（a22/b3/c1）/非测试域 6 处 | 预算 ≤1.5 天；**中点审计（v4 M-A2；v5 F-m2 口径修订）**: codemod ~50% 时按**双指标**记录——①`prisma-import-inventory.md` 逐点勾销率（%）②`tsc --noEmit` **错误计数下降趋势**（相对基线计数，不要求通过——半程必然整体不过；**基线采集时点（v6 R4-T7）: 依赖升级后、codemod 首文件改写前**）；门禁 = 真 PG 全量测试绿 + CI run URL 记录 |
| M3 | Stage B：TestDatabase/helper 内部实现换 PGlite + globalSetup + e2e 注入 + CI service 移除 | 预算 ≤1 天；门禁 = 无 PG 全量绿（本机 + CI）+ 内存判据 |
| M4 | 生产回归：build + 无源码树冒烟 + npm pack + 安装场景 + docker build（R1-M4） | 预算 ≤0.5 天；验收 #5；**环境前提登记（v5 F-m5）**: `/health db ok` 项依赖本机 WSL2 PG 或 `docker compose up postgres` 二选一（与 docker 三级替代证据口径并列）；**用户门禁依赖登记（v6 R4-F4）**: docker tier (c) 与 Stage B 重基线依赖用户同步门禁——用户不可用时 tier (c) 暂缓、沿用 (a)+(b) 组合 + 残余风险声明，Stage B 重基线顺延（不阻塞 M3 其余收口） |
| M5 | 文档更新 + CHANGELOG | 预算 ≤0.25 天；验收 #7 |
| PR | merge commit 合并（禁 squash） | SHIP 阶段 |

> **升级阈值（v5 F-m3 统一）**: 任一里程碑超时达 `max(2× 预算, 绝对下限 0.5 天)` 即呈报用户——M5（≤0.25 天）等小时间盒的实际阈值为 0.5 天，避免过度敏感；infra 延迟与 technical no-go 的拆分口径见 §4.3。
> **残余排期风险登记（v6 R4-F3）**: M1/M2 时间盒仍处激进端，已由骨架先行 + 呈报阀 + 中点双指标三项约束收敛为**可控残余、不构成阻塞项**（无设计变更）；BUILD 期按中点审计数据动态复核。

---

## 9. 决策完备性自查

- 无待定决策项；§4.2 决策人已指定（用户）；grill 两轮 frontier 已清空（Q1-Q6 全确认）
- 所有 R2 采纳项均有明确落点（§5.1）；所有 grill 决策均有落脚（§5.2）
- 所有文件改造点均定位到具体文件/行号锚点（§3）
- 回滚路径可执行（DD-007 / §7）：M1 依赖预装回滚、Stage A/B 回滚、Plan B 预案三层齐备
- Delphi R1（2 Critical / 7 Major / ~15 Minor）修复已全部落实（映射与回填核验见 `round1-design-digest.md` §二）；Round 2 复审范围 = 映射落实核验 + 修复不引入新问题
- Delphi R2（2 Critical / 5 Major）修复已全部落实（见 §0 v3 记录）；feasibility 预审（v4：3 Major / 5 Minor）已逐项处置（见 §0 v4 记录）；R3 复审（5M/10m）→ v5（15/15 处置）；R4 复审（3/3 APPROVED、均值 0.8933；T 4M/5m + F 4m）→ v6（13/13 处置 + architecture 6 项映射核验）；**Round 5 终审范围 = 三专家全量复审 + v6 落点核验 + 共识率确认（≥0.90）**
