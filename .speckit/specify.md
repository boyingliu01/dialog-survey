# 功能规格 (Specification)

> 本文档描述访谈机器人的功能需求和技术方案，遵循 SDD (Specification-Driven Development) 方法论。

---

## 1. 项目概述

### 1.1 背景

参考 Anthropic Interviewer 的实践，构建一个 AI 驱动的访谈机器人，能够：

- 在短时间内对上千人进行深度访谈
- 自动生成访谈报告
- 支持自定义访谈主题和框架

### 1.2 目标用户

| 用户类型 | 场景              | 主要需求             |
| -------- | ----------------- | -------------------- |
| 内部员工 | 质量满意度调查    | 快速收集员工反馈     |
| 外部客户 | 产品/服务质量评价 | 了解客户真实体验     |
| 管理层   | 决策支持          | 获取可执行的数据洞察 |

### 1.3 核心价值

1. **效率提升**: AI 可 7×24 小时工作，日均可完成 8000-10000 次访谈
2. **深度洞察**: 自适应追问，获取更深层次的信息
3. **数据驱动**: 自动生成结构化报告，支持决策

---

## 2. 功能需求

### FR-001: 多轮对话上下文记忆

**优先级**: P0 (核心功能)

**描述**: 访谈机器人应记住之前的对话内容，实现连贯的多轮对话。

**用户故事**: 作为一个被访谈者，我希望机器人能记住我之前的回答，这样对话会更自然，而不是重复问同样的问题。

**验收标准**:

- [x] AC-001: 用户回答后，机器人基于上下文生成下一个问题
  - 测试用例: `tests/core/test_graph.ts::TestEndToEndConversation::test_multi_turn_conversation_no_repetition`
- [x] AC-002: 开场问题在对话中只出现一次
  - 测试用例: `tests/core/test_graph.ts::TestEndToEndConversation::test_planning_node_respects_existing_history`
- [x] AC-003: 对话历史持久化到数据库
  - 测试用例: `tests/services/test_message_service.ts::TestHandleChatMessage`

**技术方案**:

- LangGraph.js 状态机管理对话流程
- Prisma 5.x ORM 存储会话状态
- `conversation_history` 参数传递历史记录

**风险**: 低 - 已实现并测试

---

### FR-002: 智能追问机制

**优先级**: P0 (核心功能)

**描述**: 根据用户回答的内容和质量，智能决定是否追问。

**用户故事**: 作为一个访谈系统，当用户回答模糊或值得深入时，我希望能自动追问以获取更多信息。

**验收标准**:

- [x] AC-001: 当回答模糊时触发追问
  - 测试用例: `tests/services/test_llm.ts::TestLLMServiceMethods::test_is_followup_needed_with_mocked_client`
- [x] AC-002: 追问内容与上下文相关
  - 测试用例: `tests/services/test_llm.ts::TestLLMServiceMethods::test_generate_followup_with_mocked_client`
- [x] AC-003: 追问次数有限制（最多 2 次每话题）
  - 测试用例: `tests/core/test_followup_limit.ts::test_followup_limited_to_2_per_topic`

**技术方案**:

- LLM 判断是否需要追问 (`is_followup_needed`)
- 生成追问问题 (`generate_followup`)
- 状态机控制追问流程

**风险**: 中 - 需要验证追问质量

---

### FR-003: 访谈报告生成

**优先级**: P0 (核心功能)

**描述**: 访谈结束后自动生成结构化的 Markdown 报告。

**用户故事**: 作为管理者，我希望访谈结束后能立即看到结构化的报告，包含关键发现和行动建议。

**验收标准**:

- [x] AC-001: 报告以 Markdown 格式输出
  - 测试用例: `tests/services/test_llm.ts::TestLLMServiceMethods::test_generate_report_with_mocked_client`
- [x] AC-002: 报告包含关键发现、情绪分析、行动建议
  - 测试用例: `tests/services/test_report.ts::test_report_contains_key_findings`
- [x] AC-003: 报告保存到文件系统，路径存储到数据库
  - 测试用例: `tests/services/test_report_service.ts::test_report_path_stored_in_db`

**技术方案**:

- LLM 生成结构化报告
- 保存到 `reports/{session_id}/` 目录
- 数据库记录 `report_path`

**风险**: 中 - 报告质量依赖 LLM 能力

---

### FR-004: 钉钉集成

**优先级**: P0 (核心功能)

**描述**: 通过钉钉与被访谈者交互，支持文本和语音消息。支持两种消息接收模式：HTTP Webhook 和 Stream 模式（WebSocket 长连接）。

**用户故事**: 作为被访谈者，我希望在熟悉的钉钉环境中完成访谈，支持语音回答加快速度。

#### FR-004-Webhook: HTTP Webhook 模式

**验收标准**:

- [x] AC-001: Webhook 验证签名
  - 测试用例: `tests/api/test_webhook.ts`
- [x] AC-002: 处理文本消息
  - 测试用例: `tests/services/test_message_service.ts`
- [x] AC-003: 处理语音消息（ASR 转文字）
  - 测试用例: `tests/services/test_asr.ts`
- [x] AC-004: 机器人主动发送消息
  - 测试用例: `tests/services/test_dingtalk_sender.ts::test_send_text_message`

#### FR-004-Stream: Stream 模式（WebSocket 长连接）

**描述**: 通过钉钉 Stream 模式接收消息，无需配置公网 IP 和 Webhook URL，适合内网部署场景。

**验收标准**:

- [x] AC-005: WebSocket 连接建立
  - 实现: `DingTalkStreamClient.connect()`
  - 功能: 获取 endpoint 和 ticket，建立 WebSocket 连接
  - 测试用例: `tests/dingtalk-stream.test.ts::getConnectionToken returns endpoint and ticket`

- [x] AC-006: WebSocket URL 构造
  - 实现: `buildWebSocketUrl(endpoint, ticket)`
  - 功能: 正确拼接 WebSocket URL
  - 测试用例: `tests/dingtalk-stream.test.ts::buildWebSocketUrl constructs correct URL`

- [x] AC-007: 消息解析
  - 实现: `parseMessage(rawMessage)`
  - 功能: 解析 specVersion、headers（messageId、topic）、data
  - 测试用例: `tests/dingtalk-stream.test.ts::parseMessage extracts headers and data`

- [x] AC-008: ACK 响应
  - 实现: `buildAck(messageId)`
  - 功能: 返回正确的 ACK 响应格式 `{ code: 200, headers: { messageId }, message: "OK", data: "{}" }`
  - 测试用例: `tests/dingtalk-stream.test.ts::buildAck returns correct format`

- [x] AC-009: 发送文本消息
  - 实现: `sendText(sessionWebhook, content)`
  - 功能: 通过 sessionWebhook 发送消息
  - 测试用例: `tests/dingtalk-stream.test.ts::sendText sends message via sessionWebhook`

- [x] AC-010: 断线重连
  - 实现: `reconnect()`
  - 功能: 最大重连次数限制，指数退避
  - 测试用例: `tests/dingtalk-stream.test.ts::reconnect respects max attempts`

- [x] AC-011: 事件监听
  - 实现: `on(event, handler)`
  - 功能: 支持 message、error、connected、disconnected 事件
  - 测试用例: `tests/dingtalk-stream.test.ts::event handlers registered`

- [ ] AC-012: WebSocket 消息事件（需要集成测试）
  - 功能: 收到消息时触发 message 事件
  - 测试用例: `tests/dingtalk-stream.test.ts::WebSocket receives message and emits event` (skipped - 需要 mock 或真实连接)

**技术方案**:

```typescript
// src/integrations/dingtalk/stream-client.ts
export class DingTalkStreamClient {
  private ws: WebSocket | null = null;
  private maxReconnectAttempts = 5;

  async connect(): Promise<void> {
    const { endpoint, ticket } = await this.getConnectionToken();
    const wsUrl = this.buildWebSocketUrl(endpoint, ticket);
    this.ws = new WebSocket(wsUrl);

    this.ws.on("message", (data) => {
      const parsed = this.parseMessage(data.toString());
      this.emit("message", parsed);
      // 必须回复 ACK
      const ack = this.buildAck(parsed.headers.messageId);
      this.ws.send(JSON.stringify(ack));
    });
  }

  async getConnectionToken(): Promise<{ endpoint: string; ticket: string }> {
    const response = await fetch(
      "https://api.dingtalk.com/v1.0/gateway/connections/open",
      {
        method: "POST",
        body: JSON.stringify({
          clientId: process.env.DINGTALK_CLIENT_ID,
          clientSecret: process.env.DINGTALK_CLIENT_SECRET,
          subscriptions: [
            { topic: "/v1.0/im/bot/messages/get", type: "CALLBACK" },
          ],
          ua: "dialog-survey/1.0",
        }),
      },
    );
    return response.json();
  }
}
```

**API 参考**:

| API            | URL                                                           | 说明                   |
| -------------- | ------------------------------------------------------------- | ---------------------- |
| 获取连接凭证   | `POST https://api.dingtalk.com/v1.0/gateway/connections/open` | 返回 endpoint + ticket |
| WebSocket 连接 | `${endpoint}?ticket=${ticket}`                                | 长连接接收消息         |
| 消息订阅 topic | `/v1.0/im/bot/messages/get`                                   | 接收机器人消息         |

**配置**:

```bash
# .env
DINGTALK_CLIENT_ID=<YOUR_DINGTALK_CLIENT_ID>
DINGTALK_CLIENT_SECRET=<YOUR_DINGTALK_CLIENT_SECRET>
DINGTALK_AGENT_ID=<YOUR_DINGTALK_AGENT_ID>
```

**风险**: 中 - 钉钉 API 限制，WebSocket 连接稳定性

---

### FR-005: 访谈计划管理

**优先级**: P1 (重要功能)

**描述**: 支持创建、管理访谈计划，批量邀约被访谈人。

**验收标准**:

- [x] AC-001: 创建访谈计划（名称、主题、目标人群）
  - 测试用例: `tests/interview-plan.test.ts::TestInterviewPlanService::test_create_plan`
- [x] AC-002: 导入被访谈人列表（CSV/Excel）
  - 测试用例: `tests/interview-plan.test.ts::TestInterviewPlanService::test_import_invitees`
- [x] AC-003: 设置访谈时间窗口
  - 测试用例: `tests/interview-plan.test.ts::TestInterviewPlanService::test_create_plan_with_time_window`
- [x] AC-004: 批量发送邀约
  - 测试用例: `tests/interview-plan-additional.test.ts::TestInterviewPlanServiceAdditional::test_batch_send_invitations`

**技术方案**:

- 新增 `InterviewPlan` 数据模型
- 批量导入 API
- 定时任务调度

**风险**: 中 - 需要批量处理优化

---

### FR-006: 访谈模板管理

**优先级**: P1 (重要功能)

**描述**: 支持自定义访谈话题和问题模板。

**验收标准**:

- [x] AC-001: 模板 JSON 格式定义
  - 测试用例: `tests/api/test_template.ts`
- [x] AC-002: 模板列表查询 API
  - 测试用例: `tests/api/test_template.ts`
- [ ] AC-003: 模板版本管理 (Task-008-3 - Future)
- [ ] AC-004: 模板克隆和导入导出 (Task-008-4 - Future)

**技术方案**:

- JSON Schema 定义模板格式
- 文件系统存储模板
- API 端点管理模板

**风险**: 低 - 已有基础实现

---

### FR-007: 统计分析

**优先级**: P1 (重要功能)

**描述**: 汇总多场访谈数据（支持 1000+ 规模），自动提取洞察、生成统计报告。用户无需人工翻看每份访谈记录，系统自动从海量对话中提取结构化结论。

**用户故事**: 作为管理者，当我完成对 1000 人的访谈后，我希望系统能自动分析所有访谈内容，告诉我：

1. 哪些话题被频繁提及，出现频率是多少
2. 正面/负面/中性评价的比例分布
3. 每个主题下的代表性观点和引用
4. 基于访谈结论的改进建议

**核心能力**:

| 能力     | 说明                                 | 输出形式                |
| -------- | ------------------------------------ | ----------------------- |
| 主题聚类 | 自动从访谈中提取讨论主题，量化提及率 | 主题列表 + 提及率百分比 |
| 情感分析 | 分析回答的情感倾向（正面/负面/中性） | 情感分布比例 + 趋势图   |
| 观点提取 | 每个主题提取代表性回答和关键观点     | 观点列表 + 原文引用     |
| 统计指标 | 计算提及率、满意度、NPS 等量化指标   | 数值 + 对比图表         |
| 分群对比 | 按用户属性（角色、部门等）分组分析   | 分群统计对比表          |

**验收标准**:

- [ ] **AC-001: 批量分析触发**
  - 用户可选择一个访谈计划，触发对所有已完成访谈的批量分析
  - 支持增量分析：新访谈完成后可自动纳入统计
  - 测试用例: `tests/services/test_analysis.ts::test_trigger_batch_analysis`

- [ ] **AC-002: 主题聚类与提及率**
  - 自动从访谈内容中提取讨论主题（无需人工预设）
  - 计算每个主题的提及率（该主题被提及的访谈数 / 总访谈数）
  - 按提及率排序，Top 10 主题展示
  - 测试用例: `tests/services/test_analysis.ts::test_topic_clustering`

- [ ] **AC-003: 情感分析**
  - 分析每段回答的情感倾向：正面、负面、中性
  - 计算整体情感分布比例
  - 按主题维度展示情感分布
  - 测试用例: `tests/services/test_analysis.ts::test_sentiment_analysis`

- [ ] **AC-004: 代表性观点提取**
  - 每个主题提取 3-5 条代表性回答
  - 提取关键观点摘要 + 原文引用
  - 观点来源标注（访谈 ID、回答者角色）
  - 测试用例: `tests/services/test_analysis.ts::test_key_points_extraction`

- [ ] **AC-005: 统计指标计算**
  - 提及率：某话题被提及的比例
  - 满意度得分：正面评价占比
  - 问题分布：负面反馈集中在哪些方面
  - 测试用例: `tests/services/test_analysis.ts::test_statistical_metrics`

- [ ] **AC-006: 分群对比分析**
  - 按用户属性分组（角色、部门、地区等）
  - 展示不同群体的观点差异
  - 识别群体间的共性问题和差异点
  - 测试用例: `tests/services/test_analysis.ts::test_group_comparison`

- [ ] **AC-007: 分析报告生成**
  - 生成 Markdown 格式分析报告
  - 包含：执行摘要、主题分析、情感分析、关键观点、改进建议
  - 测试用例: `tests/services/test_analysis.ts::test_analysis_report_generation`

- [ ] **AC-008: 导出功能**
  - 导出 PDF 格式报告（含图表）
  - 导出 Excel 格式数据表（原始数据 + 统计汇总）
  - 测试用例: `tests/api/test_export.ts`

**技术方案**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    统计分析架构                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐     ┌─────────────────┐                   │
│  │ Interview Data  │────▶│ Analysis Engine │                   │
│  │ (1000+ records) │     │                 │                   │
│  └─────────────────┘     │  ┌───────────┐  │                   │
│                          │  │ Topic     │  │                   │
│                          │  │ Clustering│  │──▶ Topics + Rates │
│                          │  └───────────┘  │                   │
│                          │  ┌───────────┐  │                   │
│                          │  │ Sentiment │  │──▶ Emotion Dist   │
│                          │  │ Analysis  │  │                   │
│                          │  └───────────┘  │                   │
│                          │  ┌───────────┐  │                   │
│                          │  │ Key Point │  │──▶ Quotes + Views │
│                          │  │ Extraction│  │                   │
│                          │  └───────────┘  │                   │
│                          └───────┬─────────┘                   │
│                                  │                             │
│                          ┌───────▼─────────┐                   │
│                          │ Analysis Result │                   │
│                          │ Storage         │                   │
│                          └─────────────────┘                   │
│                                  │                             │
│                          ┌───────▼─────────┐                   │
│                          │ Report Generator│                   │
│                          └─────────────────┘                   │
│                                  │                             │
│                          ┌───────▼─────────┐                   │
│                          │ Export Service  │──▶ PDF / Excel    │
│                          └─────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**LLM 分析 Prompt 设计**:

1. **主题提取 Prompt**:

```typescript
// src/services/analysis-prompts.ts
export const TOPIC_EXTRACTION_PROMPT = `
分析以下访谈回答，提取讨论的主要主题：

访谈内容：
{interview_content}

要求：
1. 提取 5-10 个主要讨论主题
2. 每个主题标注：主题名称、关键词、提及次数
3. 返回 JSON 格式：
{
  "topics": [
    {"name": "产品质量", "keywords": ["质量", "bug", "稳定性"], "mentions": 15},
    ...
  ]
}
`;
```

2. **情感分析 Prompt**:

```typescript
export const SENTIMENT_ANALYSIS_PROMPT = `
分析以下访谈回答的情感倾向：

回答内容：
{answer_content}

要求：
1. 判断情感倾向：positive / negative / neutral
2. 分析情感强度：strong / moderate / weak
3. 提取情感关键词
4. 返回 JSON 格式：
{
  "sentiment": "positive",
  "strength": "moderate",
  "keywords": ["满意", "好", "认可"],
  "reason": "对产品质量整体认可"
}
`;
```

3. **观点提取 Prompt**:

```typescript
export const KEY_POINT_EXTRACTION_PROMPT = `
从以下访谈回答中提取关键观点：

主题：{topic_name}
回答内容：{answer_content}

要求：
1. 提取 1-3 个核心观点
2. 每个观点附带原文引用
3. 返回 JSON 格式：
{
  "points": [
    {
      "summary": "产品质量有提升空间",
      "quote": "我觉得产品的稳定性还需要加强...",
      "sentiment": "negative"
    }
  ]
}
`;
```

**风险**: 中 - LLM 分析准确性需要验证，大批量处理需要性能优化

---

### FR-008: Webhook 到对话引擎触发机制

**优先级**: P0 (核心功能)

**描述**: 钉钉 Webhook 接收消息后，通过 ConversationEngine 路由到 LangGraph 状态机，禁止绕过此机制直接调用对话引擎。

**用户故事**: 作为系统架构师，我需要确保所有外部消息都经过统一的路由层处理，以便进行权限校验、日志记录和状态管理。

**验收标准**:

- [x] AC-001: Webhook 接收消息后调用 ConversationEngine
  - 测试用例: `tests/services/test_conversation_engine.ts::test_webhook_routes_to_engine`
- [x] AC-002: ConversationEngine 正确加载会话状态并调用 LangGraph
  - 测试用例: `tests/services/test_conversation_engine.ts::test_engine_loads_state_and_calls_graph`
- [x] AC-003: 禁止绕过 ConversationEngine 直接调用 graph
  - 验证方式: 代码审查，无其他模块直接导入 graph

**技术方案**:

```typescript
// src/services/conversation-engine.ts
export class ConversationEngine {
  async handleMessage(webhookPayload: DingTalkPayload): Promise<void> {
    // 1. 验证签名
    // 2. 解析用户消息
    // 3. 加载/创建会话状态
    // 4. 调用 LangGraph graph
    // 5. 发送响应消息
  }
}
```

**架构约束**:

- `src/api/webhook.ts` 只调用 `ConversationEngine.handleMessage()`
- `ConversationEngine` 是唯一能调用 LangGraph graph 的入口
- 其他模块禁止直接导入 `src/core/graph.ts`

**风险**: 低 - 已实现并测试

---

## 3. 非功能需求

### 3.1 性能要求

| 指标         | 要求     | 说明           |
| ------------ | -------- | -------------- |
| 单次访谈时长 | ~15 分钟 | 可配置         |
| 并发访谈数   | >= 100   | 同时进行的会话 |
| API 响应时间 | < 500ms  | 非 LLM 调用    |
| LLM 响应时间 | < 30s    | 单次生成       |

### 3.2 安全要求

| 安全需求       | 实现方案                                                        | 优先级 | 计划阶段 |
| -------------- | --------------------------------------------------------------- | ------ | -------- |
| API Key 认证   | Fastify 中间件校验 `X-API-Key` Header，支持多租户隔离           | P1     | Phase 2  |
| 钉钉签名验证   | HMAC-SHA256 签名验证，防止消息伪造                              | P0     | 已实现   |
| 数据加密存储   | 敏感字段（访谈内容）使用 AES-256-GCM 加密，密钥通过环境变量管理 | P1     | Phase 2  |
| 访谈数据匿名化 | 报告导出时可选择脱敏处理，移除用户标识信息                      | P1     | Phase 2  |

**安全需求实现说明**:

- P0 钉钉签名验证已在 Phase 1 完成
- P1 安全功能将在 Phase 2 访谈计划管理阶段统一实现
- 生产部署前必须完成所有 P1 安全需求

**加密存储技术方案**:

```typescript
// 使用 pgcrypto 扩展进行字段级加密
// 或在应用层使用 crypto 模块
import { createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = process.env.ENCRYPTION_KEY; // 32 bytes hex string

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(KEY, "hex"), iv);
  // ... 加密逻辑
}
```

**安全审计日志**:

- 记录所有 API 调用（用户、时间、操作）
- 记录所有访谈内容访问
- 保留日志 90 天

### 3.3 可用性要求

- [ ] 7×24 小时可用
- [ ] 错误重试机制
- [ ] 降级策略（LLM 不可用时）

---

## 4. 约束条件

### 4.1 技术约束

| 约束     | 说明                                                             |
| -------- | ---------------------------------------------------------------- |
| 大模型   | 支持多种 LLM 接入：阿里百炼 (Qwen)、火山引擎等，通过统一接口抽象 |
| 对话引擎 | LangGraph.js 状态机 (TypeScript 版本)                            |
| Web 框架 | Fastify                                                          |
| 数据库   | PostgreSQL + Prisma 5.x ORM                                      |
| 语音识别 | Fun-ASR (钉钉)                                                   |
| 消息平台 | 钉钉 Stream                                                      |

**技术栈说明**: 项目最初使用 Python 实现，后为加强类型检查能力重写为 TypeScript。本文档已更新为 TypeScript 技术栈。

**大模型接入设计**:

系统通过统一的 `LLMService` 接口抽象大模型调用，支持多种后端：

| 平台     | 模型                       | API 兼容          |
| -------- | -------------------------- | ----------------- |
| 阿里百炼 | Qwen-Max, Qwen-Turbo       | OpenAI-compatible |
| 火山引擎 | Doubao-Pro, Doubao-Lite    | OpenAI-compatible |
| 其他     | 任意 OpenAI-compatible API | OpenAI-compatible |

切换方式：通过环境变量 `LLM_PROVIDER` 和 `LLM_API_BASE` 配置。

### 4.2 业务约束

- 访谈数据保留 1 年
- 支持多语言（中文优先）
- 符合数据隐私法规

---

## 5. 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        钉钉平台                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ 文本消息    │  │ 语音消息    │  │ Stream 推送         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ Webhook / Stream
┌────────────────────────▼────────────────────────────────────┐
│                      Access Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Webhook API │  │ ASR 服务    │  │ 签名验证            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              LangGraph State Machine                  │  │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │ planning │→│interviewing│→│analyzing │→│completed│ │  │
│  │  └──────────┘ └───────────┘ └──────────┘ └────────┘ │  │
│  │       ↑            │                                  │  │
│  │       └────────────┘ (followup loop)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     AI Service Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Qwen-Max    │  │ Qwen-Turbo  │  │ Prompt 模板        │ │
│  │ (主对话)    │  │ (追问判断)  │  │                    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      Storage Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PostgreSQL  │  │ 文件存储    │  │ Redis (可选)        │ │
│  │ (会话状态)  │  │ (报告/模板) │  │ (缓存)              │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 变更记录

| 日期       | 版本 | 变更内容                                                                                                                                                                                              | 作者          |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-03-29 | 1.0  | 初始化规格文档                                                                                                                                                                                        | AI Agent      |
| 2026-03-29 | 1.1  | 补充验收标准和测试用例引用                                                                                                                                                                            | AI Agent      |
| 2026-03-29 | 2.0  | **FR-007 统计分析详细设计**: 新增 8 个验收标准（批量分析、主题聚类、情感分析、观点提取、统计指标、分群对比、报告生成、导出）；添加 LLM Prompt 设计；支持 1000+ 访谈规模                               | AI Agent      |
| 2026-04-08 | 3.0  | **Delphi Review 修复**: 1) 技术栈更新为 TypeScript (Fastify + Prisma 5.x + LangGraph.js)；2) 新增 FR-008 Webhook 到对话引擎触发机制；3) 更新 FR-002/003/004 验收标准状态；4) 补充安全需求具体实现方案 | Delphi Review |
| 2026-04-08 | 3.1  | **第二轮修复**: 1) FR-001 SQLAlchemy→Prisma；2) FR-007 Prompt 代码改为 TypeScript；3) 安全需求补充优先级和实现计划；4) 测试用例路径统一为 .ts 扩展名                                                  | Delphi Review |
| 2026-04-13 | 3.2  | **FR-004 Stream 模式**: 1) 新增 FR-004-Stream 子需求，详细描述 WebSocket 长连接模式；2) 新增 8 个验收标准 (AC-005 ~ AC-012)；3) 补充技术方案代码示例和 API 参考；4) 配置 Stream 模式环境变量          | AI Agent      |
