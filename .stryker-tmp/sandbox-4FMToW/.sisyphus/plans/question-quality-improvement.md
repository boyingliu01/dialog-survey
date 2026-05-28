# Interview Question Quality Improvement - Minimum Viable Plan

## Problem Statement

用户反馈访谈问题生硬、转换不自然。日志显示：

- 问题过于简短（如"您是如何解决这个挑战的？"仅12字符）
- 话题转换无过渡，直接跳到下一个问题

## Root Cause

| 问题     | 位置                      | 根因                           |
| -------- | ------------------------- | ------------------------------ |
| 追问生硬 | `prompt.service.ts:20-29` | prompt只有当前问答，无对话历史 |
| 过渡生硬 | `interviewing.ts:49-55`   | 直接返回nextQuestion，无衔接   |

## Minimum Viable Solution

**只改3个文件，约20行代码**

### 改动1: prompt.service.ts - 扩充追问模板

```typescript
generateFollowup: {
  name: 'generateFollowup',
  template: `你是一位专业的访谈主持人，正在进行深度访谈。

**对话历史**:
{{conversationHistory}}

**当前问题**: {{question}}
**用户回答**: {{userAnswer}}

请根据对话历史，生成自然的下一步回应。

要求:
1. 承接用户回答的关键信息，不要偏离主题
2. 如用户回答充分，自然过渡到下一话题
3. 语言亲切，不要生硬
4. 如果需要追问，要有针对性

直接输出内容，不要其他说明。`,
  variables: ['conversationHistory', 'question', 'userAnswer'],
}
```

### 改动2: followup.service.ts - 接收对话历史

```typescript
export async function generateFollowup(
  question: string,
  userAnswer: string,
  conversationHistory: string, // 新增参数
): Promise<string | null> {
  // ...
  const prompt = promptService.render("generateFollowup", {
    question,
    userAnswer,
    conversationHistory, // 传给模板
  });
  // ...
}
```

### 改动3: interviewing.ts - 构建对话历史并传入

```typescript
// 在 interviewingNode 中，构建对话历史摘要
const conversationHistory = state.messages
  .slice(-6) // 最近6轮对话
  .map(
    (m) =>
      `${m.role === "user" ? "用户" : "主持人"}: ${m.content.substring(0, 50)}`,
  )
  .join("\n");

// 调用追问时传入
const followupQuestion = await generateFollowup(
  currentQuestion,
  input.content,
  conversationHistory,
);
```

## Implementation Sequence

| 顺序 | 改动             | 文件                |
| ---- | ---------------- | ------------------- |
| 1    | 更新 prompt 模板 | prompt.service.ts   |
| 2    | 修改函数签名     | followup.service.ts |
| 3    | 传入对话历史     | interviewing.ts     |

## Expected Outcome

| 指标       | 当前             | 目标                   |
| ---------- | ---------------- | ---------------------- |
| 追问自然度 | 单问答，无上下文 | 有对话历史，承接上下文 |
| 话题过渡   | 直接跳转         | 可以自然过渡           |
| 代码改动   | -                | ~20行，3文件           |

## Files to Modify

1. `src/services/prompt.service.ts` - 1处，替换模板
2. `src/services/followup.service.ts` - 1处，添加参数
3. `src/core/nodes/interviewing.ts` - 1处，传入对话历史

## Out of Scope (不包含)

以下内容不在最小方案中，后续可根据需要扩展：

- 话题追踪（topicsCovered）
- 重复问题检测
- 规则预筛选
- 过渡语生成
- 专门的测试用例

## Risk & Mitigation

| Risk            | Impact     | Mitigation                    |
| --------------- | ---------- | ----------------------------- |
| 对话历史过长    | token超限  | 限制取最近6条，每条截断50字符 |
| LLM输出格式变化 | 追问变跳过 | 保持原有SKIP判断逻辑          |

---

**改动量估算**: 3个文件，约20行代码改动
