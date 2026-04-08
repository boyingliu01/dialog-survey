# 实现计划 (Plan)

> 本文档基于 `.speckit/specify.md` 编列实现计划，遵循 SDD 方法论。
> 所有功能均按从头开始实现处理。

---

## 0. 数据模型设计 (Prisma Schema)

### 0.1 核心实体定义

```prisma
// prisma/schema.prisma

model Interview {
  id            String    @id @default(cuid())
  status        InterviewStatus @default(PLANNING)
  templateId    String
  userId        String    // 钉钉用户ID
  userName      String?
  userRole      String?
  currentNode   String    @default("planning")
  currentTopicIndex Int   @default(0)
  totalQuestions Int      @default(0)
  answeredCount  Int      @default(0)
  reportPath    String?
  reportStatus  ReportStatus @default(PENDING)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?
  messages      Message[]
  responses     Response[]
  planId        String?
  @@index([userId])
  @@index([status])
}

enum InterviewStatus {
  PLANNING
  INTERVIEWING
  ANALYZING
  COMPLETED
  CANCELLED
}

enum ReportStatus {
  PENDING
  GENERATING
  COMPLETED
  FAILED
}

model Message {
  id            String    @id @default(cuid())
  interviewId   String
  role          MessageRole
  content       String    @db.Text
  contentType   ContentType @default(TEXT)
  asrText       String?   @db.Text
  asrConfidence Float?
  messageId     String?
  rawPayload    Json?
  createdAt     DateTime  @default(now())
  interview     Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  @@index([interviewId])
}

enum MessageRole { USER, ASSISTANT, SYSTEM }
enum ContentType { TEXT, VOICE, IMAGE }

model Response {
  id            String    @id @default(cuid())
  interviewId   String
  questionId     String?
  content       String    @db.Text
  sentiment     Sentiment?
  isFollowup    Boolean   @default(false)
  followupCount Int       @default(0)
  maxFollowups  Int       @default(2)
  createdAt     DateTime  @default(now())
  interview     Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  @@index([interviewId])
}

enum Sentiment { POSITIVE, NEGATIVE, NEUTRAL }

model Template {
  id            String    @id @default(cuid())
  name          String
  description   String?
  version       Int       @default(1)
  status        TemplateStatus @default(DRAFT)
  content       Json
  createdBy     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  interviews    Interview[]
}

enum TemplateStatus { DRAFT, ACTIVE, DEPRECATED }

model InterviewPlan {
  id            String    @id @default(cuid())
  name          String
  description   String?
  templateId    String
  startTime    DateTime?
  endTime      DateTime?
  maxParticipants Int     @default(1000)
  inviteStatus  InviteStatus @default(PENDING)
  totalInvited  Int       @default(0)
  totalStarted  Int       @default(0)
  totalCompleted Int      @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  interviews    Interview[]
}

enum InviteStatus { PENDING, SENDING, SENT, COMPLETED }

model AnalysisReport {
  id            String    @id @default(cuid())
  planId        String?
  interviewId   String?
  type          AnalysisType @default(BATCH)
  topics        Json?
  sentiment     Json?
  keyPoints     Json?
  metrics       Json?
  reportPath    String?
  createdAt     DateTime  @default(now())
  completedAt   DateTime?
}

enum AnalysisType { SINGLE, BATCH, COMPARISON }

model AuditLog {
  id            String    @id @default(cuid())
  userId        String?
  action        String
  resource      String
  resourceId    String?
  details       Json?
  ipAddress     String?
  createdAt     DateTime  @default(now())
  @@index([userId])
  @@index([action])
}
```

---

## 1. 技术架构设计

### 1.0 钉钉集成设计

**通信模式**: 钉钉机器人同时支持两种模式，本系统设计如下：

| 方向        | 模式         | 说明                     |
| ----------- | ------------ | ------------------------ |
| 机器人→用户 | Stream 推送  | 主动发送邀约、追问、报告 |
| 用户→机器人 | Webhook 回调 | 接收用户回复消息         |

**消息处理流程**:

1. **Webhook**: 用户发送消息 → 钉钉回调 → 验证签名 → 解析消息 → ConversationEngine
2. **Stream**: 定时任务 → 构建消息 → 调用钉钉API → 推送消息

**安全设计**:

- 签名验证: `HMAC-SHA256(timestamp + "\n" + secret)`
- 防重放攻击: 校验时间戳（5分钟内有效）
- **密钥管理**:
  - 密钥存储: 环境变量 (`DINGTALK_SECRET`, `DINGTALK_APP_SECRET`)
  - 密钥获取: `process.env.DINGTALK_SECRET` 读取
  - 轮换机制: 更新环境变量后重启服务（新密钥立即生效）
  - 生产建议: 可集成 AWS KMS/HashiCorp Vault 管理密钥

**错误处理**:

- 重试机制: 失败后指数退避重试3次
- 限流应对: 消息队列缓冲，速率控制 20msg/s
- 降级策略: 消息积压告警，人工介入

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        钉钉平台 (DingTalk)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │ 文本消息    │  │ 语音消息    │  │ Stream 推送         │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ Webhook / Stream
┌────────────────────────▼────────────────────────────────────────┐
│                      Access Layer (API 层)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ src/api/                                                  │  │
│  │  ├── webhook.ts        # 钉钉 Webhook 接收               │  │
│  │  ├── routes/           # Fastify 路由定义                │  │
│  │  └── middleware/       # 签名验证、中间件               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                 Application Layer (应用层)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ src/core/                                                  │  │
│  │  ├── graph.ts            # LangGraph 状态机定义          │  │
│  │  ├── nodes/              # 状态节点 (planning, interviewing, analyzing, completed) │  │
│  │  └── state.ts            # 状态类型定义                  │  │
│  │                                                            │  │
│  │ src/services/                                             │  │
│  │  ├── conversation-engine.ts  # 统一对话引擎入口          │  │
│  │  ├── llm-service.ts        # LLM 统一服务接口             │  │
│  │  ├── followup.service.ts   # 智能追问服务                │  │
│  │  ├── report.service.ts     # 报告生成服务                │  │
│  │  ├── dingtalk.service.ts   # 钉钉消息服务                │  │
│  │  └── asr.service.ts       # 语音识别服务                │  │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                     Domain Layer (领域层)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ src/domains/                                               │  │
│  │  ├── interview/          # 访谈领域 (实体、服务)          │  │
│  │  │   ├── entities/       # Interview, Message, Response   │  │
│  │  │   └── services/       # 访谈业务逻辑                  │  │
│  │  ├── template/           # 模板领域                       │  │
│  │  └── analysis/           # 统计分析领域                  │  │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  Infrastructure Layer (基础设施层)                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ src/repositories/         # 数据访问层                    │   │
│  │ src/integrations/        # 外部集成 (钉钉、LLM API)       │   │
│  │ prisma/                  # 数据库 schema                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 目录结构

```
src/
├── api/
│   ├── index.ts              # Fastify 应用入口
│   ├── webhook.ts            # Webhook 路由
│   ├── routes/
│   │   ├── interview.ts      # 访谈管理 API
│   │   ├── template.ts       # 模板管理 API
│   │   └── analysis.ts       # 统计分析 API
│   └── middleware/
│       └── signature.ts      # 签名验证
├── core/
│   ├── graph.ts              # LangGraph 状态机
│   ├── nodes/
│   │   ├── planning.ts       # 规划节点
│   │   ├── interviewing.ts   # 访谈节点
│   │   ├── analyzing.ts       # 分析节点
│   │   └── completed.ts      # 完成节点
│   └── state.ts              # 状态类型
├── services/
│   ├── conversation-engine.ts
│   ├── llm-service.ts
│   ├── followup.service.ts
│   ├── report.service.ts
│   ├── dingtalk.service.ts
│   ├── asr.service.ts
│   └── analysis.service.ts
├── domains/
│   ├── interview/
│   │   ├── entities/
│   │   │   ├── interview.entity.ts
│   │   │   ├── message.entity.ts
│   │   │   └── response.entity.ts
│   │   └── services/
│   │       └── interview.domain.ts
│   ├── template/
│   │   └── template.service.ts
│   └── analysis/
│       ├── analysis.service.ts
│       └── prompts/
│           ├── topic-extraction.ts
│           ├── sentiment-analysis.ts
│           └── key-point-extraction.ts
├── repositories/
│   ├── interview.repository.ts
│   ├── message.repository.ts
│   └── template.repository.ts
├── integrations/
│   ├── llm/
│   │   ├── base.ts           # LLM 抽象接口
│   │   ├── alibaba.ts        # 阿里百炼实现
│   │   └── volcengine.ts     # 火山引擎实现
│   └── dingtalk/
│       └── client.ts         # 钉钉客户端
└── utils/
    ├── encryption.ts         # 加密工具
    └── logger.ts            # 日志工具
```

### 1.3 技术栈选择

| 组件     | 技术选择                   | 原因                      |
| -------- | -------------------------- | ------------------------- |
| Web 框架 | Fastify                    | 高性能，TypeScript 支持好 |
| 对话引擎 | LangGraph.js               | 状态机管理多轮对话        |
| ORM      | Prisma 5.x                 | 类型安全，迁移方便        |
| 数据库   | PostgreSQL                 | 结构化数据存储            |
| LLM      | 阿里百炼 (Qwen) / 火山引擎 | OpenAI-compatible API     |
| 语音识别 | Fun-ASR                    | 阿里云服务                |
| 消息平台 | 钉钉 (Webhook + Stream)    | 企业级消息通道            |
| 测试     | Vitest                     | 快速、TS 支持好           |
| 代码质量 | Biome                      | Rust 高速 linter          |

### 1.4 错误处理与监控设计

#### 错误处理策略

| 场景           | 处理策略                           | 配置                   |
| -------------- | ---------------------------------- | ---------------------- |
| LLM 调用失败   | 指数退避重试3次，间隔 1s→2s→4s     | `MAX_LLM_RETRIES=3`    |
| LLM 全部失败   | 降级返回"服务暂时不可用"，记录日志 | 不可用时返回缓存prompt |
| 钉钉 API 限流  | 消息队列缓冲，延迟发送             | 队列最大1000条         |
| 数据库连接失败 | 连接池重试，超时熔断               | 熔断阈值10次/分钟      |
| 语音 ASR 失败  | 降级提示"请输入文字"               | 降级prompt反馈用户     |

#### 监控指标

| 指标           | 告警阈值         | 用途     |
| -------------- | ---------------- | -------- |
| API 响应时间   | p99 > 5s         | 性能监控 |
| LLM 调用失败率 | > 10%            | 告警     |
| 消息队列积压   | > 500条          | 告警     |
| 并发访谈数     | > 100            | 容量预警 |
| Token 消耗     | 日消耗 > 预算80% | 成本控制 |

#### 健康检查

- `/health` 端点:
  - DB: `SELECT 1` 真实连接检查
  - LLM: **实际调用 LLM 轻量接口（如 embeddings API）验证连通性**，超时设置 5 秒
  - 钉钉: 检查 AccessToken 配置存在性 + 缓存有效性
- 启动时自检: 验证数据库连接 + LLM 连通性
- 定期巡检: 每5分钟检查数据库连接 + LLM 实时连通性
- 健康检查降级: LLM 不可用时返回 degraded 状态但服务仍可用（本地缓存模板）

---

## 2. 实现阶段规划

### Phase 1: 基础设施搭建 (Week 1)

#### Task-001: 项目初始化与配置

**目标**: 完成项目基础结构和配置

**任务列表**:

- [Task-001-1] 初始化 TypeScript 项目 (package.json, tsconfig.json)
- [Task-001-2] 配置 Biome (lint + format)
- [Task-001-3] 配置 Vitest 测试框架
- [Task-001-4] **创建 Prisma schema 完整模型**（包含 Interview, Message, Response, Template, InterviewPlan, AnalysisReport, AuditLog）
- [Task-001-5] 配置环境变量模板 (.env.example)

**验收规则**:

- `npm run type-check` 无错误
- `biome check .` 无警告
- `npm test` 测试可运行
- Prisma client 可正常生成
- `npx prisma db push` 可创建数据库表

**预计工作量**: 1 天

---

#### Task-002: 钉钉消息通道接入

**目标**: 建立与钉钉的安全消息通道

**任务列表**:

- [Task-002-1] **实现钉钉签名验证中间件**（HMAC-SHA256，时间戳校验防重放）
- [Task-002-2] 实现 Webhook 消息接收接口
- [Task-002-3] 实现文本消息解析
- [Task-002-4] **集成 Fun-ASR 语音识别**（API端点、认证、失败降级）
- [Task-002-5] 实现消息响应发送（Stream模式）
- [Task-002-6] 实现消息队列和限流控制

**验收规则**:

- 签名验证通过测试用例验证（正确拒绝无效签名）
- 文本消息可正确解析为结构化数据
- 语音消息可转换为文字（失败时返回降级提示）
- 机器人可主动发送消息
- 限流控制：超过阈值返回429并加入队列

**预计工作量**: 2 天

---

### Phase 2: 核心对话功能 (Week 2-3)

#### Task-003: LangGraph 状态机

**目标**: 实现多轮对话流程控制

**前置依赖**: Task-001-4 (Prisma schema完成) 已完成

**架构设计**:

1. **状态持久化**:
   - 生产环境: 使用 `PostgreSQLSaver` + Prisma 实现持久化（必需）
   - 开发环境: 可使用 `MemorySaver` 用于快速迭代
   - 状态包含: `interviewId`, `currentNode`, `currentTopicIndex`, `conversationHistory`

2. **并发隔离与事务保护**:
   - 每场访谈对应独立 `threadId = interviewId`
   - 状态图实例通过 `threadId` 隔离，互不干扰
   - **数据库操作必须使用 Prisma `$transaction` 事务保证原子性**
   - 计数器 (`currentTopicIndex`, `answeredCount`) 使用 Prisma `increment` 避免竞态
   - **写操作使用乐观锁（版本号）防止脏写冲突**
   - 冲突处理: 重试 3 次后返回 409 Conflict

3. **状态流转条件**:
   - `planning → interviewing`: 模板加载完成，进入访谈
   - `interviewing → analyzing`: 用户发送"结束"或所有话题完成
   - `interviewing → interviewing (追问)`: LLM 判断需要追问
   - `analyzing → completed`: 报告生成完成

**任务列表**:

- [Task-003-1] 定义对话状态类型 (State)
- [Task-003-2] 实现 Planning 节点 (开场、话题引导)
- [Task-003-3] 实现 Interviewing 节点 (问答交互)
- [Task-003-4] 实现 Analyzing 节点 (生成报告)
- [Task-003-5] 实现 Completed 节点 (结束流程)
- [Task-003-6] 实现追问循环逻辑 (条件边)
- [Task-003-7] 实现状态持久化 (与 Prisma 集成)

**验收规则**:

- 状态机可正确流转 (planning → interviewing → analyzing → completed)
- 追问触发后正确回退到 interviewing
- 状态持久化到数据库
- 并发测试: 100场访谈同时进行状态不串扰

**预计工作量**: 3 天

---

#### Task-004: LLM 服务抽象

**目标**: 统一 LLM 调用接口，支持多provider和容错

**任务列表**:

- [Task-004-1] 定义 LLM 服务接口 (LLMService interface)
- [Task-004-2] 实现阿里百炼适配器
- [Task-004-3] 实现火山引擎适配器
- [Task-004-4] 实现 Prompt 模板管理
- [Task-004-5] **实现重试机制和降级策略**（指数退避3次，失败返回降级响应）

**验收规则**:

- 可通过配置切换不同 LLM 提供商
- LLM 调用失败有降级处理（重试3次后返回友好错误）
- Prompt 模板可动态加载
- 实现成本监控（记录token消耗）

**预计工作量**: 2 天

---

#### Task-005: 智能追问功能

**目标**: 实现基于 LLM 的智能追问

**任务列表**:

- [Task-005-1] 实现追问判断逻辑 (is_followup_needed)
- [Task-005-2] 实现追问问题生成 (generate_followup)
- [Task-005-3] 实现追问次数限制 (最多 2 次/话题)
- [Task-005-4] 集成到状态机

**验收规则**:

- 当回答模糊时触发追问
- 追问内容与上下文相关
- 追问次数不超过限制

**预计工作量**: 2 天

---

#### Task-006: 访谈报告生成

**目标**: 自动生成结构化访谈报告

**任务列表**:

- [Task-006-1] 设计报告数据结构
- [Task-006-2] 实现报告生成 LLM 调用
- [Task-006-3] 实现 Markdown 报告渲染
- [Task-006-4] 实现报告持久化存储

**验收规则**:

- 报告包含：关键发现、情绪分析、行动建议
- 报告保存到文件并记录路径到数据库

**预计工作量**: 2 天

---

### Phase 3: 访谈管理功能 (Week 4)

#### Task-007: 访谈计划管理

**目标**: 支持批量访谈管理

**任务列表**:

- [Task-007-1] 设计 InterviewPlan 数据模型
- [Task-007-2] 实现计划创建 API
- [Task-007-3] 实现被访谈人列表导入 (CSV/Excel)
- [Task-007-4] 实现邀约消息批量发送
- [Task-007-5] 实现定时任务调度

**验收规则**:

- 可创建访谈计划
- 可批量导入被访谈人
- 可设置访谈时间窗口

**预计工作量**: 3 天

---

#### Task-008: 访谈模板管理

**目标**: 自定义访谈话题和问题

**任务列表**:

- [Task-008-1] 设计模板 JSON Schema
- [Task-008-2] 实现模板 CRUD API
- [Task-008-3] 实现模板版本管理
- [Task-008-4] 实现模板导入导出

**验收规则**:

- 可创建、查询、更新、删除模板
- 支持模板版本管理
- 支持 JSON 格式导入导出

**预计工作量**: 2 天

---

### Phase 4: 高级功能 (Week 5-6)

#### Task-009: 统计分析

**目标**: 批量访谈数据的智能分析

**任务列表**:

- [Task-009-1] 设计分析服务架构
- [Task-009-2] 实现批量分析触发机制
- [Task-009-3] 实现主题聚类与提及率计算
- [Task-009-4] 实现情感分析
- [Task-009-5] 实现代表性观点提取
- [Task-009-6] 实现统计指标计算 (满意度、NPS)
- [Task-009-7] 实现分群对比分析
- [Task-009-8] 实现分析报告生成
- [Task-009-9] 实现 PDF/Excel 导出

**验收规则**:

- 支持 1000+ 访谈批量分析
- 主题聚类准确率 > 80%
- 情感分析准确率 > 85%
- 可导出 PDF 和 Excel 格式

**预计工作量**: 5 天

---

#### Task-010: 安全加固

**目标**: 满足生产环境安全要求

**任务列表**:

- [Task-010-1] 实现 API Key 认证中间件
- [Task-010-2] 实现数据加密存储 (AES-256-GCM)
- [Task-010-3] 实现访谈数据匿名化
- [Task-010-4] 实现安全审计日志

**验收规则**:

- API 调用需认证
- 敏感字段加密存储
- 报告导出支持脱敏

**预计工作量**: 2 天

---

## 3. 依赖关系图

```
Phase 1 (基础设施)
├── Task-001: 项目初始化
│   └── 包含 Prisma schema 定义 (Task-001-4)
└── Task-002: 钉钉消息通道
    ├── 包含安全验证 (Task-002-1 签名验证)
    └── 包含错误处理 (Task-002-6 限流队列)
    └── 依赖 Task-001

Phase 2 (核心功能)
├── Task-003: LangGraph 状态机
│   └── 依赖 Task-001-4 (schema定义)
├── Task-004: LLM 服务抽象
│   └── 依赖 Task-001
├── Task-005: 智能追问
│   └── 依赖 Task-003, Task-004
└── Task-006: 报告生成
    └── 依赖 Task-003, Task-004

Phase 3 (管理功能)
├── Task-007: 访谈计划管理
│   └── 依赖 Task-002, Task-003
└── Task-008: 模板管理
    └── 依赖 Task-001

Phase 4 (高级功能)
├── Task-009: 统计分析
│   └── 依赖 Task-006, Task-007
└── Task-010: 安全加固
    └── 依赖 Task-001, Task-002（可与 Phase 2 核心功能并行开发）
```

**注意**: Task-010 安全加固中的基础安全（API Key认证、加密存储）应与核心功能并行开发，确保上线前完成。

---

## 4. 风险评估

| 风险             | 影响 | 缓解措施               |
| ---------------- | ---- | ---------------------- |
| LLM 响应不稳定   | 高   | 实现重试机制和降级策略 |
| 钉钉 API 限流    | 中   | 实现消息队列和速率控制 |
| 大量访谈分析性能 | 中   | 实现分批处理和缓存     |
| 数据安全         | 高   | 加密存储和访问控制     |

---

## 5. 里程碑

| 里程碑           | 完成标准                 | 预计时间 |
| ---------------- | ------------------------ | -------- |
| M1: 基础设施就绪 | Task-001, Task-002 完成  | Week 1   |
| M2: 核心对话可用 | Task-003 ~ Task-006 完成 | Week 2-3 |
| M2b: 安全就绪    | Task-010 基础安全完成    | Week 2-3 |
| M3: 管理功能可用 | Task-007, Task-008 完成  | Week 4   |
| M4: 完整功能可用 | Task-009 完成            | Week 5-6 |

---

_本文档基于 `.speckit/specify.md` 编制，用于指导实现工作。_
