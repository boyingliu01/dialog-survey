# Smart Interview Response Design - 智能访谈回应设计 (v2)

> **版本**: v2 - Round 1 评审后修复版
> **修复日期**: 2026-04-15
> **修复内容**: 结构化输出、策略扩充、错误处理、追问限制

---

## 问题背景

### 当前问题

用户测试反馈：机器人直接跳到下一题，缺乏人情味。硬编码的 `NEGATIVE_EMOTION_PATTERNS` 正则无法穷举所有用户情绪表达。

### 测试日志分析

| 用户输入               | 期望回应              | 当前行为            |
| ---------------------- | --------------------- | ------------------- |
| "我不想谈，为什么要谈" | 共情+解释目的         | 追问（勉强正常）    |
| "你想干嘛？你要干嘛"   | 解释访谈目的          | ❌ 直接跳下一题     |
| "我为什么要告诉你"     | 共情+换话题           | ❌ 直接跳下一题     |
| "你是听不懂人话吗"     | 真诚道歉+询问是否继续 | ❌ 直接跳下一题     |
| "真无聊"               | 理解感受+调整节奏     | ✅ 结束访谈（正常） |

### 根因分析

当前架构是**三步独立判断**：

1. `isFollowupNeeded()` → YES/NO
2. `generateFollowup()` → 追问内容或 SKIP
3. `generateAcknowledgment()` → 确认消息

这三步各自独立，缺乏对用户情绪/意图的整体理解，导致回应机械。

---

## 设计方案：统一智能对话 Prompt

### 核心思路

**一次 LLM 调用完成"意图理解 + 策略选择 + 回应生成"，使用结构化 JSON 输出确保可靠性**

参考豆包、千问等主流聊天机器人：它们不是通过多次调用实现意图识别，而是通过精心设计的 Prompt，让 LLM 自然地"思考"用户状态后给出回应。

### ⚠️ 关键设计决策：结构化输出替代字符串标记

**Round 1 专家共识**：依赖 `[NEXT]/[END]` 字符串标记是高风险设计（3/3 专家一致）

**问题**：

- LLM 可能忘记加标记
- 标记位置可能错误
- 用户内容可能包含类似字符串（如"我想[END]这个话题"）

**解决方案**：使用 JSON 结构化输出

---

### 新 Prompt 设计

````text
你是一位温暖、专业的访谈主持人。你的目标是让被访者感到舒适、愿意分享。

**重要原则**：
- 不要机械地问问题，要像朋友聊天一样自然
- 用户情绪变化时，先回应情绪，再考虑访谈进度
- 宁可少问一个问题，也不要让用户感到被强迫

---

**对话历史**:
{{conversationHistory}}

**当前问题**: {{currentQuestion}}
**已追问次数**: {{followupCount}}/{{maxFollowups}}
**用户回答**: {{userAnswer}}

---

分析用户回答后，选择策略并生成回应。

**策略选择**（选择最匹配的一项）：
1. **认真回答** - 用户认真回答了问题 → 简短肯定 → 追问细节或过渡下一题
2. **敷衍回答** - 用户敷衍（如"嗯嗯"、"不知道"）→ 简短回应 → 换角度激发兴趣
3. **困惑不理解** - 用户不理解问题或访谈目的 → 解释目的 → 温柔引导
4. **拒绝不想答** - 用户拒绝回答此问题 → 表示理解 → 提议换话题或跳过
5. **不满情绪激动** - 用户表达不满/愤怒 → 真诚道歉共情 → 尊重用户选择
6. **要求结束** - 用户想结束访谈 → 确认结束 → 感谢参与
7. **要求跳过** - 用户想跳过此题 → 同意跳过 → 直接进入下一题
8. **质疑测试边界** - 用户质疑访谈者能力或测试边界 → 温和重申角色 → 保持专业
9. **转移话题** - 用户转移话题但不想结束 → 温和引导回主题 或 接受转移

**行动决策**：
- `NEXT`: 用户回答充分，应该进入下一个问题
- `FOLLOWUP`: 需要追问细节（注意：已追问次数不能超过上限）
- `END`: 用户明确想结束访谈
- `STAY`: 其他情况，继续当前话题

---

**输出格式**（必须严格按JSON格式返回，不要输出其他内容）：

```json
{
  "thinking": "简短分析用户意图和情绪（10-20字）",
  "strategy": "选择的策略编号（1-9）",
  "action": "NEXT | FOLLOWUP | END | STAY",
  "response": "你的回应内容（50-100字，温暖自然）"
}
````

**示例输出**：

```json
{
  "thinking": "用户质疑访谈目的，情绪困惑",
  "strategy": "3",
  "action": "STAY",
  "response": "理解您的疑惑。这个访谈是想了解您的工作经历，帮助我们更好地理解您的专业背景。如果您不太想聊这个，我们可以换个话题？"
}
```

````

---

### JSON 解析与校验

```typescript
interface StructuredResponse {
  thinking: string;      // LLM的思考过程
  strategy: number;      // 选择的策略(1-9)
  action: "NEXT" | "FOLLOWUP" | "END" | "STAY";
  response: string;      // 回应内容
}

function parseLLMResponse(rawContent: string): StructuredResponse | null {
  try {
    // 尝试提取JSON（可能被markdown包裹）
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in LLM response', { rawContent });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 校验必要字段
    if (!parsed.action || !parsed.response) {
      logger.error('Missing required fields', { parsed });
      return null;
    }

    // 校验action值
    const validActions = ["NEXT", "FOLLOWUP", "END", "STAY"];
    if (!validActions.includes(parsed.action)) {
      logger.warn('Invalid action, fallback to STAY', { action: parsed.action });
      parsed.action = "STAY";
    }

    return parsed as StructuredResponse;
  } catch (e) {
    logger.error('Failed to parse LLM response', { error: e });
    return null;
  }
}
````

---

### 错误处理与降级策略

```typescript
const FALLBACK_RESPONSE = "感谢您的回答，我们继续下一个话题。";

export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
): Promise<SmartResponseResult> {
  const conversationHistory = buildConversationHistory(state);
  const prompt = promptService.render("generateSmartResponse", {
    conversationHistory,
    currentQuestion,
    followupCount: state.followupCount,
    maxFollowups: state.maxFollowups,
    userAnswer,
  });

  try {
    const llm = VolcengineLLM.fromEnv();
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
      }),
    );

    const parsed = parseLLMResponse(response.content);

    if (!parsed) {
      // 降级：解析失败时默认进入下一题
      logger.warn("LLM parse failed, using fallback");
      return {
        response: FALLBACK_RESPONSE,
        action: "NEXT",
        shouldProceedToNext: true,
        shouldEndInterview: false,
      };
    }

    // 追问次数限制检查
    let action = parsed.action;
    if (action === "FOLLOWUP" && state.followupCount >= state.maxFollowups) {
      logger.info("Followup limit reached, forcing NEXT");
      action = "NEXT";
    }

    return {
      response: parsed.response,
      action: action,
      shouldProceedToNext: action === "NEXT",
      shouldEndInterview: action === "END",
    };
  } catch (e) {
    logger.error("LLM call failed", { error: e });
    // 降级：LLM调用失败时默认进入下一题
    return {
      response: FALLBACK_RESPONSE,
      action: "NEXT",
      shouldProceedToNext: true,
      shouldEndInterview: false,
    };
  }
}
```

---

### 对话历史构建（智能截断）

```typescript
function buildConversationHistory(state: InterviewState): string {
  // 保留最近10条消息
  const recentMessages = state.messages.slice(-10);

  // 智能截断：在句子边界截断，保留完整语义
  const formatMessage = (m: Message): string => {
    const role = m.role === "user" ? "用户" : "主持人";
    const content = smartTruncate(m.content, 150);
    return `${role}: ${content}`;
  };

  return recentMessages.map(formatMessage).join("\n\n");
}

function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // 在句子边界截断
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf("？"),
    truncated.lastIndexOf("！"),
    truncated.lastIndexOf("."),
  );

  if (lastSentenceEnd > maxLength * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1) + "...";
  }

  return truncated + "...";
}
```

**对话历史长度依据**：

- 访谈平均轮次：约5-8轮（每题1-2轮对话）
- 10条消息覆盖约2个完整问题的对话上下文
- Token估算：10条 × 150字符 ≈ 1500字符 ≈ 500 tokens（中文）
- 总Prompt约1000-1200 tokens，在模型预算内

---

### 追问次数限制机制

```typescript
interface SmartResponseResult {
  response: string;
  action: "NEXT" | "FOLLOWUP" | "END" | "STAY";
  shouldProceedToNext: boolean;
  shouldEndInterview: boolean;
}

// interviewing.ts 中的追问计数逻辑
export async function interviewingNode(
  state: InterviewState,
  input: { content: string },
): Promise<Partial<InterviewState> & NodeOutput> {
  const result = await generateSmartResponse(
    state,
    input.content,
    currentQuestion,
  );

  // 追问次数递增（仅在 FOLLOWUP 时）
  const newFollowupCount =
    result.action === "FOLLOWUP"
      ? state.followupCount + 1
      : state.followupCount;

  // 追问上限检查已在 generateSmartResponse 内部处理
  // 这里是二次确认（防御性编程）
  if (newFollowupCount > state.maxFollowups) {
    logger.warn("Followup overflow detected", {
      count: newFollowupCount,
      max: state.maxFollowups,
    });
    // 强制进入下一题
    return {
      responses: [
        ...state.responses,
        { questionId: `q${currentQ}`, content: input.content },
      ],
      currentQuestion: currentQ + 1,
      shouldContinue: !!template.questions[currentQ + 1],
      response: result.response,
    };
  }

  // 正常流程
  return {
    responses: [
      ...state.responses,
      {
        questionId: `q${currentQ}`,
        content: input.content,
        isFollowup: result.action === "FOLLOWUP",
      },
    ],
    followupCount: newFollowupCount,
    currentQuestion: result.action === "NEXT" ? currentQ + 1 : currentQ,
    shouldContinue: result.action !== "END",
    response: result.response,
  };
}
```

---

## 预期效果对比

| 场景                     | 当前行为         | 新设计预期                         |
| ------------------------ | ---------------- | ---------------------------------- |
| 用户认真回答             | 跳到下一题或追问 | 肯定回答后自然过渡，可能追问细节   |
| 用户敷衍"嗯嗯"           | 跳到下一题       | 简短回应后换角度激发兴趣           |
| 用户困惑"为什么要问这个" | ❌ 跳下一题      | 解释访谈目的，温柔引导             |
| 用户拒绝"我不想回答"     | ❌ 跳下一题      | "理解，我们可以换个话题"           |
| 用户不满"真烦"           | ❌ 跳下一题      | "抱歉让您感到不舒服，您想继续吗？" |
| 用户跳过"跳过这题"       | ❌ 无处理        | "好的，我们跳到下一个问题"         |
| 用户质疑"你能听懂吗"     | ❌ 跳下一题      | "抱歉，我重新解释一下这个问题..."  |

---

## 成本分析

### LLM 调用次数对比

| 场景       | 当前                                                 | 新设计 |
| ---------- | ---------------------------------------------------- | ------ |
| 需要追问   | 2次（isFollowupNeeded + generateFollowup）           | 1次    |
| 不需要追问 | 2次（isFollowupNeeded + 可能generateAcknowledgment） | 1次    |
| 需要共情   | 2-3次                                                | 1次    |

### Token 消耗估算

| 项目             | 估算             |
| ---------------- | ---------------- |
| Prompt模板       | ~400 tokens      |
| 对话历史(10条)   | ~500 tokens      |
| 用户回答         | ~50-100 tokens   |
| **输入总计**     | ~950-1000 tokens |
| LLM输出(JSON)    | ~100-150 tokens  |
| **单次调用总计** | ~1100 tokens     |

**对比旧方案**：

- 旧方案3次调用：3 × 500 = 1500 tokens（保守估计）
- 新方案1次调用：~1100 tokens
- **节省约27% token消耗**

---

## 风险与缓解

| 风险         | 影响           | 缓解措施                          |
| ------------ | -------------- | --------------------------------- |
| JSON解析失败 | 动作判断错误   | 降级策略：默认NEXT进入下一题      |
| LLM调用失败  | 无法生成回应   | 降级策略：返回固定回应并继续      |
| 追问次数溢出 | 无限追问       | 双重检查：Prompt限制 + 代码限制   |
| LLM理解错误  | 情绪判断失误   | Prompt强调"宁可不问也要尊重用户"  |
| 策略分类遗漏 | 某些意图无匹配 | 9种策略覆盖主流场景，STAY作为兜底 |

---

## 实现步骤

1. 新增 `prompt.service.ts` 的 `generateSmartResponse` 模板（JSON输出）
2. 新增 `followup.service.ts` 的 `generateSmartResponse` 函数
3. 新增 `parseLLMResponse` JSON解析与校验函数
4. 重构 `interviewing.ts` 使用新函数
5. 移除旧的 `NEGATIVE_EMOTION_PATTERNS` 硬编码逻辑
6. 增加 `smartTruncate` 智能截断函数
7. 测试验证（单元测试 + 真实场景测试）

---

## 评审状态

### Round 1 结果

| 专家     | 裁决            | 置信度 | 核心关切                                   |
| -------- | --------------- | ------ | ------------------------------------------ |
| Expert A | REQUEST_CHANGES | 7/10   | `[NEXT]/[END]`标记不可靠，追问次数限制缺失 |
| Expert B | REQUEST_CHANGES | 7/10   | 标记方案脆弱，"内心思考"指令不可靠         |
| Expert C | REQUEST_CHANGES | 7/10   | 结构化输出替代字符串标记，缺少错误处理     |

### Round 1 共识问题

**Critical Issues（3/3专家一致）**：

1. `[NEXT]/[END]`字符串标记不可靠 → ✅ 已修复：改用JSON结构化输出
2. 策略分类不完整 → ✅ 已修复：扩充至9种策略

**Major Concerns**：

1. 追问次数限制未说明 → ✅ 已修复：明确双重检查机制
2. 错误处理缺失 → ✅ 已修复：增加降级策略
3. 对话历史截断简单 → ✅ 已修复：智能截断保留语义
4. "内心思考"指令不可靠 → ✅ 已修复：改为显式thinking字段

---

**Round 2 评审待启动**
