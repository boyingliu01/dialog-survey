# 实现计划 (Implementation Plan)

> 本文档描述访谈机器人的技术方案和实现步骤，遵循 SDD 方法论。
> 每个任务关联到功能规格 (specify.md) 中的 FR-XXX 和验收标准 AC-XXX。

---

## 1. 技术方案

### 1.1 架构设计

采用四层架构：

| 层级              | 职责                               | 技术选型                 | 关键文件                                         |
| ----------------- | ---------------------------------- | ------------------------ | ------------------------------------------------ |
| Access Layer      | 接收钉钉消息、签名验证、语音转文字 | Fastify, Fun-ASR         | `src/api/webhook.ts`, `src/services/asr.ts`      |
| Application Layer | 对话状态管理、业务逻辑             | LangGraph.js, TypeScript | `src/core/graph.ts`, `src/core/nodes.ts`         |
| AI Service Layer  | LLM 调用、Prompt 管理              | OpenAI-compatible API    | `src/services/llm.ts`, `src/services/prompts.ts` |
| Storage Layer     | 数据持久化                         | PostgreSQL, Prisma 7.x   | `prisma/schema.prisma`, `src/repositories/`      |

### 1.2 大模型接入设计

系统通过 `LLMService` 类统一抽象 LLM 调用，支持多种后端：

```typescript
// src/services/llm.ts
export class LLMService {
  /** 统一 LLM 接口，支持 OpenAI-compatible API */

  private model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: { model?: string; apiKey?: string; baseUrl?: string }) {
    this.model = config?.model ?? process.env.LLM_MODEL ?? "qwen-max";
    this.apiKey = config?.apiKey ?? process.env.LLM_API_KEY!;
    this.baseUrl = config?.baseUrl ?? process.env.LLM_API_BASE!;
  }
}
```

**支持的 LLM 平台**：

| 平台     | 环境变量配置                                                                    | 模型列表                        |
| -------- | ------------------------------------------------------------------------------- | ------------------------------- |
| 阿里百炼 | `LLM_API_KEY`, `LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-max, qwen-turbo, qwen-plus |
| 火山引擎 | `LLM_API_KEY`, `LLM_API_BASE=https://ark.cn-beijing.volces.com/api/v3`          | doubao-pro, doubao-lite         |

### 1.3 数据模型

#### 已实现

```
┌─────────────────┐     ┌─────────────────┐
│    Interview    │     │     Message     │
├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │
│ session_id (UK) │────<│ interview_id    │
│ user_id         │     │ role            │
│ template_id     │     │ content         │
│ topic           │     │ msg_type        │
│ status          │     │ created_at      │
│ conversation_   │     └─────────────────┘
│   history (JSON)│
│ report_path     │
│ created_at      │
│ updated_at      │
└─────────────────┘
```

#### 待实现 (Phase 2)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ InterviewPlan   │     │ Interviewee     │     │ Template        │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ name            │────<│ plan_id (FK)    │     │ name            │
│ description     │     │ user_id         │     │ version         │
│ template_id(FK) │     │ name            │     │ content (JSON)  │
│ start_date      │     │ phone           │     │ created_at      │
│ end_date        │     │ status          │     │ updated_at      │
│ status          │     │ invited_at      │     └─────────────────┘
│ created_at      │     │ completed_at    │
└─────────────────┘     └─────────────────┘
```

---

## 2. 实现步骤

### Phase 1: 核心对话功能 ✅

**关联规格**: FR-001, FR-002, FR-003, FR-004

**状态**: 已完成

| 任务                 | 状态 | 关联 AC           | 验证                                                 |
| -------------------- | ---- | ----------------- | ---------------------------------------------------- |
| 1.1 LangGraph 状态机 | ✅   | FR-001 AC-001~003 | `tests/core/test_graph.py`                           |
| 1.2 对话节点实现     | ✅   | FR-001, FR-002    | `tests/core/test_nodes.py`                           |
| 1.3 消息处理服务     | ✅   | FR-004 AC-002     | `tests/services/test_message_service.py`             |
| 1.4 LLM 服务封装     | ✅   | FR-002, FR-003    | `tests/services/test_llm.py`                         |
| 1.5 Prompt 模板      | ✅   | FR-002, FR-003    | `tests/services/test_llm.py::TestPrompts`            |
| 1.6 ASR 语音识别     | ✅   | FR-004 AC-003     | `tests/services/test_asr.py`                         |
| 1.7 端到端测试       | ✅   | FR-001 全部       | `tests/core/test_graph.py::TestEndToEndConversation` |

**产出**:

- ✅ 多轮对话上下文记忆
- ✅ 智能追问机制（基础）
- ✅ Markdown 报告生成
- ✅ 钉钉 Webhook 接收消息
- ✅ 272 个单元测试通过

---

### Phase 1.5: 功能完善 (优先级最高)

**目标**: 补全 Phase 1 遗留的验收标准

**关联规格**:

- FR-002 AC-003 (追问次数限制)
- FR-003 AC-002, AC-003 (报告完善)
- FR-004 AC-004 (主动发送消息)

#### 1.5.1 追问次数限制 (FR-002 AC-003)

**目标**: 每个话题最多追问 2 次

**实现方案**:

```typescript
// src/core/state.ts - 新增字段
export interface InterviewState {
  // ... existing fields
  followup_count: Record<string, number>; // {topic_id: count}
}

// src/core/nodes.ts - interviewing_node 修改
export function interviewing_node(
  state: InterviewState,
): Partial<InterviewState> {
  const topic_id = state.current_topic;
  const followup_count = state.followup_count ?? {};

  if ((followup_count[topic_id] ?? 0) >= 2) {
    // 跳过追问，直接下一话题
    return { needs_followup: false };
  }
}
```

**任务列表**:
| 任务 | 预计工时 | 测试用例 |
|------|----------|----------|
| 1.5.1.1 修改 `InterviewState` 添加 `followup_count` | 0.5h | `test_state_has_followup_count` |
| 1.5.1.2 修改 `interviewing_node` 检查追问次数 | 1h | `test_followup_limited_to_2_per_topic` |
| 1.5.1.3 修改 `followup_node` 增加计数 | 0.5h | `test_followup_count_increments` |
| 1.5.1.4 集成测试 | 0.5h | `test_full_interview_with_followup_limit` |

**验证命令**:

```bash
pytest tests/core/test_followup_limit.py -v
```

---

#### 1.5.2 报告内容完善 (FR-003 AC-002)

**目标**: 报告包含关键发现、情绪分析、行动建议

**实现方案**:

```typescript
// src/services/prompts.ts - 优化报告 Prompt
export const REPORT_GENERATE_PROMPT_V2 = `
基于以下访谈内容，生成结构化报告：

## 1. 访谈概览
- 访谈主题：{topic}
- 访谈时长：约 {duration} 分钟
- 回答质量评分：{quality_score}/10

## 2. 关键发现
按话题整理核心观点：
{key_findings}

## 3. 情绪分析
- 整体情绪倾向：{sentiment_overall}
- 正面反馈占比：{positive_ratio}%
- 负面反馈占比：{negative_ratio}%
- 具体情绪分布：{sentiment_details}

## 4. 改进建议
基于访谈内容，提出具体可执行的改进建议：
{action_items}

## 5. 原始对话摘要
{conversation_summary}
`;
```

**任务列表**:
| 任务 | 预计工时 | 测试用例 |
|------|----------|----------|
| 1.5.2.1 设计报告结构模板 | 1h | `test_report_template_structure` |
| 1.5.2.2 实现 `generate_structured_report` | 2h | `test_report_contains_key_findings` |
| 1.5.2.3 实现情绪分析辅助函数 | 1h | `test_sentiment_analysis` |
| 1.5.2.4 集成测试 | 1h | `test_full_report_generation` |

---

#### 1.5.3 报告持久化 (FR-003 AC-003)

**目标**: 报告保存到文件系统，路径存储到数据库

**实现方案**:

```typescript
// src/services/report_service.ts (新文件)
import { promises as fs } from "node:fs";
import { join } from "node:path";

export class ReportService {
  private reportsDir: string;

  constructor(reportsDir: string = "reports") {
    this.reportsDir = reportsDir;
  }

  async saveReport(sessionId: string, content: string): Promise<string> {
    /** 保存报告到文件系统，返回文件路径 */
    const reportDir = join(this.reportsDir, sessionId);
    await fs.mkdir(reportDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, -5);
    const filename = `report_${timestamp}.md`;
    const filepath = join(reportDir, filename);

    await fs.writeFile(filepath, content, "utf-8");
    return filepath;
  }
}
```

**任务列表**:
| 任务 | 预计工时 | 测试用例 |
|------|----------|----------|
| 1.5.3.1 创建 `ReportService` | 1h | `test_report_service_save` |
| 1.5.3.2 修改 `analyzing_node` 调用保存 | 0.5h | `test_analyzing_node_saves_report` |
| 1.5.3.3 更新 `Interview.report_path` | 0.5h | `test_report_path_stored_in_db` |
| 1.5.3.4 添加报告查询 API | 1h | `test_get_report_api` |

---

#### 1.5.4 钉钉主动发送消息 (FR-004 AC-004)

**目标**: 机器人能主动向用户发送消息

**实现方案**:

```typescript
// src/services/dingtalk_sender.ts (新文件)
export class DingTalkSender {
  /** 钉钉消息发送服务 */

  async sendText(userId: string, content: string): Promise<boolean> {
    /** 发送文本消息 */
  }

  async sendMarkdown(
    userId: string,
    title: string,
    content: string,
  ): Promise<boolean> {
    /** 发送 Markdown 消息 */
  }

  async sendInterviewInvitation(
    userId: string,
    planName: string,
    startUrl: string,
  ): Promise<boolean> {
    /** 发送访谈邀约 */
  }
}
```

**任务列表**:
| 任务 | 预计工时 | 测试用例 |
|------|----------|----------|
| 1.5.4.1 创建 `DingTalkSender` 类 | 2h | `test_dingtalk_sender_init` |
| 1.5.4.2 实现 `send_text` 方法 | 1h | `test_send_text_message` |
| 1.5.4.3 实现 `send_markdown` 方法 | 1h | `test_send_markdown_message` |
| 1.5.4.4 集成测试 | 1h | `test_send_message_to_real_user` |

---

### Phase 2: 访谈计划与模板管理

**关联规格**: FR-005, FR-006

**前置依赖**: Phase 1.5 完成

#### 2.1 数据模型设计

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 2.1.1 创建 `InterviewPlan` 模型 | 1h | FR-005 AC-001 | `test_interview_plan_model` |
| 2.1.2 创建 `Interviewee` 模型 | 1h | FR-005 AC-002 | `test_interviewee_model` |
| 2.1.3 创建 `Template` 模型 (可选) | 1h | FR-006 AC-003 | `test_template_model` |
| 2.1.4 编写 Alembic 迁移脚本 | 1h | - | `alembic upgrade head` |
| 2.1.5 模型单元测试 | 1h | - | `tests/models/test_plan.py` |

**数据模型定义**:

```prisma
// prisma/schema.prisma

model InterviewPlan {
  id          Int             @id @default(autoincrement())
  name        String          @db.VarChar(255)
  description String?         @db.Text
  templateId  String          @default("quality_survey") @db.VarChar(50)
  startDate   DateTime?
  endDate     DateTime?
  status      String          @default("draft") @db.VarChar(20)  // draft, active, completed, cancelled
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  interviewees Interviewee[]
}

model Interviewee {
  id          Int             @id @default(autoincrement())
  planId      Int
  plan        InterviewPlan   @relation(fields: [planId], references: [id])
  userId      String          @db.VarChar(100)  // 钉钉用户 ID
  name        String?         @db.VarChar(100)
  phone       String?         @db.VarChar(20)
  status      String          @default("pending") @db.VarChar(20)  // pending, invited, in_progress, completed
  invitedAt   DateTime?
  completedAt DateTime?
}
```

---

#### 2.2 访谈计划 API

**API 设计**:

```
POST   /api/plans                          # 创建计划 (FR-005 AC-001)
GET    /api/plans                          # 计划列表
GET    /api/plans/{id}                     # 计划详情
PUT    /api/plans/{id}                     # 更新计划
DELETE /api/plans/{id}                     # 删除计划
PATCH  /api/plans/{id}/status              # 更新状态 (启动/暂停/完成)

POST   /api/plans/{id}/interviewees        # 添加被访谈人
GET    /api/plans/{id}/interviewees        # 被访谈人列表
POST   /api/plans/{id}/interviewees/import # 批量导入 (FR-005 AC-002)
DELETE /api/plans/{id}/interviewees/{iid}  # 删除被访谈人
```

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 2.2.1 创建计划 API | 2h | FR-005 AC-001 | `test_create_plan_api` |
| 2.2.2 计划列表/详情 API | 1h | - | `test_list_plans_api` |
| 2.2.3 更新/删除计划 API | 1h | - | `test_update_plan_api` |
| 2.2.4 添加被访谈人 API | 1h | FR-005 AC-002 | `test_add_interviewee` |
| 2.2.5 批量导入 API (CSV) | 2h | FR-005 AC-002 | `test_import_csv` |
| 2.2.6 批量导入 API (Excel) | 2h | FR-005 AC-002 | `test_import_excel` |
| 2.2.7 API 测试 | 2h | - | `tests/api/test_plans.py` |

---

#### 2.3 模板管理

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 2.3.1 模板版本字段 | 1h | FR-006 AC-003 | `test_template_version` |
| 2.3.2 模板克隆 API | 2h | FR-006 AC-004 | `test_clone_template` |
| 2.3.3 模板导出 API (JSON) | 1h | FR-006 AC-004 | `test_export_template` |
| 2.3.4 模板导入 API | 2h | FR-006 AC-004 | `test_import_template` |
| 2.3.5 模板 API 测试 | 1h | - | `tests/api/test_template.py` |

---

### Phase 3: 邀约与推送

**关联规格**: FR-005 AC-004

**前置依赖**: Phase 2 完成, FR-004 AC-004 完成

#### 3.1 邀约发送

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 3.1.1 邀约消息模板设计 | 1h | FR-005 AC-004 | - |
| 3.1.2 批量发送 API | 2h | FR-005 AC-004 | `test_send_invitations` |
| 3.1.3 发送队列实现 | 2h | FR-005 AC-004 | `test_send_queue` |
| 3.1.4 发送状态追踪 | 1h | FR-005 AC-004 | `test_track_send_status` |
| 3.1.5 邀约测试 | 1h | - | `tests/services/test_invitation.py` |

---

#### 3.2 定时提醒

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 3.2.1 APScheduler 集成 | 1h | - | `test_scheduler_setup` |
| 3.2.2 提醒任务实现 | 2h | - | `test_reminder_task` |
| 3.2.3 提醒消息模板 | 0.5h | - | - |
| 3.2.4 提醒测试 | 0.5h | - | `tests/services/test_reminder.py` |

---

### Phase 4: 统计分析模块

**关联规格**: FR-007

**前置依赖**: Phase 1.5 完成，Phase 2 完成（需要 InterviewPlan 模型）

**目标**: 支持对 1000+ 访谈记录进行批量分析，自动提取洞察

---

#### 4.1 数据模型设计

**新增数据表**:

```prisma
// prisma/schema.prisma

model AnalysisJob {
  /** 分析任务表 */
  id              Int              @id @default(autoincrement())
  planId          Int
  plan            InterviewPlan    @relation(fields: [planId], references: [id])
  status          String           @default("pending") @db.VarChar(20)  // pending, running, completed, failed
  totalInterviews Int
  processedCount  Int              @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  errorMessage    String?          @db.Text
  createdAt       DateTime         @default(now())
  topics          AnalysisTopic[]
  results         AnalysisResult[]
}

model AnalysisTopic {
  /** 分析主题表 - 自动提取的主题 */
  id            Int         @id @default(autoincrement())
  jobId         Int
  job           AnalysisJob @relation(fields: [jobId], references: [id])
  name          String      @db.VarChar(255)
  keywords      Json        // 关联关键词列表
  mentionCount  Int
  mentionRate   Float
  positiveRatio Float
  negativeRatio Float
  neutralRatio  Float
  createdAt     DateTime    @default(now())
  keyPoints     KeyPoint[]
}

model KeyPoint {
  /** 关键观点表 - 代表性观点和引用 */
  id             Int         @id @default(autoincrement())
  topicId        Int
  topic          AnalysisTopic @relation(fields: [topicId], references: [id])
  interviewId    Int
  interview      Interview @relation(fields: [interviewId], references: [id])
  summary        String      @db.Text
  quote          String      @db.Text
  sentiment      String      @db.VarChar(20)  // positive, negative, neutral
  intervieweeRole String     @db.VarChar(100)
  createdAt      DateTime    @default(now())
}

model AnalysisResult {
  /** 分析结果汇总表 */
  id                Int         @id @default(autoincrement())
  jobId             Int
  job               AnalysisJob @relation(fields: [jobId], references: [id])
  totalInterviews   Int
  overallSentiment  Json
  topTopics         Json
  satisfactionScore Float
  npsScore          Float?
  reportPath        String      @db.VarChar(255)
  createdAt         DateTime    @default(now())
}
```

**数据模型关系图**:

```
┌─────────────────┐
│ InterviewPlan   │
└─────────────────┘
        │
        │ plan_id
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ AnalysisJob     │────<│ AnalysisTopic   │────<│ KeyPoint        │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │     │ id              │
│ plan_id         │     │ job_id          │     │ topic_id        │
│ status          │     │ name            │     │ interview_id    │
│ total_interviews│     │ keywords        │     │ summary         │
│ processed_count │     │ mention_count   │     │ quote           │
│ ...             │     │ mention_rate    │     │ sentiment       │
└─────────────────┘     │ positive_ratio  │     │ interviewee_role│
        │               │ ...             │     └─────────────────┘
        │               └─────────────────┘
        │ job_id
        ▼
┌─────────────────┐
│ AnalysisResult  │
├─────────────────┤
│ id              │
│ job_id          │
│ total_interviews│
│ overall_sentiment│
│ top_topics      │
│ satisfaction_   │
│   score         │
│ report_path     │
└─────────────────┘
```

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.1.1 创建 `AnalysisJob` 模型 | 1h | FR-007 | `test_analysis_job_model` |
| 4.1.2 创建 `AnalysisTopic` 模型 | 1h | FR-007 AC-002 | `test_analysis_topic_model` |
| 4.1.3 创建 `KeyPoint` 模型 | 1h | FR-007 AC-004 | `test_key_point_model` |
| 4.1.4 创建 `AnalysisResult` 模型 | 1h | FR-007 AC-007 | `test_analysis_result_model` |
| 4.1.5 编写 Alembic 迁移脚本 | 1h | - | `alembic upgrade head` |
| 4.1.6 模型关系测试 | 1h | - | `tests/models/test_analysis.py` |

---

#### 4.2 分析服务设计

**核心服务**: `AnalysisService`

```python
# src/services/analysis_service.py

class AnalysisService:
    """访谈统计分析服务"""

    async def create_analysis_job(
        self,
        plan_id: int,
        db: Session
    ) -> AnalysisJob:
        """创建分析任务"""

    async def run_analysis(
        self,
        job_id: int,
        db: Session
    ) -> AnalysisResult:
        """执行分析任务（异步）"""
        # 1. 获取所有已完成访谈
        # 2. 批量提取主题
        # 3. 批量分析情感
        # 4. 提取关键观点
        # 5. 计算统计指标
        # 6. 生成分析报告

    async def extract_topics(
        self,
        interview_contents: List[str]
    ) -> List[Dict]:
        """主题聚类"""
        # LLM Prompt 批量处理

    async def analyze_sentiment(
        self,
        content: str
    ) -> Dict:
        """情感分析"""

    async def extract_key_points(
        self,
        topic: str,
        content: str
    ) -> List[Dict]:
        """关键观点提取"""

    async def generate_analysis_report(
        self,
        result: AnalysisResult
    ) -> str:
        """生成分析报告 Markdown"""
```

**批量处理策略**:

| 策略     | 说明                                |
| -------- | ----------------------------------- |
| 分批处理 | 每批 50 个访谈，避免 LLM 上下文溢出 |
| 增量更新 | 新访谈完成后可增量更新分析结果      |
| 异步执行 | 使用后台任务队列，不阻塞用户操作    |
| 缓存优化 | 已分析结果缓存，避免重复计算        |

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.2.1 创建 `AnalysisService` 类 | 2h | FR-007 | `test_analysis_service_init` |
| 4.2.2 实现 `create_analysis_job` | 1h | FR-007 AC-001 | `test_create_analysis_job` |
| 4.2.3 实现 `extract_topics` | 3h | FR-007 AC-002 | `test_topic_extraction` |
| 4.2.4 实现 `analyze_sentiment` | 2h | FR-007 AC-003 | `test_sentiment_analysis_service` |
| 4.2.5 实现 `extract_key_points` | 2h | FR-007 AC-004 | `test_key_point_extraction` |
| 4.2.6 实现批量处理逻辑 | 2h | FR-007 AC-001 | `test_batch_processing` |
| 4.2.7 实现异步任务执行 | 2h | FR-007 AC-001 | `test_async_analysis` |
| 4.2.8 服务集成测试 | 2h | - | `tests/services/test_analysis.py` |

---

#### 4.3 LLM Prompt 模板设计

**新增 Prompt 模板文件**: `src/services/analysis_prompts.py`

```python
# src/services/analysis_prompts.py

# 主题提取 Prompt
TOPIC_EXTRACTION_PROMPT = """
你是一个专业的访谈分析师。请分析以下访谈内容，提取主要讨论主题。

访谈内容（{count} 段回答）：
{contents}

分析要求：
1. 提取 5-10 个主要讨论主题
2. 每个主题标注：
   - 主题名称（简洁概括）
   - 关联关键词（3-5 个）
   - 提及次数（在该批访谈中出现多少次）
3. 主题应基于访谈实际内容，不要预设

返回 JSON 格式（严格按此格式）：
{
  "topics": [
    {
      "name": "产品质量",
      "keywords": ["质量", "稳定性", "bug", "缺陷"],
      "mentions": 12
    },
    {
      "name": "服务态度",
      "keywords": ["服务", "态度", "响应", "专业"],
      "mentions": 8
    }
  ]
}

只返回 JSON，不要其他内容。
"""

# 情感分析 Prompt
SENTIMENT_ANALYSIS_PROMPT = """
分析以下访谈回答的情感倾向。

回答内容：
{content}

分析要求：
1. 判断整体情感倾向：positive（正面）、negative（负面）、neutral（中性）
2. 分析情感强度：strong（强烈）、moderate（中等）、weak（轻微）
3. 提取体现情感的关键词或短语

返回 JSON 格式：
{
  "sentiment": "positive",
  "strength": "moderate",
  "keywords": ["满意", "认可", "好"],
  "brief_reason": "整体态度积极，表达满意"
}

只返回 JSON。
"""

# 关键观点提取 Prompt
KEY_POINT_EXTRACTION_PROMPT = """
从以下访谈回答中提取关键观点，要求与主题 "{topic_name}" 相关。

回答内容：
{content}

提取要求：
1. 提取 1-3 个核心观点
2. 每个观点需包含：
   - 观点摘要（简洁概括，20 字以内）
   - 原文引用（最能体现观点的原文片段）
   - 情感倾向（positive/negative/neutral）

返回 JSON 格式：
{
  "points": [
    {
      "summary": "稳定性需要加强",
      "quote": "系统偶尔会出问题，希望能更稳定",
      "sentiment": "negative"
    }
  ]
}

只返回 JSON。
"""

# 分析报告生成 Prompt
ANALYSIS_REPORT_PROMPT = """
基于以下分析数据，生成访谈分析报告。

分析数据：
- 总访谈数：{total_interviews}
- 主要主题：{topics}
- 整体情感分布：{sentiment_distribution}
- 关键观点：{key_points}
- 满意度得分：{satisfaction_score}

生成 Markdown 格式报告，包含：
1. 执行摘要（2-3 段概述）
2. 主题分析（每个主题的详细分析）
3. 情感分析（情感分布解读）
4. 关键发现（代表性观点）
5. 改进建议（基于负面反馈的建议）

返回完整 Markdown 文本。
"""
```

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.3.1 创建 `analysis_prompts.py` | 1h | FR-007 | `test_analysis_prompts_exist` |
| 4.3.2 主题提取 Prompt 测试 | 1h | FR-007 AC-002 | `test_topic_extraction_prompt` |
| 4.3.3 情感分析 Prompt 测试 | 1h | FR-007 AC-003 | `test_sentiment_analysis_prompt` |
| 4.3.4 观点提取 Prompt 测试 | 1h | FR-007 AC-004 | `test_key_point_extraction_prompt` |
| 4.3.5 报告生成 Prompt 测试 | 1h | FR-007 AC-007 | `test_report_generation_prompt` |

---

#### 4.4 统计分析 API 设计

**API 端点设计**:

```
POST   /api/analysis/jobs                     # 创建分析任务 (FR-007 AC-001)
GET    /api/analysis/jobs                     # 分析任务列表
GET    /api/analysis/jobs/{job_id}            # 任务详情（含进度）
DELETE /api/analysis/jobs/{job_id}            # 取消任务

GET    /api/analysis/jobs/{job_id}/result     # 获取分析结果
GET    /api/analysis/jobs/{job_id}/topics     # 主题分析详情
GET    /api/analysis/jobs/{job_id}/sentiment  # 情感分析详情
GET    /api/analysis/jobs/{job_id}/points     # 关键观点列表

GET    /api/analysis/jobs/{job_id}/report     # 下载分析报告 (Markdown)
GET    /api/analysis/jobs/{job_id}/export/pdf # 导出 PDF (FR-007 AC-008)
GET    /api/analysis/jobs/{job_id}/export/excel # 导出 Excel (FR-007 AC-008)
```

**请求/响应模型**:

```python
# src/api/analysis_models.py

class CreateAnalysisJobRequest(BaseModel):
    plan_id: int

class AnalysisJobResponse(BaseModel):
    id: int
    plan_id: int
    status: str
    total_interviews: int
    processed_count: int
    progress: float  # 0.0 - 1.0
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

class AnalysisResultResponse(BaseModel):
    total_interviews: int
    overall_sentiment: Dict  # {"positive": 45.2, "negative": 20.1, "neutral": 34.7}
    top_topics: List[Dict]   # [{"name": "产品质量", "rate": 78.5}, ...]
    satisfaction_score: float
    nps_score: Optional[float]

class TopicDetailResponse(BaseModel):
    name: str
    keywords: List[str]
    mention_count: int
    mention_rate: float
    positive_ratio: float
    negative_ratio: float
    neutral_ratio: float
    key_points: List[KeyPointResponse]

class KeyPointResponse(BaseModel):
    summary: str
    quote: str
    sentiment: str
    interviewee_role: str
    interview_id: int
```

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.4.1 创建分析 API router | 1h | FR-007 | `test_analysis_router_exists` |
| 4.4.2 实现创建任务 API | 1h | FR-007 AC-001 | `test_create_analysis_job_api` |
| 4.4.3 实现任务状态查询 API | 1h | FR-007 AC-001 | `test_get_analysis_job_api` |
| 4.4.4 实现分析结果 API | 2h | FR-007 AC-002~005 | `test_get_analysis_result_api` |
| 4.4.5 实现主题详情 API | 1h | FR-007 AC-002 | `test_get_topics_api` |
| 4.4.6 实现情感分析 API | 1h | FR-007 AC-003 | `test_get_sentiment_api` |
| 4.4.7 实现关键观点 API | 1h | FR-007 AC-004 | `test_get_key_points_api` |
| 4.4.8 API 集成测试 | 2h | - | `tests/api/test_analysis.py` |

---

#### 4.5 报告生成与导出

**分析报告结构** (Markdown):

```markdown
# 访谈分析报告

## 执行摘要

本次分析涵盖 {total} 场访谈，主要发现如下：

- Top 3 关注主题：{topics}
- 整体满意度：{score}/10
- 主要改进方向：{improvements}

## 主题分析

### {topic_1}

**提及率**: {rate}% ({count}/{total})

**情感分布**:

- 正面评价：{positive}%
- 负面评价：{negative}%
- 中性评价：{neutral}%

**代表性观点**:

1. {point_1} - "{quote_1}"
2. {point_2} - "{quote_2}"

...

## 情感分析

### 整体情感分布

| 情感类型 | 占比        | 访谈数  |
| -------- | ----------- | ------- |
| 正面     | {positive}% | {count} |
| 负面     | {negative}% | {count} |
| 中性     | {neutral}%  | {count} |

### 情感趋势

{sentiment_trend_analysis}

## 关键发现

{key_findings}

## 改进建议

基于访谈分析，建议采取以下改进措施：

1. {suggestion_1}
2. {suggestion_2}
   ...

---

_报告生成时间：{timestamp}_
_分析访谈总数：{total}_
```

**PDF 导出技术方案**:

| 方案                 | 优点                | 缺点         |
| -------------------- | ------------------- | ------------ |
| WeasyPrint           | 纯 Python，支持 CSS | 安装依赖较多 |
| ReportLab            | 功能强大            | 学习曲线高   |
| pdfkit (wkhtmltopdf) | 简单                | 需外部依赖   |
| markdown-pdf         | 最简单              | 功能有限     |

**推荐方案**: WeasyPrint（Markdown → HTML → PDF）

**Excel 导出技术方案**:

- 使用 `pandas` + `openpyxl`
- 多 Sheet 结构：
  - Sheet 1: 执行摘要
  - Sheet 2: 主题分析
  - Sheet 3: 情感分析
  - Sheet 4: 关键观点
  - Sheet 5: 原始数据

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.5.1 设计报告模板 | 1h | FR-007 AC-007 | `test_report_template` |
| 4.5.2 实现报告生成函数 | 2h | FR-007 AC-007 | `test_generate_analysis_report` |
| 4.5.3 安装 WeasyPrint | 0.5h | FR-007 AC-008 | - |
| 4.5.4 实现 PDF 导出 | 2h | FR-007 AC-008 | `test_export_pdf` |
| 4.5.5 实现 Excel 导出 | 2h | FR-007 AC-008 | `test_export_excel` |
| 4.5.6 导出功能测试 | 1h | FR-007 AC-008 | `tests/api/test_export.py` |

---

#### 4.6 分群对比分析

**功能说明**:

当访谈记录包含用户属性（角色、部门等）时，可按维度分组对比分析：

```python
# 分群维度（从 Interview 模型扩展）
class Interview(Base):
    # ... existing fields
    interviewee_role = Column(String(100))     # 角色：管理者/员工/客户
    interviewee_dept = Column(String(100))     # 部门
    interviewee_region = Column(String(50))    # 地区
```

**分群对比 API**:

```
GET /api/analysis/jobs/{job_id}/groups?dimension=role  # 按角色分组
GET /api/analysis/jobs/{job_id}/groups?dimension=dept  # 按部门分组
```

**分群对比报告**:

| 角色   | 满意度 | Top 关注主题       | 主要诉求       |
| ------ | ------ | ------------------ | -------------- |
| 管理者 | 7.5/10 | 流程效率、决策支持 | 简化审批流程   |
| 员工   | 6.8/10 | 工具体验、培训     | 提升工具稳定性 |
| 客户   | 7.2/10 | 产品质量、服务响应 | 加快问题处理   |

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.6.1 扩展 Interview 模型属性字段 | 1h | FR-007 AC-006 | `test_interview_attributes` |
| 4.6.2 实现分群统计函数 | 2h | FR-007 AC-006 | `test_group_statistics` |
| 4.6.3 实现分群对比 API | 1h | FR-007 AC-006 | `test_group_comparison_api` |
| 4.6.4 分群报告模板设计 | 1h | FR-007 AC-006 | `test_group_report_template` |
| 4.6.5 分群分析测试 | 1h | FR-007 AC-006 | `tests/services/test_group_analysis.py` |

---

### Phase 4 实现总结

**总工时估算**: ~40 小时（约 5 个工作日）

**关键技术点**:

1. LLM 批量分析：分批处理、Prompt 优化
2. 异步任务执行：后台队列、进度追踪
3. 数据模型设计：主题、观点、结果的存储结构
4. 报告生成：Markdown → PDF/Excel 转换

**性能考虑**:

- 1000 访谈分 20 批处理（每批 50）
- LLM 调用并行化（使用 asyncio）
- 分析结果缓存，增量更新

---

#### 4.7 原有导出功能（保留）

**任务列表**:
| 任务 | 预计工时 | 关联 AC | 测试用例 |
|------|----------|---------|----------|
| 4.7.1 PDF 导出优化 | 1h | FR-007 AC-008 | `test_export_pdf_optimized` |
| 4.7.2 Excel 导出优化 | 1h | FR-007 AC-008 | `test_export_excel_optimized` |

---

### Phase 5: 端到端验证

**目标**: 完整流程测试、性能验证

#### 5.1 测试与优化

**任务列表**:
| 任务 | 预计工时 | 验证目标 | 测试用例 |
|------|----------|----------|----------|
| 5.1.1 E2E 测试脚本 | 3h | 完整流程 | `tests/e2e/test_full_flow.py` |
| 5.1.2 钉钉集成测试 | 2h | 消息收发 | `tests/e2e/test_dingtalk_real.py` |
| 5.1.3 并发压力测试 | 3h | 100 并发 | `tests/performance/test_concurrent.py` |
| 5.1.4 性能瓶颈优化 | 4h | 响应时间 | - |
| 5.1.5 生产环境部署配置 | 2h | 稳定运行 | - |

---

## 3. 测试策略

### 3.1 测试金字塔

```
        ┌─────────────┐
        │   E2E Test  │  5-10 tests (关键流程)
        ├─────────────┤
        │ Integration │  30-50 tests (API + 服务)
        ├─────────────┤
        │    Unit     │  200+ tests (函数 + 类)
        └─────────────┘
```

### 3.2 测试覆盖率要求

| 模块            | 覆盖率要求 | 当前 |
| --------------- | ---------- | ---- |
| `src/core/`     | >= 85%     | ~80% |
| `src/services/` | >= 80%     | ~75% |
| `src/api/`      | >= 75%     | ~70% |
| `src/models/`   | >= 70%     | ~60% |

### 3.3 测试命令

```bash
# 单元测试
pytest tests/ -v

# 覆盖率报告
pytest --cov=src --cov-report=html --cov-fail-under=75

# 特定模块测试
pytest tests/core/test_graph.py -v

# E2E 测试 (需要环境配置)
pytest tests/e2e/ -v -m "not skip_ci"
```

---

## 4. 风险评估

### 4.1 技术风险

| 风险             | 概率 | 影响 | 缓解措施                           |
| ---------------- | ---- | ---- | ---------------------------------- |
| LLM 响应慢/失败  | 中   | 高   | 重试机制 (MAX_RETRIES=2)、降级方案 |
| 钉钉 API 限流    | 中   | 中   | 批量发送队列、速率控制 (10msg/s)   |
| 数据库连接池耗尽 | 低   | 高   | 连接池监控、自动扩容               |
| 语音识别错误     | 低   | 中   | 置信度阈值、人工确认提示           |

### 4.2 业务风险

| 风险             | 概率 | 影响 | 缓解措施                      |
| ---------------- | ---- | ---- | ----------------------------- |
| 用户不愿参与访谈 | 中   | 中   | 邀约文案优化、激励机制        |
| 访谈质量不佳     | 中   | 中   | Prompt 持续优化、追问策略调优 |
| 数据隐私问题     | 低   | 高   | 匿名化处理、数据加密          |

---

## 5. 里程碑与时间线

| 里程碑           | 预计完成  | 交付物                      | 关联 Phase |
| ---------------- | --------- | --------------------------- | ---------- |
| M1: 核心功能就绪 | ✅ 已完成 | FR-001~004 基础功能         | Phase 1    |
| M1.5: 功能完善   | +3 天     | 遗留 AC 补全                | Phase 1.5  |
| M2: 计划管理上线 | +1 周     | FR-005, FR-006              | Phase 2    |
| M3: 邀约推送上线 | +1.5 周   | 主动邀约、定时提醒          | Phase 3    |
| M4: 统计分析上线 | +2.5 周   | FR-007 (1000+ 访谈分析能力) | Phase 4    |
| M5: 生产就绪     | +3 周     | E2E 测试、性能优化          | Phase 5    |

**Phase 4 详细里程碑**:

| 子里程碑          | 预计工时 | 交付物                                 |
| ----------------- | -------- | -------------------------------------- |
| M4.1 数据层就绪   | 6h       | AnalysisJob/Topic/KeyPoint/Result 模型 |
| M4.2 分析服务就绪 | 14h      | AnalysisService 核心实现               |
| M4.3 API 就绪     | 10h      | 7 个分析 API 端点                      |
| M4.4 报告导出就绪 | 8.5h     | Markdown 报告 + PDF/Excel              |
| M4.5 分群分析就绪 | 6h       | 分群对比功能                           |

---

## 6. 依赖与资源

### 6.1 外部依赖

| 依赖         | 用途     | 环境变量                                                       |
| ------------ | -------- | -------------------------------------------------------------- |
| LLM 服务     | 对话生成 | `LLM_API_KEY`, `LLM_API_BASE`, `LLM_MODEL`                     |
| 钉钉开放平台 | 消息收发 | `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, `DINGTALK_AGENT_ID` |
| PostgreSQL   | 数据存储 | `DATABASE_URL`                                                 |

### 6.2 开发资源

| 资源     | 说明                        |
| -------- | --------------------------- |
| 开发环境 | Python 3.11+, PostgreSQL 15 |
| 测试环境 | Docker Compose              |
| 生产环境 | 云服务器 + PostgreSQL       |

---

## 7. 历史计划参考

> 以下计划文档在项目初期创建，描述了完整的需求分析和架构设计。当前实现基于这些计划逐步完成。

### 7.1 原始需求摘要

来源: `docs/plans/2026-03-07-interview-robot-requirements.md`

**核心需求**:

- 访谈对象：内部员工 + 外部客户
- 访谈时长：约15分钟
- 访谈主题：质量满意度调查（可自定义）
- 输出形式：Markdown 格式报告

**交互模式**:

- **异步消息式访谈**：机器人发送邀请，被访谈者可碎片化回答
- 支持文本 + 语音输入
- 长期会话：可跨越多天完成

**功能优先级** (原始):

| 优先级 | 功能           | 状态        |
| ------ | -------------- | ----------- |
| 1      | AI智能追问     | ✅ 已实现   |
| 2      | 多轮上下文记忆 | ✅ 已实现   |
| 3      | 语音输入       | ✅ 已实现   |
| 4      | 问卷模板管理   | ✅ 基础实现 |
| 5      | 自动生成报告   | ✅ 已实现   |
| 6      | 批量发送       | ⬜ 待开发   |

### 7.2 原始架构设计

来源: `docs/plans/2026-03-07-interview-robot-architecture.md`

**四层架构** (已实现):

```
┌─────────────────────────────────────────────────────────────────┐
│                        接入层 (Access Layer)                     │
│  消息接收(Webhook) │ 消息发送(API) │ 语音消息(ASR)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    应用服务层 (Application Layer)                 │
│  钉钉机器人适配器 │ LangGraph对话引擎 │ 状态管理                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐         │
│  │ planning │→│interviewing│→│analyzing │→│completed│         │
│  └──────────┘  └───────────┘  └──────────┘  └────────┘         │
│       ↑            │                                            │
│       └────────────┘ (followup loop)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     AI服务层 (AI Service Layer)                  │
│  主对话模型 │ 追问判定模型 │ 报告生成模型 │ 语音识别(Fun-ASR)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    数据存储层 (Storage Layer)                    │
│  PostgreSQL(会话状态) │ JSON(访谈模板) │ Markdown(分析报告)      │
└─────────────────────────────────────────────────────────────────┘
```

**核心流程设计** (已实现):

1. **访谈发起流程**: 配置模板 → 发送邀请 → 用户点击 → 加载模板生成首个问题
2. **对话执行流程**: 用户回答 → ASR转文字 → 存入上下文 → 追问判定 → 下一步
3. **报告生成流程**: 所有话题完成 → 调用报告模型 → 生成Markdown → 保存存储

### 7.3 智能追问设计

**追问类型** (已实现):

| 类型                 | 触发条件           | 示例                                               |
| -------------------- | ------------------ | -------------------------------------------------- |
| clarification (澄清) | 回答模糊或不具体   | "您刚才提到的'一些问题'能具体说说吗？"             |
| deep (深度)          | 回答有深度挖掘价值 | "您提到质量有提升空间，能举个例子说明吗？"         |
| validation (验证)    | 回答前后不一致     | "您前面说A产品好，现在说有问题，能详细解释吗？"    |
| expansion (扩展)     | 回答涉及新话题     | "您提到服务态度好，这在您选择供应商时占多大比重？" |

**领域限定方式** (已实现):

1. System Prompt 限定：明确告知 LLM 只在特定领域内追问
2. 模板化配置：预设该领域常见问题类型和追问模式
3. 可选 RAG 增强：提供专业背景知识

### 7.4 原始实施计划

来源: `docs/plans/2026-03-07-interview-robot-implementation.md`

**第一阶段** (已完成):

- [x] Task 1: 创建项目结构
- [x] Task 2: 配置数据库和基础模型
- [x] Task 3: 钉钉 Webhook 接收服务
- [x] Task 4: 钉钉消息发送功能
- [x] Task 5: LangGraph 基础框架
- [x] Task 6: 通义千问 LLM 服务
- [x] Task 7: 智能追问功能
- [x] Task 8: Fun-ASR 语音识别
- [x] Task 9: 自动生成 Markdown 报告
- [x] Task 10: 访谈模板管理
- [x] Task 11: 端到端集成测试

---

## 8. 变更记录

| 日期       | 版本 | 变更内容                                                                                                                                                | 作者                   |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 2026-03-07 | 0.1  | 创建原始需求和架构设计文档                                                                                                                              | AI Agent (superpowers) |
| 2026-03-07 | 0.2  | 创建详细实施计划 (11 Tasks)                                                                                                                             | AI Agent (superpowers) |
| 2026-03-29 | 1.0  | 初始化 SDD 实现计划                                                                                                                                     | AI Agent               |
| 2026-03-29 | 2.0  | 细化任务拆分、关联规格、补充测试策略                                                                                                                    | AI Agent               |
| 2026-03-29 | 2.1  | 整合历史计划文档，增加追溯性                                                                                                                            | AI Agent               |
| 2026-03-29 | 3.0  | **Phase 4 统计分析详细设计**: 新增 4 个数据模型、AnalysisService、LLM Prompt 模板、7 个 API 端点、PDF/Excel 导出、分群对比分析；支持 1000+ 访谈批量分析 | AI Agent               |
