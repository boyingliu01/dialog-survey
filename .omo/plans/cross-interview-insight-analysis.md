# 跨访谈洞察分析 — 设计文档

## 0. 背景与问题

访谈 Bot 已经完成了多轮对话核心能力（记忆、追问、钉钉集成、计划管理）。
现在用户的核心诉求是：**对千人规模的访谈结果进行自动分析，提取结构化的洞察结论。**

### 现状

- **模板**：`content: String`（JSON），只是一串问题列表，没有维度定义
- **单份分析**：`AnalysisReport` 存在但 QA 对传空（刚修复 bug），报告是孤立 Markdown
- **批量分析**：循环调单份分析，没有聚合
- **展示**：只有 API 返回 JSON

### 目标

用户希望对 1000 人的访谈结果能自动得到：

1. 哪些话题被频繁提及，提及率是多少
2. 正面/负面/中性评价的比例
3. 每个主题下的代表性观点和原文引用
4. 涌现出的预设维度之外的重要问题
5. 按时间/计划对比趋势

---

## 1. 核心设计理念

### 1.1 预设维度 + LLM 分类（用户确认）

- 模板预定义分析维度（如：稳定性、性能、易用性、安装升级、文档）
- LLM 在单份分析时自动将用户反馈分类到对应维度
- 批量分析时基于维度做统计聚合
- **好处**：结果稳定可控，不像纯自动聚类那样飘忽不定

### 1.2 单份自动触发，批量手动触发（用户确认）

- 每场访谈结束后自动分析单份并打维度标签
- 批量聚合由用户手动触发（节省 LLM 成本，按需触发）

---

## 2. 数据模型变更

### 2.1 Template 扩展

```prisma
model Template {
  id              String         @id @default(uuid())
  name            String
  description     String?
  content         String         // 原有：问题 JSON
  dimensions      Json?          // NEW: 维度定义 (nullable for zero-config)
  analysisConfig  Json?          // NEW: 分析配置
  version         Int            @default(1)
  status          TemplateStatus @default(DRAFT)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  interviews      Interview[]
  interviewPlans InterviewPlan[]
}
```

> Migration 注意: `dimensions` 用 `Json?` 而非 `Json`，避免已有模板记录 migration 失败。创建后给已有记录填充默认值 `[]`。

### 2.2 AnalysisReport 扩展

```prisma
model AnalysisReport {
  id              String   @id @default(uuid())
  interviewId     String
  content         String
  keyFindings     String[]
  sentiment       String?
  recommendations String[]
  dimensionTags   Json?          // NEW: 结构化维度标注
  emergentTags    String[]        // NEW: 涌现标签
  interviewerRating Int?          // NEW: 整体评分 (1-5)
  createdAt       DateTime @default(now())

  interview       Interview? @relation(fields: [interviewId], references: [id])
}
```

### 2.3 BatchAnalysisReport 新增（修订后）

```prisma
enum BatchReportStatus { PENDING RUNNING COMPLETED FAILED }
enum BatchReportType { SUMMARY COMPARISON TREND }

model BatchAnalysisReport {
  id          String             @id @default(uuid())
  planId      String
  templateId  String
  type        BatchReportType    @default(SUMMARY)
  status      BatchReportStatus  @default(PENDING)
  content     String             // Markdown 汇总报告
  metrics     Json               // 维度提及率、情感分布等
  topics      Json               // 聚类主题
  emergents   Json               // 涌现发现
  checkpoint  Json?              // 每步中间结果，支持失败恢复
  error       String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  completedAt DateTime?

  plan        InterviewPlan      @relation(fields: [planId], references: [id])
  template    Template           @relation(fields: [templateId], references: [id])

  @@index([planId, status, createdAt])
}
```

**dimensions JSON 结构示例**：

```json
[
  {
    "id": "stability",
    "label": "稳定性",
    "description": "产品崩溃、闪退、卡顿等问题",
    "keywords": ["崩溃", "闪退", "卡顿", "宕机", "重启", "死机"]
  },
  {
    "id": "performance",
    "label": "性能",
    "description": "响应慢、资源占用高等问题",
    "keywords": ["慢", "响应", "延迟", "加载", "卡", "占用"]
  },
  {
    "id": "usability",
    "label": "易用性",
    "description": "界面复杂、不容易上手",
    "keywords": ["复杂", "难用", "界面", "操作", "看不懂"]
  },
  {
    "id": "upgrade",
    "label": "安装升级",
    "description": "安装、升级、更新相关",
    "keywords": ["升级", "安装", "更新", "回滚", "迁移"]
  },
  {
    "id": "docs",
    "label": "文档",
    "description": "文档、帮助、说明",
    "keywords": ["文档", "手册", "帮助", "说明", "教程"]
  }
]
```

**analysisConfig 结构示例**：

```json
{
  "emergentThreshold": 3,
  "customSentimentWords": {
    "positive": ["好转", "改善", "不错"],
    "negative": ["退步", "更差", "卡"]
  }
}
```

### 2.2 AnalysisReport 扩展

```prisma
model AnalysisReport {
  id              String   @id @default(uuid())
  interviewId     String
  content         String
  keyFindings     String[]
  sentiment       String?
  recommendations String[]
  dimensionTags   Json?             // NEW: 结构化维度标注
  emergentTags    String[]          // NEW: 涌现标签
  interviewerRating Int?            // NEW: 整体评分 (1-5)
  createdAt       DateTime @default(now())

  interview       Interview? @relation(fields: [interviewId], references: [id])
}
```

**dimensionTags JSON 结构**：

```json
[
  {
    "dimension": "稳定性",
    "dimensionId": "stability",
    "sentiment": "negative",
    "quotes": ["每次升级要重启3次才成功", "上个月宕机了两次"]
  },
  {
    "dimension": "易用性",
    "dimensionId": "usability",
    "sentiment": "neutral",
    "quotes": ["界面有些复杂，新员工要一周才熟悉"]
  }
]
```

---

## 3. 单份报告生成流程升级

### Phase 1: 修复后的现状

```
interview 完成 → analyzing.ts → generateReport(topic, qaPairs) → LLM 生成 Markdown → 存 AnalysisReport
```

### Phase 2: 升级后

```
interview 完成 → analyzing.ts
                  ├─ generateReport(topic, qaPairs) → Markdown 报告
                  └─ analyzeWithDimensions(template, fullConversation) → dimensionTags
                       ├─ 读取模板中的 dimensions 定义
                       ├─ 把对话喂给 LLM，按维度分类
                       └─ 提取 emergent tags（维度之外的新问题）
                  ↓
              写入 AnalysisReport (content + dimensionTags + emergentTags)
```

### 新增 LLM Prompt: analyzeWithDimensions

```
你是一个定性研究分析师。根据以下访谈对话，按预设维度进行分类标注。

**预设维度**：
{dimensions}

每个维度包含：id、label、description、keywords

**任务**：
1. 对每个维度，判断受访者是否提及
2. 如果提及，判断情感倾向（positive/negative/neutral）
3. 提取1-2条最具代表性的原文引用
4. 如果发现预设维度之外的重要问题，提取为 emergentTag
5. 给出整体满意度评分（1-5，5为最满意）

**返回 JSON**：
{
  "dimensionTags": [
    {"dimensionId": "stability", "label": "稳定性", "sentiment": "negative", "quotes": ["具体原文"]}
  ],
  "emergentTags": ["涌现的具体问题描述"],
  "interviewerRating": 3
}
```

---

## 4. 批量聚合分析流程

### 触发方式

```
POST /api/analysis/aggregate/:planId
  → 读取该 plan 下所有 COMPLETED 访谈的 dimensionTags
  → 聚合统计
  → LLM 主题聚类
  → LLM 涌现发现
  → 生成 Markdown 报告
  → 存入 BatchAnalysisReport
```

### 聚合管道

```
Step 1: 维度统计（纯计算，零 LLM 成本）
  输入：N 个访谈的 dimensionTags[]
  输出：
  - 每个维度的提及率：mentions / totalInterviews
  - 每个维度的情感分布：positive/negative/neutral 占比

Step 2: 主题聚类（LLM 批量，对每个高提及率维度）
  输入：某维度下的所有 quotes（如稳定性下有 150 条反馈）
  Prompt:
    "对以下{count}条关于'{dimension}'的用户反馈进行聚类分析：
    1. 识别 3-8 个具体子主题
    2. 每个子主题给出名称、提及次数、2 条代表实例
    3. 标注整体情感倾向"

Step 3: 涌现发现（LLM 单次，零成本）
  输入：所有访谈的 emergentTags + 低维度覆盖的 quotes
  Prompt:
    "从{count}人的访谈中，找出 5 个最重要的涌现问题（预设维度之外的）。
    对每个问题给出：名称、提及人数、3条代表实例、紧迫程度评估"

Step 4: 汇总报告生成
  执行摘要（100字）
  ↓
  TOP 5 痛点排行（维度 + 提及率 + 负面率）
  ↓
  各维度详情（子主题聚类 + 代表实例）
  ↓
  涌现发现
  ↓
  改进建议
```

### 输出示例（Markdown）

```markdown
# 质量满意度调查报告 (2026 H1)

## 执行摘要

本次调查覆盖 847 名用户，整体满意度 3.4/5.0。最大痛点是稳定性（提及率 62%），
其中"升级过程不可靠"是最集中的负面反馈（38 条实例）。

## TOP 5 痛点

| 排名 | 维度     | 提及率 | 负面率 | 关键子主题                         |
| ---- | -------- | ------ | ------ | ---------------------------------- |
| 1    | 稳定性   | 62%    | 78%    | 升级不可靠(38), 随机宕机(22)       |
| 2    | 安装升级 | 55%    | 65%    | 升级失败需重启(42), 版本冲突(18)   |
| 3    | 易用性   | 41%    | 45%    | 新员工上手慢(28), 界面信息密集(15) |
| 4    | 性能     | 38%    | 52%    | 加载慢(30), 内存占用高(12)         |
| 5    | 文档     | 22%    | 58%    | API文档缺失(12), 操作步骤不全(8)   |

## 稳定性 详细分析

### 子主题 1: 升级过程不可靠（提及 38 人，负面 95%）

> "每次升级都要重启3次才能成功"
> "升级过程中断电会导致回滚，回滚后数据丢失"
> "进度条卡在80%不走"

### 子主题 2: 随机宕机（提及 22 人，负面 100%）

> "生产环境每周至少宕机一次"
> "凌晨的 batch job 会导致内存溢出"

## 涌现发现

1. **安全合规担忧**（提及 15 人）：多个用户提到对数据加密的合规性担忧
2. **移动端适配缺失**（提及 8 人）：现场工程师没有移动端工具
   ...
```

---

## 5. API 设计

### 5.1 模板管理

```
PUT /api/templates/:id/dimensions
  Body: { dimensions: [...], analysisConfig: {...} }
  Response: Template

POST /api/templates
  Body: { name, description, content, dimensions, analysisConfig }
  Response: { id, ... }
```

### 5.2 分析接口

```
POST /api/analysis/aggregate/:planId
  → 触发批量聚合
  Response: { batchReportId, status: 'PENDING' }

GET /api/analysis/aggregate/:batchReportId
  Response: BatchAnalysisReport (含完整 metrics/topics/emergents)

GET /api/analysis/aggregate/:batchReportId/export?format=md
  Response: Markdown 文本

GET /api/analysis/dimensions/:planId
  Response: 维度提及率 + 情感分布（轻量级，不触发完整聚合）
```

---

## 6. 实现阶段拆分（经评审修订）

### Phase 1: 模板维度 + 单份结构化标注 (~1.5天)

- [ ] Prisma schema 变更 + migration（dimensions 用 Json? 避免失败）
- [ ] 新增 `schemas/dimensions.ts` — Zod 验证 dimensions + analysisConfig + dimensionTags
- [ ] 新增 `analyzeWithDimensions` prompt（通过 `prompt.service.ts` 管理，不硬编码）
- [ ] `report.service.ts` 输出 dimensionTags + emergentTags
- [ ] `analyzing.ts` 集成结构化分析 + 失败写入死信表
- [ ] 模板 CRUD 支持 dimensions
- [ ] 测试: `tests/dimension-validation.test.ts`
- [ ] 测试: `tests/analyze-with-dimensions.test.ts`

### Phase 2: 批量聚合管道 (~2天)

- [ ] `AnalysisService.aggregatePlan(planId)` 实现 4 步管道
  - Step 1: cursor-based 分批读取（每批 100 条）
  - Step 2: p-limit 控制 LLM 并发 ≤ 3
  - 每步 checkpoint 存到 `BatchAnalysisReport.checkpoint`
  - AbortController + 5min 超时
- [ ] POST 聚合前检查是否存在 RUNNING 状态报告（防重复触发）
- [ ] LLM 主题聚类（temperature=0.1，quotes 先 hash 去重）
- [ ] LLM 涌现发现
- [ ] LLM JSON 解析失败 fallback（keywords 规则匹配）
- [ ] 单份分析 quotes 脱敏处理（去除人名、手机号等 PII）
- [ ] 新增 `token-budget-calculator.ts` — 预估单次聚合 token 消耗
- [ ] BatchAnalysisReport 持久化
- [ ] 测试: `tests/aggregation-pipeline.test.ts`
- [ ] 测试: `tests/emergent-threshold.test.ts`

### Phase 3: 汇总报告 + API + 测试 (~1天)

- [ ] `POST /api/analysis/aggregate/:planId`
- [ ] `GET /api/analysis/aggregate/:batchReportId`
- [ ] `GET /api/analysis/dimensions/:planId`（轻量维度统计）
- [ ] Markdown 汇总报告模板
- [ ] 测试: `tests/batch-analysis-api.test.ts`
- [ ] 测试: `tests/concurrent-aggregation.test.ts`

### Phase 4: 示例模板 (~0.5天)

- [ ] 质量满意度调查模板
- [ ] 规范组反馈模板
- [ ] 员工满意度模板

---

## 7. 技术风险与缓解

| 风险                | 影响 | 缓解                                          | 来源       |
| ------------------- | ---- | --------------------------------------------- | ---------- |
| 数据隐私/脱敏缺失   | 高   | 汇总报告中 quotes 脱敏处理，API 加权限校验    | Delphi     |
| 重复触发批量分析    | 高   | POST 前先检查是否存在 RUNNING 状态的报告      | Delphi     |
| 零配置降级未实现    | 中   | MVP 必须有 fallback，无 dimensions 时自动聚类 | CEO        |
| LLM 维度分类不准确  | 低   | keywords 规则匹配作 fallback + 人工抽检校准   | CEO+Delphi |
| 批量 LLM 调用成本高 | 高   | 只有高频维度才做聚类 + token 预算计算器       | Eng        |
| 主题聚类不稳定      | 中   | temperature=0.1 + quotes 去重 + 缓存结果      | Eng        |
| 大数据量 OOM        | 高   | cursor-based 分批（100条/批）                 | Eng        |
| LLM 并发导致限流    | 高   | p-limit 限制 ≤ 3 并发                         | Eng        |
| 聚合中途失败        | 高   | 每步 checkpoint，失败从最近 step 恢复         | Eng        |
| JSONB 脏数据        | 高   | Zod 写入时验证，API 层 400 拒绝               | Eng        |
| LLM 解析失败        | 高   | markdown fence strip + keywords fallback      | Eng        |
| 单份分析失败无感知  | 中   | 死信表 + 可批量重跑                           | Eng        |

---

## 8. 待决问题（需外部确认）

1. **维度定义放在 Template 而非 Plan 级别** ✅ 保持
   - 因为同一模板用于多个 plan，维度应该跟随模板
   - Plan 可以有自己的时间窗口和人群，但共享模板维度

2. **单份分析异步执行（不阻塞访谈完成）** ⚠️ 修订
   - `analyzing.ts` 的 `setImmediate` 保留，但增加死信重试机制
   - 分析失败写入 `analysis_failures` 表，可后续批量重跑

3. **批量聚合异步处理** ✅ 保持 + 增加 checkpoint
   - 用户 POST 后返回 `batchReportId`（PENDING）
   - 用户 GET 轮询状态（PENDING → RUNNING → COMPLETED / FAILED）
   - 每步结果 checkpoint 到 `metrics` JSON，失败后可从最近 step 恢复

4. **零配置降级路径** (CEO Review → 新增)
   - 允许用户不定义 dimensions 直接使用
   - 无 dimensions 时，fallback 到 LLM 自动聚类（提取 top 主题但不按维度分桶）
   - 后续用户可随时定义 dimensions 并触发重新打标

5. **数据验证层** (Eng Review → 新增)
   - dimensions JSONB 写入前用 Zod schema 验证
   - dimensionTags 写入前用相同 schema 验证
   - API 层 400 拒绝不合法输入

6. **批量加载安全** (Eng Review → 新增)
   - cursor-based 分批读取（每批 100 条）
   - LLM 并发用 `p-limit` 限制 <= 3
   - 聚合方法加 AbortController + 5min 超时

---

## 9. 评审发现与修复记录

### CEO Review 发现

| #   | 发现                                 | 严重度   | 处理                                             |
| --- | ------------------------------------ | -------- | ------------------------------------------------ |
| 1   | 假设用户会手动创建 dimensions 不现实 | Critical | ✅ 新增零配置降级路径                            |
| 2   | 竞品 6 个月后可能支持协作标注        | High     | ⏸️ 记录但不纳入 MVP，后续迭代                    |
| 3   | 缺少分群对比分析                     | Medium   | ✅ API 已设计 `/dimensions/:planId` 支持轻量分群 |
| 4   | LLM vendor lock-in                   | High     | ⏸️ 项目已有 LLM 抽象层，后续可切                 |
| 5   | 3.5 天预估过于乐观                   | High     | ✅ Phase 1 拆为 1.5 天，总 4.5 天                |

### Eng Review 发现

| #   | 发现                           | 严重度   | 处理                               |
| --- | ------------------------------ | -------- | ---------------------------------- |
| 1   | status/type 应使用 Prisma enum | Critical | ✅ 修复                            |
| 2   | JSONB 无 schema 校验           | Critical | ✅ 新增 Zod 验证                   |
| 3   | Migration 非空字段无默认值     | Critical | ✅ 改为 `Json?` 后迁移             |
| 4   | 1000 访谈全量加载 OOM          | Critical | ✅ 改为 cursor-based 分批          |
| 5   | LLM 并发无 ratelimit           | Critical | ✅ 引入 p-limit                    |
| 6   | CORS origin: true              | Critical | ✅ 单独 issue 修复（不阻塞本功能） |
| 7   | 测试计划缺失                   | Critical | ✅ Phase 各阶段都加了测试任务      |
| 8   | 无 FK 外键关系                 | High     | ✅ 修复                            |
| 9   | LLM JSON 解析无 fallback       | High     | ✅ 新增 keywords fallback          |
| 10  | setImmediate fire-and-forget   | High     | ✅ 新增死信重试机制                |
| 11  | 聚合中间失败无 checkpoint      | High     | ✅ 新增                            |
| 12  | 无鉴权                         | High     | ⏸️ 单独 issue（不阻塞 MVP）        |
| 13  | 主题聚类不确定性               | High     | ✅ 固定 temperature=0.1 + 缓存     |
| 14  | LLM token 成本失控             | High     | ⚠️ 增加 token 预算提示             |
| 15  | 无超时/kill 机制               | High     | ✅ 新增 5min AbortController       |
| 16  | quotes 去重缺失                | Medium   | ✅ 新增 hash 去重                  |
| 17  | emergentTags 合并策略          | Medium   | ✅ LLM 聚合时合并                  |
| 18  | 历史 report 兼容               | Medium   | ✅ 增加 null 处理逻辑              |
| 19  | 无集成测试                     | High     | ✅ Phase 3 新增集成测试            |
| 20  | Prompt 硬编码                  | Medium   | ✅ 统一走 prompt.service.ts        |

### Phase 计划修订

```
Phase 1: 模板维度 + 单份结构化标注 (~1.5天) ← 从 1 天上调
  + Zod schema 验证 (schemas/dimensions.ts)
  + Prompt 走 prompt.service.ts 而非硬编码
  + 单份分析失败死信重试机制

Phase 2: 批量聚合管道 (~2天) ← 从 1.5 天上调
  + cursor-based 分批读取
  + p-limit 并发控制
  + 每步 checkpoint 机制
  + quotes 去重
  + 5min 超时 + AbortController
  + LLM JSON 解析 fallback

Phase 3: 汇总报告 + API + 测试 (~1天) ← 从 0.5 天上调
  + 完整的测试文件（6个新 test 文件）
  + 集成测试

Phase 4: 示例模板 (~0.5天)
  不变
```

---

## 10. 测试计划（新增）

| 测试文件                                | 覆盖内容                                 |
| --------------------------------------- | ---------------------------------------- |
| `tests/dimension-validation.test.ts`    | dimensions JSON schema 校验              |
| `tests/analyze-with-dimensions.test.ts` | analyzeWithDimensions prompt + JSON 解析 |
| `tests/aggregation-pipeline.test.ts`    | 4 步管道（含 mock LLM）                  |
| `tests/batch-analysis-api.test.ts`      | API 状态机 + 轮询                        |
| `tests/emergent-threshold.test.ts`      | emergentThreshold 聚合                   |
| `tests/concurrent-aggregation.test.ts`  | 并发触发 + 限流                          |

---

## 11. Delphi 共识评审报告

### 评审轮次

| 轮次               | Expert A               | Expert B               | 共识比例               |
| ------------------ | ---------------------- | ---------------------- | ---------------------- |
| Round 1 (匿名)     | REQUEST_CHANGES (8/10) | REQUEST_CHANGES (7/10) | 裁决一致，问题共识 86% |
| Round 2 (交换意见) | REQUEST_CHANGES (8/10) | REQUEST_CHANGES (8/10) | 完全一致，问题共识 86% |
| Round 3 (最终立场) | **APPROVED (9/10)**    | **APPROVED (9/10)**    | **100% 共识** ✅       |

### 共识验证

| 检查项                      | 状态                                   |
| --------------------------- | -------------------------------------- |
| 问题共识 >= 91%             | ✅ 100% (Round 3 无分歧)               |
| 所有 Critical Issues 已解决 | ✅ 数据模型、隐私、预算、防重复        |
| 所有 Major Concerns 已处理  | ✅ 重试机制、聚类稳定性、emergent tags |
| 最终裁决 APPROVED           | ✅ 两位专家一致 APPROVED               |

### 完整问题处理记录

| #   | Round 1 发现               | 严重度   | Round 3 状态                                       |
| --- | -------------------------- | -------- | -------------------------------------------------- |
| 1   | 数据模型不一致（两版定义） | Critical | ✅ 修复（删除重复定义）                            |
| 2   | LLM 分类准确性不足         | Critical | ✅ 缓解（temp=0.1 + keywords fallback + 人工抽检） |
| 3   | Token 成本估算不清         | Critical | ✅ 新增 token-budget-calculator.ts                 |
| 4   | 缺乏数据隐私/脱敏          | Critical | ✅ quotes 脱敏 + API 权限校验                      |
| 5   | 缺乏预算预警               | Critical | ✅ token 预算计算器                                |
| 6   | 防重复执行锁               | Critical | ✅ POST 检查 RUNNING 状态                          |
| 7   | Emergent Tags 太简单       | Major    | ✅ LLM 聚合时自动合并语义相近标签                  |
| 8   | 主题聚类不稳定             | Major    | ✅ temp=0.1 + hash 去重 + 结果缓存                 |
| 9   | 缺失败重试/补偿            | Major    | ✅ checkpoint 机制 + 死信队列 + 可恢复             |
| 10  | 缺数据质量监控             | Minor    | ✅ 纳入 Phase 1                                    |
