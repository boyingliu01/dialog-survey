# LangGraph 迁移评估

> 日期：2026-07-09
> 背景：评估是否将自定义对话流程引擎替换为 LangGraph.js + LangChain.js

## 背景

项目当前使用自定义命令式状态机引擎管理访谈流程（`PENDING → ACTIVE → PROCESSING → WAITING → COMPLETED`），而非 LangGraph/LangChain。最初自建引擎的可能原因是早期 LangGraph.js 对 TypeScript 支持不成熟。本评估调查该原因是否成立，并分析迁移的可行性。

---

## 1. LangGraph.js TypeScript 支持现状（2026-07）

**结论：完全支持，且已达到生产就绪水平。**

| 指标 | 数据 |
|------|------|
| GA 版本 | 2025 年 10 月达到 1.0 |
| npm 周下载量 | ~529K |
| GitHub Stars | 3,098 |
| 企业用户 | Replit, Uber, LinkedIn, GitLab, Lyft, Klarna, Elastic, JPMorgan |

### 核心能力与 Python 版对齐度

| 能力 | Python LangGraph | LangGraph.js | 备注 |
|------|:-:|:-:|------|
| StateGraph + 条件分支 | ✅ | ✅ | Zod schema 定义状态 |
| Checkpointing / 持久化 | ✅ | ✅ | 内置 PostgresSaver, MemorySaver 等 |
| Human-in-the-loop | ✅ `interrupt()` | ✅ `interrupt()` | 完全一致 |
| 流式输出（5 种模式） | ✅ | ✅ | values/updates/messages/events/custom |
| 子图（Subgraphs） | ✅ | ✅ | |
| 时间旅行 / 回放 | ✅ | ✅ | `getStateHistory()` |
| 模型提供商数量 | ~98 | ~33 | JS 较少，但主流模型都有 |

### LangGraph.js 独有优势

- 跨运行时：Node.js / Deno / Bun / Cloudflare Workers / Vercel Edge / 浏览器
- Zod 运行时校验（Python type hint 不具备）
- 无 GIL 限制，并行 LLM 调用性能更好
- 冷启动更快，适合 Serverless

### 已知限制

- 模型提供商数量少于 Python（~33 vs ~98）
- Zod schema 语法比 Python TypedDict 略冗长
- `createAgent()` 不能直接作为 `StateGraph` 节点（部分 edge case）
- 社区生态规模仍小于 Python

---

## 2. 当前自定义引擎分析

### 架构概览

```
src/core/
├── graph.ts              → runInterviewGraph() 入口，~86 行
├── types/index.ts        → InterviewState Zod schema，~103 行
└── nodes/
    ├── planning.ts       → PENDING→ACTIVE，~39 行
    ├── interviewing.ts   → 响应处理 + LLM 追问，~204 行
    └── template-utils.ts → 模板加载，~15 行
```

### 核心能力

| 能力 | 实现方式 | 复杂度 |
|------|---------|--------|
| 状态持久化 | PostgreSQL + Prisma + 乐观锁（`version` 字段） | 中 |
| 条件分支 | 手写 `routeAction()`：FOLLOWUP / NEXT / END | 低 |
| LLM 集成 | OpenAI 兼容 API + 重试 | 中 |
| 追问深度控制 | `followupCount` + `maxFollowups` 计数器 | 低 |
| 多轮上下文 | 消息存储（6 条窗口） | 中 |
| 异步报告生成 | `setImmediate()` fire-and-forget | 低 |
| 冷却期防重复 | DB 查询已完成访谈（30 分钟默认） | 低 |
| 批量持久化 | `pendingMessages[]` / `pendingResponses[]` 减少 DB 写入 | 中 |

### 设计亮点

1. **两阶段提交**：LLM 调用前存 `PROCESSING`，调用后存 `ACTIVE`，防止消息丢失
2. **乐观锁**：`version` 字段 + 3 次重试，处理并发冲突
3. **优雅降级**：LLM 失败时自动推进到下一问题
4. **批量消息提交**：减少数据库写入次数

### 与 LangGraph 模式对比

| LangGraph 特性 | 本项目实现 | 差距 |
|----------------|-----------|------|
| `StateGraph` 类 | 手动条件执行 | 有 |
| `addNode()` | 显式函数调用 | 等价 |
| `addConditionalEdges()` | 手写 `if/else` 分支 | 等价 |
| 图序列化 | 无（仅内存） | 有 |
| Checkpointing | 手动 version 跟踪 | 有（但功能等价） |
| 内置重试 | 自定义 `withRetry()` | 等价 |
| 内置持久化 | 自定义 Repository | 有（但更贴合业务） |

---

## 3. 迁移评估：收益 vs 成本

### 迁移收益

| 收益 | 当前缺失程度 | 重要程度 |
|------|-------------|---------|
| 内置 Checkpointing | 已有手写替代 | 中 |
| Human-in-the-loop（中断/恢复） | 无 | 低（当前场景不需要） |
| 流式输出多模式 | 仅最终结果推送 | 中（实时打字效果会有用） |
| 时间旅行 / 回放 | 无 | 低（访谈场景不太需要） |
| 图可视化 / 调试 | 无 | 低（图只有 2 个节点） |
| LangSmith 链路追踪 | 无 | 中（对 LLM 调试有帮助） |
| 社区维护 + 迭代 | 自己维护 | 中（但引擎很稳定） |

### 迁移成本

| 成本项 | 详情 | 估算 |
|--------|------|------|
| 核心重写 | `graph.ts` + 2 个 node → StateGraph | 1-2 周 |
| 持久化层改造 | 乐观锁 + Prisma 适配 Checkpointer 接口 | 1 周 |
| 测试重写 | 92 个测试文件依赖当前引擎调用方式 | 1-2 周 |
| 集成层改动 | `stream-message.service.ts`（~433 行）适配 | 3-5 天 |
| 生产风险 | v1.8.0 运行中，属于 breaking change | 高 |
| 学习曲线 | 团队需熟悉 Annotation、reducer、checkpoint | 1-2 周 |
| 过度工程 | 图只有 2 个节点，大量 LangGraph 能力用不上 | 中 |

**总估算：4-8 周，含测试和生产验证。**

---

## 4. 结论与建议

### 当前不建议迁移

理由：

1. **引擎不是技术债。** 500 行清晰代码，有乐观锁、两阶段提交、重试机制——为特定场景量身定制。
2. **图太简单，框架收益低。** LangGraph 价值在复杂图（10+ 节点、动态子图、多 agent 协作）。当前只有 `planning → interviewing` 两个节点。
3. **成本收益不成比例。** 92 个测试 + 生产系统 + 持久化改造，投入 4-8 周，核心收益已有替代方案。
4. **模型提供商限制。** LangGraph.js 仅 ~33 个模型提供商（vs Python ~98），当前 OpenAI 兼容 API 够用，但未来扩展可能受限。

### 什么情况下值得迁移

- 计划大幅增加对话流程复杂度（多 agent、动态子图、分支合并）
- 需要 LangSmith 链路追踪调试 LLM 行为
- 计划做实时流式输出（逐字打字效果）
- 团队扩大，需要标准化框架降低理解成本

### 渐进式迁移路径（如未来需要）

**阶段 1：LLM 层替换（低风险）**
- 用 LangChain.js 的 `ChatOpenAI` 替代自定义 LLM client
- 不动状态机，验证团队对框架的熟悉度
- 获得 LangSmith 追踪能力

**阶段 2：持久化层适配（中风险）**
- 实现自定义 LangGraph Checkpointer 包装现有 Prisma 逻辑
- 保留乐观锁机制

**阶段 3：引擎核心替换（高风险，仅在必要时）**
- 将 `runInterviewGraph()` 重构为 `StateGraph`
- 重写测试
- 灰度发布验证

---

## 参考数据

- LangGraph.js GitHub: https://github.com/langchain-ai/langgraphjs
- npm: `@langchain/langgraph` ~529K weekly downloads
- 企业案例: Lyft (2026-05), Replit, Uber, LinkedIn, GitLab, Klarna, Elastic, JPMorgan
- 当前项目版本: v1.8.0, 50 source TS files, 92 test files, ~930 tests
