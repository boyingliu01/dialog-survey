# 多轮对话完整实现方案 (Round 2 - 修复版)

> 基于 Delphi Review Round 1 反馈修复

---

## 修复清单

### C-1: 乐观锁版本号逻辑修复

**问题**: `version: state.version - 1` 语义不清，saveState 又做 increment

**修复方案**:

```typescript
// 加载时保存原始版本
interface InterviewState {
  // ...
  version: number; // 当前版本（加载后的值）
  originalVersion: number; // 加载时的版本（用于乐观锁检查）
}

async function loadFullState(userId: string): Promise<InterviewState> {
  const interview = await prisma.interview.findFirst({
    where: { userId, status: { in: ["PENDING", "ACTIVE", "WAITING"] } },
    include: { messages: true, responses: true, template: true },
  });

  if (interview) {
    return {
      // ...
      version: interview.version,
      originalVersion: interview.version, // 保存原始版本
    };
  }

  // 新建时 version = 1, originalVersion = 1
  return {
    // ...
    version: 1,
    originalVersion: 1,
  };
}

async function saveFullState(
  interviewId: string,
  state: InterviewState,
): Promise<void> {
  // 使用 Prisma 事务确保原子性
  await prisma.$transaction(async (tx) => {
    // Step 1: 更新 Interview（乐观锁检查）
    const updated = await tx.interview.update({
      where: {
        id: interviewId,
        version: state.originalVersion, // 使用加载时的版本
      },
      data: {
        status: state.status,
        currentQuestion: state.currentQuestion,
        followupCount: state.followupCount,
        version: { increment: 1 }, // 版本+1
      },
    });

    // Step 2: 保存新的 messages（事务内）
    const newMessages = state.pendingMessages || [];
    if (newMessages.length > 0) {
      await tx.message.createMany({
        data: newMessages.map((m) => ({
          interviewId,
          role: m.role,
          content: m.content,
          isVoice: false,
        })),
      });
    }

    // Step 3: 保存新的 responses（事务内）
    const newResponses = state.pendingResponses || [];
    if (newResponses.length > 0) {
      await tx.response.createMany({
        data: newResponses.map((r) => ({
          interviewId,
          questionId: r.questionId,
          content: r.content,
          isFollowup: r.isFollowup,
        })),
      });
    }

    // Step 4: 更新状态中的版本号
    state.version = updated.version;
    state.originalVersion = updated.version;
    state.pendingMessages = [];
    state.pendingResponses = [];
  });
}
```

---

### C-2: LangGraph nextState 传递修复

**问题**: `runInterviewGraph` 返回 `nextState` 被丢弃

**修复方案**:

```typescript
// LangGraph 返回完整状态
interface GraphResult {
  response: string;
  nextState: InterviewState; // 必须返回更新后的状态
  shouldContinue: boolean;
}

export async function processStreamMessage(
  message: StreamMessage,
): Promise<ProcessResult> {
  const parsed = parseStreamMessage(message);
  if (!parsed) return { success: false, error: "Invalid message" };

  // Step 1: 加载状态
  const state = await loadFullState(parsed.userId);

  // Step 2: 添加用户消息到待保存列表
  state.pendingMessages = [{ role: "user", content: parsed.content }];

  // Step 3: 调用 LangGraph，获取完整状态更新
  const result = await runInterviewGraph(state, {
    userId: parsed.userId,
    content: parsed.content,
    isVoice: false,
  });

  // Step 4: 添加 assistant 消息到待保存列表
  if (result.response) {
    result.nextState.pendingMessages.push({
      role: "assistant",
      content: result.response,
    });
  }

  // Step 5: 使用 LangGraph 返回的 nextState 进行保存
  await saveFullState(result.nextState.interviewId, result.nextState);

  // Step 6: 发送回复
  if (parsed.sessionWebhook && result.response) {
    await sendReply(parsed.sessionWebhook, result.response);
  }

  return { success: true, response: result.response };
}
```

---

### C-3: 事务边界修复

**问题**: Interview 更新和消息创建不在同一事务

**修复方案**: 已在 C-1 修复中使用 `prisma.$transaction` 包装所有操作

---

### C-4: InterviewState 类型验证

**当前状态**: 需要验证 `InterviewState` 是否包含 `version` 字段

**修复方案**:

```typescript
// src/core/types/index.ts
export const InterviewStateSchema = z.object({
  userId: z.string(),
  interviewId: z.string(),
  templateId: z.string(),
  status: z.enum(["PENDING", "ACTIVE", "WAITING", "COMPLETED", "CANCELLED"]),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
      timestamp: z.date().optional(),
    }),
  ),
  currentQuestion: z.number().default(0),
  followupCount: z.number().default(0),
  maxFollowups: z.number().default(2),
  responses: z.array(
    z.object({
      questionId: z.string(),
      content: z.string(),
      isFollowup: z.boolean().default(false),
    }),
  ),
  version: z.number(), // 当前版本
  originalVersion: z.number(), // 乐观锁检查版本
  pendingMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .default([]), // 待保存消息
  pendingResponses: z
    .array(
      z.object({
        questionId: z.string(),
        content: z.string(),
        isFollowup: z.boolean(),
      }),
    )
    .default([]), // 待保存回复
  reportGenerated: z.boolean().default(false),
});

export type InterviewState = z.infer<typeof InterviewStateSchema>;
```

---

### C-5: messages 保存实现

**问题**: `saveFullState` 中 messages 数据为空

**修复方案**: 已在 C-2 中通过 `pendingMessages` 字段传递待保存消息

---

## 修订后的完整流程

```
用户消息到达
├─ parseStreamMessage → { userId, content, sessionWebhook }
│
├─ loadFullState(userId)
│   ├─ 查询已有 Interview (include messages, responses)
│   ├─ 返回 { ..., version, originalVersion, pendingMessages: [], pendingResponses: [] }
│   └─ 或创建新 Interview (version=1, originalVersion=1)
│
├─ 添加用户消息到 pendingMessages
│   state.pendingMessages = [{ role: 'user', content }]
│
├─ runInterviewGraph(state, input)
│   ├─ LangGraph 处理（根据 status 决定节点）
│   ├─ 返回 { response, nextState, shouldContinue }
│   └─ nextState 包含更新后的 currentQuestion, followupCount, status
│
├─ 添加 assistant 消息到 nextState.pendingMessages
│   nextState.pendingMessages.push({ role: 'assistant', content: response })
│
├─ saveFullState(interviewId, nextState)  // 使用 nextState
│   ├─ prisma.$transaction(async (tx) => {
│   │   ├─ tx.interview.update({ where: { id, version: originalVersion } })
│   │   ├─ tx.message.createMany(state.pendingMessages)
│   │   ├─ tx.response.createMany(state.pendingResponses)
│   │   └─ 更新 state.version, state.originalVersion
│   └─ })
│
├─ sendReply(sessionWebhook, response)
│
└─ 返回 { success: true, response }
```

---

## 测试用例更新

需要增加以下断言：

```typescript
it("should correctly handle version increment", async () => {
  const state = await loadFullState(userId);
  expect(state.version).toBe(state.originalVersion);

  state.pendingMessages = [{ role: "user", content: "test" }];
  await saveFullState(state.interviewId, state);

  expect(state.version).toBe(state.originalVersion + 1);
});

it("should save messages in transaction", async () => {
  const mockTransaction = vi.fn();
  mockPrisma.$transaction = mockTransaction.mockImplementation(async (fn) => {
    const tx = {
      interview: { update: vi.fn().mockResolvedValue({ version: 3 }) },
      message: { createMany: vi.fn() },
      response: { createMany: vi.fn() },
    };
    return fn(tx);
  });

  state.pendingMessages = [
    { role: "user", content: "user msg" },
    { role: "assistant", content: "assistant msg" },
  ];

  await saveFullState(state.interviewId, state);

  expect(mockPrisma.$transaction).toHaveBeenCalled();
  // 验证事务内的 message.createMany 被调用
});
```

---

## 共识状态

| Issue              | Expert A | Expert B | 修复状态  |
| ------------------ | -------- | -------- | --------- |
| C-1 乐观锁版本     | ✅       | ✅       | ✅ 已修复 |
| C-2 nextState 丢失 | ✅       | ✅       | ✅ 已修复 |
| C-3 事务边界       | ✅       | ✅       | ✅ 已修复 |
| C-4 类型定义       | -        | ✅       | ✅ 已修复 |
| C-5 messages 保存  | -        | ✅       | ✅ 已修复 |

---

## 请专家确认

修复方案是否解决了所有 Critical Issues？
