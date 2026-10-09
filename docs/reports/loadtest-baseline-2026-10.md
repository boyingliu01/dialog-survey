# 负载/容量基线报告（2026-10，issue #180）

> 状态：**基线已建立（PGlite 相对口径，harness v2）**。绝对 sizing 权威口径 = CI
> `loadtest` job 的真实 PostgreSQL 复测（`.github/workflows/loadtest.yml`，手动/每月
> 触发，结果自动 commit 到 `loadtest-baseline` 分支）与 #183 服务器侧容量复测。
> CI job 可行性在合并前以 workflow_dispatch 冒烟验证（job 能跑通）；首次产出权威
> sizing 数字的完整实跑安排在合并后。本报告数字用于**版本间相对回归**与部署规格
> 的**量级判断**。

## 1. 方法学

### 1.1 工具选型（DR-001）

- **autocannon v8.0.0**（devDependency，纯 JS、进程内）驱动 S1–S5：以库方式在
  被测同进程树内运行，经真实 loopback TCP 打到 `buildApp()` 产出的生产 Fastify 实例。
- 未选用 k6 / artillery：二者需要外部二进制 / worker 进程；本机环境
  node 发起的任何 spawn 均被过滤层以 EBUSY 拦截（2026-10-08 实测，见用户环境记录）。
- **S6（钉钉消息峰值等价）**不做 HTTP：进程内直驱
  `StreamMessageService.processStreamMessage()`，覆盖完整 handler 链
  （解析→去重→用户级锁→会话→DB 写→回复组装），P95 以 handler 耗时计。

### 1.2 被测系统形态

- 生产 `buildApp()` 原样启动（含安全中间件、session、CSRF、metrics 钩子），
  仅两处差异：`NODE_ENV=test`（跳过 fastify-rate-limit 100/min，否则压平所有场景）
  与 DB 替换为 PGlite（经 `prismaFactory` 既有注入点，**生产代码零渗透**）。
- **凭据零配置**：harness 在 import 前后两次删除全部 LLM/钉钉凭据环境变量
  （`DINGTALK_*`、`DASHSCOPE_*`、`LLM_*`、`VOLCENGINE_*`、`ANTHROPIC_AUTH_TOKEN`），
  防止 dotenv 从 `.env` 回填导致真实 LLM 外呼污染基线。LLM 走即时 fallback
  （构造期抛错，**零网络 I/O**），生成时延**未计入**。
- S6 外发 reply 经 SSRF allowlist 打桩（`stub.invalid` 主机名直接拒绝，零 socket）。

### 1.3 场景与执行参数

| 场景 | 端点/入口 | 鉴权 | 说明 |
|---|---|---|---|
| S1 | `GET /health` | 无 | 全链路探针（DB SELECT 1） |
| S2 | `GET /metrics` | Bearer | 可观测性端点开销 |
| S3 | `GET /api/templates` | x-api-key | 模板列表读路径（该端点无分页参数；分页列表见 `/api/plans?limit&offset`，未单列） |
| S4 | `GET /api/plans/:id` | x-api-key | 消息驱动核心读路径（种子计划含 20 个 COMPLETED 访谈 × 6 消息） |
| S5 | `POST /api/plans` | x-api-key(admin) | 核心写路径（每请求真实建计划） |
| S6 | 消息 handler 直驱 | — | 钉钉消息峰值应用层等价；唯一 messageId，用户级锁生效 |

- 并发阶梯 **10 / 50 / 100 / 200** × 30s；**每档前先跑 5s 预热档，结果弃置
  （S1–S6 全部场景，含 S6）**。
- 采集：RPS、P50/P95/P99、错误率、non-2xx。**分位数口径**：S1–S5 的 P95 由
  autocannon v8 直方图相邻档（p90、p97_5）线性插值（v8 无 p95 档位）；S6 的
  P50/P95/P99 为原始 handler 样本的 nearest-rank 分位。两种口径在结果表中并存，
  对比时注意口径差异。

### 1.4 环境口径

| 项 | 值 |
|---|---|
| 机器 | ThinkPad X1C Gen9（i7-1165G7，4C/8T，32GB RAM），Windows |
| Node | v22（本地）；CI 口径 Node 20.19 |
| DB | PGlite（进程内 WASM PG，无连接池、无真实网络、无磁盘 fsync 开销） |
| 客户端/服务端 | **同进程**（共享 event loop/CPU —— 方法学局限，见 §4） |
| 运行日期 | 2026-10-09 |

## 2. 结果（PGlite 口径，全量 30s × 4 档）

原始 JSON：`docs/reports/loadtest-results-2026-10-09T03-56-12.953Z.json`

| 场景 | 档 | RPS | P50 ms | P95 ms | P99 ms | 错误 | non-2xx |
|---|---|---|---|---|---|---|---|
| S1 health | 10 | 1065 | 8 | 16 | 21 | 0 | 0 |
| S1 health | 50 | 1268 | 38 | 53 | 66 | 0 | 0 |
| S1 health | 100 | 1313 | 74 | 103 | 123 | 0 | 0 |
| S1 health | 200 | 1221 | 160 | 232 | 294 | 0 | 0 |
| S2 metrics | 10 | 3243 | 2 | 5 | 6 | 0 | 0 |
| S2 metrics | 50 | 3530 | 13 | 20 | 23 | 0 | 0 |
| S2 metrics | 100 | 4297 | 22 | 29 | 35 | 0 | 0 |
| S2 metrics | 200 | 3468 | 54 | 81 | 97 | 0 | 0 |
| S3 templates | 10 | 457 | 21 | 30 | 35 | 0 | 0 |
| S3 templates | 50 | 418 | 106 | 216 | 257 | 0 | 0 |
| S3 templates | 100 | 448 | 197 | 447 | 720 | 0 | 0 |
| S3 templates | 200 | 458 | 434 | 719 | 903 | 0 | 0 |
| S4 plan detail | 10 | 219 | 44 | 64 | 74 | 0 | 0 |
| S4 plan detail | 50 | 247 | 209 | 251 | 273 | 0 | 0 |
| S4 plan detail | 100 | 277 | 410 | 464 | 496 | 0 | 0 |
| S4 plan detail | 200 | 270 | 790 | 881 | 1653 | 0 | 0 |
| S5 plan create | 10 | 293 | 33 | 47 | 58 | 0 | 0 |
| S5 plan create | 50 | 374 | 131 | 167 | 187 | 0 | 0 |
| S5 plan create | 100 | 328 | 322 | 465 | 495 | 0 | 0 |
| S5 plan create | 200 | 254 | 853 | 1643 | 1897 | 0 | 0 |
| S6 handler | 10 | 44 | 212 | 358 | 511 | 0 | 0（ok=100%） |
| S6 handler | 50 | 43 | 951 | 1807 | 2335 | 0 | 0（ok=100%） |
| S6 handler | 100 | 47 | 2002 | 2853 | 2898 | 0 | 0（ok=100%） |
| S6 handler | 200 | 53 | 3817 | 4997 | 5066 | 0 | 0（ok=100%） |

### 2.1 关键观察

1. **业务 API 吞吐天花板 ≈ 250–400 rps/实例**（S4/S5 在 50 并发后 RPS 走平、P50 随
   并发线性上涨）——单进程 event loop 饱和特征，横向扩容（多实例）才能突破。
2. **S6 全链路 handler（进行中会话的消息处理）≈ 30–50 handler-calls/s/进程**，
   P50 随并发上涨（10 并发 0.2s → 200 并发 3.8s）——用户级锁 + event loop 排队 +
   两阶段状态持久化（每条消息 2 次全量状态写）的叠加。**ok=100%、无失败**，
   属"削峰必须限流"信号而非容量崩塌。注：harness v2 下每条消息都走完整链路
   （见 §4.5），与 v1 报告（曾给出 ~400/s，事后证实 90% 消息命中"冷却拦截"早退
   路径）不可直接对比；v2 数字才是消息处理峰值的真实口径（v1 失实原因见 §4.8）。
3. S2（无 DB）≈ 3.5–4.3k rps，说明框架/序列化/日志开销本身不是瓶颈；瓶颈在
   PG 单连接串行执行的业务查询。
4. 全场景 **0 错误、0 non-2xx**，乐观锁/事务路径在并发写压下无异常。

## 3. 从本地结果到真实部署的外推（方法与误差界）

| 修正项 | 方向 | 处理 |
|---|---|---|
| 网络往返（真实 TCP 而非进程内） | 时延 ↑ | 每请求 +1×RTT（内网 ≤1ms，公网按实测）；时延 P50 至少 +2×RTT |
| 连接池（PrismaPg 真实池 vs PGlite 单连接） | 吞吐 ↑（可并行查询）、P95 ↑（池等待） | 由 CI loadtest job 实测校准（DR-002），本表暂按不折减 |
| 磁盘持久化（WAL/fsync） | 时延 ↑ 吞吐 ↓ | 写路径（S5/S6）按 **0.6–0.8×** 吞吐折减 |
| 生产日志落盘 | 吞吐 ↓ | 按 0.9× |
| 同进程争抢消除（CI runner 客户端/服务端分离） | 吞吐 ↑ 时延 ↓ | CI 数据为第二口径，预期高于本地 |
| 单进程上限 | 硬顶 | 任何折减都无法突破 250–400 rps/实例量级；需要更高时多实例 + 负载均衡 |

**保守外推（供容量规划；均为待 CI/#183 校准的本地估算，非权威数字）**：

- 单实例 API 读吞吐：**≥ 180 rps**（本地 270 × 0.65 综合折减）
- 单实例业务写吞吐：**≥ 180 rps**（S5 本地 300 × 0.6）
- 钉钉消息全链路（应用层，LLM 时延未计）：**≥ 25 handler-calls/s/进程**
  （本地 44 × 0.6）；并发上限 **≤ 50 用户/实例为保守本地下限估计**
  （200 并发时 P50 已达 3.8s）；真实并发上限由 LLM 供应商配额与时延决定，
  且预期高于本地同进程口径——**CI/#183 复测后重新标定**
- 健康检查/指标端点：不是容量因素（>1k rps）

### 推荐部署规格（初版，随 CI/服务器复测更新）

| 项 | 建议 |
|---|---|
| 实例内存 | 500MB（PM2 `max_memory_restart` 维持现值） |
| DB 连接 | 单实例 ≤10（Prisma 池默认），多实例时用 pgBouncer 收敛 |
| 并发上限 | 消息入口并发告警阈值 50（保守本地下限，待复测重标定）；API 网关层限流兜底 |
| 扩容触发 | P95 > 1s（读）持续 5min，或消息 handler P95 > 500ms |

## 4. 已知局限（不阻塞 1.11.0 内部发布，全部留档）

1. **PGlite 数字仅为相对回归口径**：进程内 WASM PG，无池/无网络/无 fsync，
   绝对 sizing 以 CI 真实 PG job 与 #183 服务器复测为准（DR-002）。
2. **LLM 未计入**：S6 走零网络 I/O 的即时 fallback；真实部署中 LLM 往返
   （数百 ms 至数秒）将主导消息处理时延——消息吞吐上限由 LLM 供应商配额
   决定，本基线度量的是**应用层余量**。
3. **同进程争抢**：客户端与服务端共享 event loop/CPU，本地数字偏低估；
   CI 分离口径预期更高。
4. **S6 回复打桩**：外发钉钉 reply 被 SSRF allowlist 拒绝（零 socket），
   真实外发的网络/重试开销未计入。
5. **S6 非稳态与完成语义**：(a) 每档固定 tier 个用户，30s 内同一访谈的消息
   列表线性增长，单次调用工作量随时间上升（尾部延迟的部分混杂因素）；
   (b) 无凭据 fallback 永不产生 LLM 的 END 动作，访谈不会完成（进入报告
   生成/冷却路径）——S6 度量的是**进行中会话的消息处理峰值**，这正是峰值
   场景的主形态，但"完成 + 报告生成"路径未被 S6 覆盖。
6. **错误映射技术债**：plans.ts 中 import-commit 的新 catch 链与既有
   `mapServiceErrorToStatus`（502 兜底、英文/中文文案）语义重叠并存，
   为行为保持型迁移的临时状态；建议后续统一为单一映射函数（follow-up）。
7. 服务器侧容量复测（#183）与首次恢复演练（#179 人工门禁）为部署前待办。
8. **v1 基线 S6 数字失实（口径修正留档）**：v1 报告曾给出 S6 ~400
   handler-calls/s，事后经日志路径分布核验，其中 90% 消息（45698/46498）
   命中"冷却拦截"早退路径，并未测量消息处理；且 v1 harness 存在凭据泄漏
   （`ANTHROPIC_AUTH_TOKEN` 未在删除清单）导致真实 LLM 外呼 401。v2 harness
   修复上述两点后重跑，本报告 §2 为 v2 口径。v1 结果 JSON 已从仓库移除。

## 5. 复测方式

```bash
npm run loadtest            # 全量（约 16 分钟）
npm run loadtest -- --quick # 冒烟（约 3 分钟，2 档并发）
LOADTEST_USE_REAL_PG=1 npm run loadtest   # 真实 PostgreSQL 口径（CI 同款）
```

### CI 复测取数与回填 runbook

1. **触发**：GitHub → Actions → "Loadtest Baseline (real PostgreSQL)" →
   Run workflow（或等每月 1 日 03:00 UTC 的定时触发）。
2. **取数**：run 结束后，结果 JSON 会**自动 commit 到 `loadtest-baseline`
   分支**（bot 提交；专用分支不受默认分支保护策略约束）；artifact 另存
   90 天作为备份。
3. **回填**：对比最近两次 JSON 的同场景同档数字；回归判定标准——
   RPS 下降 >25% 或 P95 上涨 >50%（同档、同口径）视为异常，需在
   `docs/reports/` 新增一份增量说明并更新本报告 §2/§3 与 DEPLOY.md 容量节。
4. **口径切换**：CI 用 `LOADTEST_USE_REAL_PG=1`（真实连接池），其数字
   **优先于** 本地 PGlite 数字作为 sizing 依据。
5. **服务器侧复测**（#183）：在真实部署机上以 `LOADTEST_USE_REAL_PG=1`
   运行并归档，与 #179 首次恢复演练同时点执行（owner：用户 + agent）。
