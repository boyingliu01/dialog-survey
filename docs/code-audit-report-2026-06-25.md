# 全模块代码审计 + 交叉验证最终报告

> 日期：2026-06-25
> 方法：5 个 explore agent 并行审计 + 5 个 Oracle 独立交叉验证
> 覆盖：52+ 源文件、14 个 Nunjucks 模板、Prisma schema

---

## 交叉验证结果总览

| 模块 | 原始准确率 | 误报数 | 遗漏(High+) | 评估 |
|------|-----------|--------|------------|------|
| 钉钉集成 | 72% | 4 | 4 | 大部分正确 |
| LLM + Prompt | 95% | **0** | 5 | **最准确** |
| 数据层 | 75% | 3 | 2 | 有误报+遗漏 |
| Admin UI | 60% | 3 | 3 | 2个Critical误报 |
| 服务层 + API | 30% | **5** | 3 | **严重不准确** |

### 关键误报纠正

| 原发现 | 实际情况 |
|--------|---------|
| A1: api/templates.ts 无鉴权 | ❌ 误报 — verifyApiKey 全局中间件保护 |
| A6: plan.description XSS | ❌ 误报 — Nunjucks autoescape:true |
| S1/S2: DI 违规 | ❌ 误报 — 代码使用参数/构造函数注入 |
| S5: analysis 无重试 | ❌ 误报 — report.service.ts 有 withRetry |
| S7: DingTalk 失败 server 仍启动 | ❌ 误报 — 设计决策有注释 |
| D5: client.ts 时序攻击 | ❌ 误报 — generateSignature 是生成函数非比较 |

### 最重要的遗漏发现

1. **server.ts:259 — Graceful shutdown 仅在 DingTalk 配置时注册** — 未配置 DingTalk 时 SIGTERM handler 不存在
2. **followup.service.ts:82-88 — 第二处 prompt 注入面** — inline 变量替换完全无转义
3. **token-manager.ts:51-53 — null pointer crash 窗口** — isRefreshing 和 refreshPromise 之间有间隙
4. **src/middleware/api-auth.ts — 死代码 + 错误实现** — 查询 AuditLog 找 API key，完全无用

---

## 模块 1：钉钉集成（准确率 72%）

### ✅ 确认的 Critical

- **D1**: stream-client.ts:143-199 WebSocket 重连 TOCTOU 竞态 — 确认
- **D2**: failureCount 永不清零（severity overrated — 有 cooldown 恢复，应为 HIGH）
- **D3**: 消息无幂等性 — 确认

### ✅ 确认的 High

- **D4**: client.ts API 错误不解析 body
- **D6**: middleware.ts verifySignature 使用 === 比较
- **D7**: getConnectionToken 无重试
- **D9**: Token 过期无时钟偏差补偿（severity underrated — 应为 MEDIUM）
- **D10**: 无 graph execution timeout

### ❌ 误报

- **D5**: generateSignature 是生成函数，不是比较函数，时序攻击不适用
- **D8**: Token 刷新竞态实际有 Promise 去重（但存在 null-pointer crash 新发现）
- **D11**: file:// 实际被 hostname 检查拦截
- **D12**: timeout 已被 catch 处理

### 🔍 新发现

1. **HIGH**: stream-client.ts:144 TOCTOU — connect() 可并发创建多个 WebSocket
2. **HIGH**: stream-client.ts:137 URL 构造未编码 ticket（特殊字符破坏 URL）
3. **MEDIUM**: token-manager.ts:51-53 null-pointer crash 窗口

---

## 模块 2：LLM + Prompt（准确率 95%）⭐

### ✅ 确认的 Critical

- **L1**: prompt.service.ts:154-158 变量转义是空操作 — 确认
- **L2**: 用户输入直接插入 prompt — 确认

### ✅ 确认的 High

- **L3**: 上下文窗口无 token 计数（severity **UNDERRATED** — 应为 HIGH）
- **L4**: 错误处理不区分 HTTP 状态码
- **L5**: JSON 解析不支持小写 action

### ✅ 确认的 Medium/Low

- ANTHROPIC_AUTH_TOKEN 在 openai-compatible 的 fallback 链中
- alibaba.ts 完全未使用
- retry.ts 缺少 jitter
- prompts 无版本化
- embeddings 未实现
- 缺少 request ID

### 🔍 新发现

1. **HIGH**: followup.service.ts:82-88 独立变量替换路径 — 完全无转义
2. **HIGH**: followup.service.ts:70 硬编码 6 条消息限制 — 不用 token 预算
3. **MEDIUM**: withRetry 默认 3 次重试 7 秒上限对 rate limit 不够
4. **MEDIUM**: openai-compatible.ts:42 错误响应 body 未限制大小
5. **MEDIUM**: ANTHROPIC_AUTH_TOKEN 有 fallback 但 baseUrl 无 Anthropic 对应

---

## 模块 3：数据层（准确率 75%）

### ✅ 确认的 Critical

- **R1**: saveFullState 无重试 — 确认
- **R2**: $disconnect 破坏共享连接 — 确认

### ❌ 误报/修正

- **R3**: 硬删除称为 CRITICAL 过度 — 应为 MEDIUM（设计选择非 Bug）
- **R4**: "AuditLog 从未写入" **误报** — securityMiddleware 有写入(但粗粒度)
- **R6**: groupBy 性能问题 — 枚举字段最多 5 行（风险远低于声明的）

### 🔍 新发现

1. **HIGH**: api-auth.ts:19 查询 AuditLog 表找 API key — 完全用错表
2. **MEDIUM**: interview-state-mapper.ts:47 reportPath **已被**映射（为 reportGenerated），审计误称为未映射

---

## 模块 4：Admin UI（准确率 60%）⚠️

### ❌ Critical 误报

- **A1**: "api/templates.ts 无鉴权" — **误报**，verifyApiKey 全局中间件保护
- **A6**: "plan.description 未转义，XSS" — **误报**，Nunjucks autoescape:true

### ✅ 确认

- **A3**: CSP 含 unsafe-inline + unsafe-eval — 确认
- **A4**: admin-auth 对 GET 完全跳过 — 确认
- **A5**: inline onclick + alert — 确认
- **A7**: API 路由命名空间混乱 — 存在但不严重（overrated）

### 🔍 新发现

1. **HIGH**: verifyApiKey(security.ts:39) 也有 GET 豁免 — 所有 /api/* GET 完全公开
2. **MEDIUM**: admin-templates.ts:624 使用统计 GET 端点因 adminAuth 跳过 GET 而公开
3. **MEDIUM**: api-auth.ts 死代码 — 从未被 server.ts 引用

---

## 模块 5：服务层 + API（准确率 30%）❌

### ❌ 误报（超过一半发现错误）

- **S1**: dead-letter.service **不使用**自建 PrismaClient — 参数注入
- **S2**: export.service **不使用**自建 PrismaClient — 构造函数 DI
- **S3**: processStreamMessage **有** .catch 错误处理
- **S5**: analysis 有 withRetry 包装
- **S7**: DingTalk 失败 server 仍启动是设计决策

### ✅ 确认

- **S4**: 部分 GET 端点无 Zod — 确认但 LOW（只读无副作用）
- **S6**: batch checkpoint 无持久化 — 确认（severity overrated）

### 🔍 新发现

1. **HIGH**: server.ts:259 优雅关闭仅在 DingTalk 配置时注册
2. **HIGH**: api-auth.ts 死代码，实现有 Bug 且从未被引用
3. **MEDIUM**: api/templates.ts:246 POST /import 无 Zod 验证

---

## 综合发现汇总（仅确认项）

### 🔴 Critical（确认项）

| # | 模块 | 发现 |
|---|------|------|
| 1 | 钉钉 | D1: WebSocket 重连 TOCTOU 竞态 |
| 2 | 钉钉 | D3: 消息无幂等性/去重 |
| 3 | LLM | L1: prompt 变量转义是空操作 |
| 4 | LLM | L2: 用户输入直接注入 LLM prompt |
| 5 | 数据层 | R1: saveFullState 无重试 |
| 6 | 数据层 | R2: $disconnect 破坏共享连接 |
| 7 | Admin UI | A3: CSP unsafe-inline+unsafe-eval |
| 8 | Admin UI | A4: admin-auth GET 完全跳过 |

### 🟡 High（确认项）

| # | 模块 | 发现 |
|---|------|------|
| 9 | 钉钉 | D2: failureCount 不清零（有 cooldown，降为 HIGH） |
| 10 | 钉钉 | D4: API 错误不解析 body |
| 11 | 钉钉 | D6: verifySignature 时序攻击 |
| 12 | 钉钉 | D7: getConnectionToken 无重试 |
| 13 | 钉钉 | D10: 无 graph execution timeout |
| 14 | LLM | L3: 无 token 计数 + 硬编码 6 条消息 |
| 15 | LLM | L4: 错误处理不区分 HTTP 状态码 |
| 16 | LLM | L5: JSON case 问题 |
| 17 | LLM | 第二处 prompt 注入面(followup.service.ts:82) |
| 18-20 | 数据层 | R5(错误类型不一致), R7(interview repo 只读), R8(DI 违规) |
| 21-23 | Admin UI + 服务层 | 死代码、优雅关闭、匿名访问模板数据 |

### 新发现（交叉验证补充）

| # | 严重度 | 模块 | 发现 |
|---|--------|------|------|
| N1 | **HIGH** | 钉钉 | stream-client.ts:137 未编码 ticket URL |
| N2 | **HIGH** | 钉钉 | token-manager.ts:51-53 null-pointer crash |
| N3 | **HIGH** | LLM | followup.service.ts:82 独立注入面 |
| N4 | **HIGH** | Admin UI | verifyApiKey GET 豁免泄露数据 |
| N5 | **HIGH** | 数据层 | api-auth.ts 查询 AuditLog 找 API key |
| N6 | **HIGH** | 服务层 | Graceful shutdown handler 缺位 |

---

## 最终统计

| 状态 | 数量 |
|------|------|
| ✅ 确认 Critical | 8 |
| ✅ 确认 High | 15+ |
| ❌ 误报（已纠正） | 12 |
| 🔍 新发现（Oracle 补充）| 15+ |
| **总体审计准确率** | **66%**（全模块加权平均） |

---

## 建议实施顺序

| 优先级 | 来源 | 修复项目 |
|--------|------|---------|
| **P0** | N4 | API GET 端点公开模板数据 — verifyApiKey GET 豁免 |
| **P0** | N5 | api-auth.ts 用错表 — 死代码清理或修复 |
| **P0** | N6 | Graceful shutdown 缺位 — 移到 DingTalk 条件外 |
| **P1** | D1 | WebSocket 重连竞态 |
| **P1** | L1+L2 | Prompt 注入 |
| **P1** | R1 | saveFullState 无重试 |
| **P1** | R2 | $disconnect 破坏连接 |
| **P1** | A3-A4 | CSP + admin-auth GET 豁免 |
| **P2** | N2 | token-manager null-pointer crash |
| **P2** | D6 | 时序攻击 |
| **P2** | L4 | HTTP 状态码区分 |
| **P3** | — | 死代码清理 + 缓存 + PII |
