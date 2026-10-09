# 负载/容量基线报告（2026-10，issue #180）

> 状态：**基线已建立（PGlite 相对口径）**。绝对 sizing 权威口径 = CI `loadtest` job
> 的真实 PostgreSQL 复测（`.github/workflows/loadtest.yml`，手动/每月触发）与 #183
> 服务器侧容量复测。本报告的数字用于**版本间相对回归**与部署规格的**量级判断**。

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
- 凭据无配置启动：钉钉 stream 客户端不启动；LLM 走无凭据 fallback
  （实测 401 fast-fail ≈3ms，LLM 生成时延**未计入**）。
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

- 并发阶梯 **10 / 50 / 100 / 200** × 30s；每档前先跑 5s 预热档，**结果弃置**。
- 采集：RPS、P50/P95/P99、错误率、non-2xx。autocannon v8 直方图无 p95 档位，
  P95 由相邻档（p90、p97_5）线性插值得出。

### 1.4 环境口径

| 项 | 值 |
|---|---|
| 机器 | ThinkPad X1C Gen9（i7-1165G7，4C/8T，32GB RAM），Windows |
| Node | v22（本地）；CI 口径 Node 20.19 |
| DB | PGlite（进程内 WASM PG，无连接池、无真实网络、无磁盘 fsync 开销） |
| 客户端/服务端 | **同进程**（共享 event loop/CPU —— 方法学局限，见 §4） |
| 运行日期 | 2026-10-09 |

## 2. 结果（PGlite 口径，全量 30s × 4 档）

原始 JSON：`docs/reports/loadtest-results-2026-10-09T00-51-37.195Z.json`

| 场景 | 档 | RPS | P50 ms | P95 ms | P99 ms | 错误 | non-2xx |
|---|---|---|---|---|---|---|---|
| S1 health | 10 | 980 | 9 | 16 | 19 | 0 | 0 |
| S1 health | 50 | 1078 | 44 | 67 | 80 | 0 | 0 |
| S1 health | 100 | 1255 | 78 | 117 | 143 | 0 | 0 |
| S1 health | 200 | 1440 | 135 | 185 | 211 | 0 | 0 |
| S2 metrics | 10 | 4057 | 2 | 4 | 5 | 0 | 0 |
| S2 metrics | 50 | 3859 | 11 | 21 | 25 | 0 | 0 |
| S2 metrics | 100 | 3686 | 26 | 36 | 42 | 0 | 0 |
| S2 metrics | 200 | 4054 | 47 | 64 | 74 | 0 | 0 |
| S3 templates | 10 | 711 | 13 | 17 | 20 | 0 | 0 |
| S3 templates | 50 | 691 | 70 | 105 | 136 | 0 | 0 |
| S3 templates | 100 | 644 | 158 | 206 | 237 | 0 | 0 |
| S3 templates | 200 | 520 | 383 | 628 | 761 | 0 | 0 |
| S4 plan detail | 10 | 328 | 30 | 36 | 46 | 0 | 0 |
| S4 plan detail | 50 | 361 | 141 | 160 | 170 | 0 | 0 |
| S4 plan detail | 100 | 371 | 283 | 372 | 413 | 0 | 0 |
| S4 plan detail | 200 | 388 | 539 | 633 | 961 | 0 | 0 |
| S5 plan create | 10 | 452 | 22 | 25 | 30 | 0 | 0 |
| S5 plan create | 50 | 457 | 109 | 132 | 157 | 0 | 0 |
| S5 plan create | 100 | 435 | 225 | 319 | 341 | 0 | 0 |
| S5 plan create | 200 | 400 | 542 | 626 | 686 | 0 | 0 |
| S6 handler | 10 | 407 | 23 | 28 | 34 | 0 | 0（ok=100%） |
| S6 handler | 50 | 395 | 102 | 141 | 1248 | 0 | 0（ok=100%） |
| S6 handler | 100 | 419 | 42 | 193 | 6592 | 0 | 0（ok=100%） |
| S6 handler | 200 | 329 | 28 | 3471 | 14300 | 0 | 0（ok=100%） |

### 2.1 关键观察

1. **业务 API 吞吐天花板 ≈ 400 rps/实例**（S4/S5 在 50 并发后 RPS 走平、P50 随
   并发线性上涨）——单进程 event loop 饱和特征，横向扩容（多实例）才能突破。
2. **S6 全链路 handler ≈ 400 handler-calls/s**，100 并发内 P95 保持 <200ms；
   200 并发时尾延迟爆涨（P95 3.5s、P99 14.3s）——用户级锁串行化 + event loop
   排队的叠加，属**削峰必须限流**的明确信号，而非容量崩塌（ok=100%，无失败）。
3. S2（无 DB）≈ 4k rps，说明框架/序列化/日志开销本身不是瓶颈；瓶颈在
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
| 单进程上限 | 硬顶 | 任何折减都无法突破 400 rps/实例量级；需要更高时多实例 + 负载均衡 |

**保守外推（供容量规划，待 #183 服务器侧校准）**：

- 单实例 API 读吞吐：**≥ 250 rps**（本地 380 × 0.65 综合折减）
- 单实例业务写吞吐：**≥ 250 rps**（S5 本地 450 × 0.6）
- 钉钉消息全链路：**≤ 100 并发用户安全**；突发 >100 必须限流/排队
  （100 并发时 P95≈0.2s 可接受，200 并发 P95≈3.5s 不可接受）
- 健康检查/指标端点：不是容量因素（>1k rps）

### 推荐部署规格（初版，随 CI/服务器复测更新）

| 项 | 建议 |
|---|---|
| 实例内存 | 500MB（PM2 `max_memory_restart` 维持现值） |
| DB 连接 | 单实例 ≤10（Prisma 池默认），多实例时用 pgBouncer 收敛 |
| 并发上限 | 消息入口并发告警阈值 100；API 网关层限流兜底 |
| 扩容触发 | P95 > 1s（读）持续 5min，或消息 handler P95 > 500ms |

## 4. 已知局限（不阻塞 1.11.0 内部发布，全部留档）

1. **PGlite 数字仅为相对回归口径**：进程内 WASM PG，无池/无网络/无 fsync，
   绝对 sizing 以 CI 真实 PG job 与 #183 服务器复测为准（DR-002）。
2. **LLM 未计入**：S6 走 401 fast-fail fallback（≈3ms/条）；真实部署中
   LLM 往返（数百 ms 至数秒）将主导消息处理时延——消息吞吐上限由 LLM
   供应商配额决定，本基线度量的是**应用层余量**。
3. **同进程争抢**：客户端与服务端共享 event loop/CPU，本地数字偏低估；
   CI 分离口径预期更高。
4. **S6 回复打桩**：外发钉钉 reply 被 SSRF allowlist 拒绝（零 socket），
   真实外发的网络/重试开销未计入。
5. 服务器侧容量复测（#183）与首次恢复演练（#179 人工门禁）为部署前待办。

## 5. 复测方式

```bash
npm run loadtest            # 全量（约 22 分钟）
npm run loadtest -- --quick # 冒烟（约 3 分钟，2 档并发）
LOADTEST_USE_REAL_PG=1 npm run loadtest   # 真实 PostgreSQL 口径（CI 同款）
```
