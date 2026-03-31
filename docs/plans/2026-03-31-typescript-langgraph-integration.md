# TypeScript LangGraph 集成实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 Interview Bot TypeScript 版本的核心功能 - 集成 LangGraph.js 状态机、实现 DashScope LLM 服务、连接 Webhook 处理流程。

**Architecture:** 
- 使用 `@langchain/langgraph` 的 `StateGraph` 和 `MemorySaver` 替换自定义循环实现
- 实现 `QwenProvider` 调用阿里云 DashScope API
- 在 webhook handler 中调用 compiled graph 处理消息，状态通过 checkpointer 持久化

**Tech Stack:** TypeScript 5.4+, Node.js 20+, @langchain/langgraph 1.2.x, Prisma 7.x, Fastify 5.x, Zod 4.x

---

## 前置条件检查

**步骤 0: 验证依赖和环境**

运行: `cd interview-bot && npm list @langchain/langgraph @langchain/core`
预期: 显示已安装的版本 (已在 package.json 中)

运行: `cd interview-bot && npx tsc --noEmit`
预期: 只有 1 个警告 (InterviewTemplate unused import)，无错误

---

## Task A: 集成 @langchain/langgraph 重写核心状态机

### A.1: 定义 LangGraph 状态注解

**Files:**
- Modify: `src/core/state.ts`
- Test: `tests/unit/core/state.test.ts`

**Step 1: 查看当前状态定义**

运行: Read `src/core/state.ts` 和 `src/core/types.ts`

当前状态:
- `src/core/types.ts` 定义了 `InterviewState` 接口
- `src/core/state.ts` 有 `createInitialState` 函数

**Step 2: 创建 LangGraph Annotation 版本**

修改 `src/core/state.ts`，添加 LangGraph Annotation:

```typescript
import { Annotation } from '@langchain/langgraph';
import type { InterviewTemplate, Message, Topic } from './types';

// LangGraph state annotation for type-safe state updates
export const InterviewStateAnnotation = Annotation.Root({
  // Session identifiers
  sessionId: Annotation<string>,
  templateId: Annotation<string>,
  template: Annotation<InterviewTemplate>,

  // Conversation state
  conversationHistory: Annotation<Message[]>,
  currentTopicIndex: Annotation<number>,
  currentQuestionIndex: Annotation<number>,
  answers: Annotation<Record<string, string>>,
  completedTopics: Annotation<string[]>,

  // Flow control
  interviewStatus: Annotation<'planning' | 'interviewing' | 'followup' | 'analyzing' | 'completed'>,
  followupNeeded: Annotation<boolean>,
  followupQuestion: Annotation<string | undefined>,

  // Timing
  startTime: Annotation<Date>,
  endTime: Annotation<Date | undefined>,

  // Output
  report: Annotation<string | undefined>,
  error: Annotation<string | undefined>,
});

// Export type for use in nodes
export type InterviewState = typeof InterviewStateAnnotation.State;

/**
 * Create initial state for a new interview session
 */
export function createInitialState(
  sessionId: string,
  templateId: string,
  template: InterviewTemplate
): InterviewState {
  return {
    sessionId,
    templateId,
    template,
    conversationHistory: [],
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    completedTopics: [],
    interviewStatus: 'planning',
    followupNeeded: false,
    followupQuestion: undefined,
    startTime: new Date(),
    endTime: undefined,
    report: undefined,
    error: undefined,
  };
}

/**
 * Update conversation history with a new message
 */
export function updateConversationHistory(
  state: InterviewState,
  message: Message
): Partial<InterviewState> {
  return {
    conversationHistory: [...state.conversationHistory, message],
  };
}

/**
 * Extract the last user answer from conversation history
 */
export function extractUserAnswer(state: InterviewState): string | null {
  const userMessages = state.conversationHistory.filter(
    (msg) => msg.role === 'user'
  );
  const lastUserMessage = userMessages[userMessages.length - 1];
  return lastUserMessage ? lastUserMessage.content : null;
}
```

**Step 3: 运行类型检查**

运行: `cd interview-bot && npx tsc --noEmit`
预期: 无新增类型错误

**Step 4: 更新测试**

修改 `tests/unit/core/state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createInitialState, updateConversationHistory, extractUserAnswer } from '../../../src/core/state';
import type { InterviewTemplate } from '../../../src/core/types';

describe('State Functions', () => {
  const mockTemplate: InterviewTemplate = {
    id: 'test-template',
    name: 'Test Interview',
    topics: [
      { id: 't1', name: 'Topic 1', description: 'Test topic', initial_question: 'Hello?' }
    ],
    questions: [
      { id: 'q1', type: 'text', text: 'What is your name?' }
    ],
  };

  describe('createInitialState', () => {
    it('should create state with default values', () => {
      const state = createInitialState('session-1', 'test-template', mockTemplate);
      
      expect(state.sessionId).toBe('session-1');
      expect(state.templateId).toBe('test-template');
      expect(state.template).toEqual(mockTemplate);
      expect(state.conversationHistory).toEqual([]);
      expect(state.currentTopicIndex).toBe(0);
      expect(state.interviewStatus).toBe('planning');
      expect(state.followupNeeded).toBe(false);
    });
  });

  describe('updateConversationHistory', () => {
    it('should append message to history', () => {
      const state = createInitialState('session-1', 'test-template', mockTemplate);
      const message = { role: 'user' as const, content: 'Hello' };
      
      const update = updateConversationHistory(state, message);
      
      expect(update.conversationHistory).toHaveLength(1);
      expect(update.conversationHistory![0]).toEqual(message);
    });
  });

  describe('extractUserAnswer', () => {
    it('should return null for empty history', () => {
      const state = createInitialState('session-1', 'test-template', mockTemplate);
      expect(extractUserAnswer(state)).toBeNull();
    });

    it('should return last user message content', () => {
      const state = createInitialState('session-1', 'test-template', mockTemplate);
      state.conversationHistory = [
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'My answer' },
      ];
      
      expect(extractUserAnswer(state)).toBe('My answer');
    });
  });
});
```

**Step 5: 运行测试**

运行: `cd interview-bot && npm test -- tests/unit/core/state.test.ts`
预期: 所有测试通过

**Step 6: 提交**

```bash
cd interview-bot
git add src/core/state.ts tests/unit/core/state.test.ts
git commit -m "feat(core): add LangGraph Annotation for state definition"
```

---

### A.2: 重写节点函数以适配 LangGraph

**Files:**
- Modify: `src/core/nodes.ts`
- Test: `tests/unit/core/nodes.test.ts`

**Step 1: 更新节点函数签名**

LangGraph 节点函数接收 state，返回 Partial<State>:

```typescript
import type { InterviewState } from './state';
import type { LLMProvider } from './types';
import { PLANNING_PROMPT, INTERVIEW_PROMPT, FOLLOWUP_PROMPT, ANALYZE_PROMPT } from './prompts';
import { extractUserAnswer } from './state';

/**
 * Build recent conversation history for LLM context
 */
function buildHistory(state: InterviewState): Array<{ role: string; content: string }> {
  return state.conversationHistory.slice(-6);
}

/**
 * Planning node - Initialize interview and greet user
 */
export async function planningNode(
  state: InterviewState,
  llm?: LLMProvider
): Promise<Partial<InterviewState>> {
  try {
    const prompt = PLANNING_PROMPT(state.template);
    
    let greeting: string;
    if (llm) {
      const response = await llm.generateResponse(prompt, buildHistory(state));
      greeting = response.content;
    } else {
      greeting = `欢迎参加访谈，我们开始吧！`;
    }

    return {
      conversationHistory: [...state.conversationHistory, { role: 'assistant', content: greeting }],
      interviewStatus: 'interviewing',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      conversationHistory: [
        ...state.conversationHistory,
        { role: 'assistant', content: '欢迎参加访谈，我们开始吧！' },
      ],
      interviewStatus: 'interviewing',
      error: message,
    };
  }
}

/**
 * Interview node - Process user answer and generate next question
 */
export async function interviewNode(
  state: InterviewState,
  llm?: LLMProvider
): Promise<Partial<InterviewState>> {
  const userAnswer = extractUserAnswer(state);
  if (!userAnswer) {
    return state;
  }

  const prompt = INTERVIEW_PROMPT(state.template, state.currentTopicIndex, state.currentQuestionIndex);

  try {
    let response = { content: '', isFollowupNeeded: false };
    if (llm) {
      response = await llm.generateResponse(prompt, buildHistory(state));
    } else {
      response = { content: '感谢您的回答。下一个问题...', isFollowupNeeded: false };
    }

    const assistantMessage = { role: 'assistant' as const, content: response.content };

    // Record answer
    const answers = { ...state.answers };
    const answerKey = `q${state.currentTopicIndex}_${state.currentQuestionIndex}`;
    answers[answerKey] = userAnswer;

    // Advance question/topic
    let currentTopicIndex = state.currentTopicIndex;
    let currentQuestionIndex = state.currentQuestionIndex + 1;
    let completedTopics = [...state.completedTopics];
    let interviewStatus: InterviewState['interviewStatus'] = state.interviewStatus;
    let followupNeeded = response.isFollowupNeeded ?? false;

    const questionsInTopic = state.template.questions.length;
    const topicsCount = state.template.topics.length;

    if (currentQuestionIndex >= questionsInTopic) {
      completedTopics = Array.from(new Set([...completedTopics, state.template.topics[currentTopicIndex].id]));
      currentTopicIndex += 1;
      currentQuestionIndex = 0;
    }

    if (completedTopics.length >= topicsCount) {
      interviewStatus = 'analyzing';
    } else if (followupNeeded) {
      interviewStatus = 'followup';
    } else {
      interviewStatus = 'interviewing';
    }

    return {
      conversationHistory: [...state.conversationHistory, assistantMessage],
      answers,
      currentTopicIndex,
      currentQuestionIndex,
      completedTopics,
      interviewStatus,
      followupNeeded,
      followupQuestion: response.followupQuestion,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: message };
  }
}

/**
 * Followup node - Ask clarifying question
 */
export async function followupNode(
  state: InterviewState,
  llm?: LLMProvider
): Promise<Partial<InterviewState>> {
  const userAnswer = extractUserAnswer(state) ?? '';
  const lastQuestion = state.template.questions[state.currentQuestionIndex]?.text ?? '';
  const prompt = FOLLOWUP_PROMPT(lastQuestion, userAnswer);

  try {
    let content: string;
    if (llm) {
      const response = await llm.generateResponse(prompt, buildHistory(state));
      content = response.content;
    } else {
      content = `您对"${lastQuestion}"的回答是：${userAnswer}。能否请您详细说明一下？`;
    }

    return {
      conversationHistory: [...state.conversationHistory, { role: 'assistant', content }],
      followupNeeded: false,
      followupQuestion: undefined,
      interviewStatus: 'interviewing',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      followupNeeded: false,
      followupQuestion: undefined,
      interviewStatus: 'interviewing',
      error: message,
    };
  }
}

/**
 * Analyze node - Generate interview report
 */
export async function analyzeNode(
  state: InterviewState,
  llm?: LLMProvider
): Promise<Partial<InterviewState>> {
  try {
    const prompt = ANALYZE_PROMPT(state.template);
    
    let report: string;
    if (llm) {
      const response = await llm.generateResponse(prompt, buildHistory(state));
      report = response.content;
    } else {
      report = '# Interview Report\n\nInterview completed successfully.';
    }

    return {
      report,
      interviewStatus: 'completed',
      endTime: new Date(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      report: '# Interview Report\n\nError generating report. Please review the conversation manually.',
      interviewStatus: 'completed',
      endTime: new Date(),
      error: message,
    };
  }
}
```

**Step 2: 运行类型检查**

运行: `cd interview-bot && npx tsc --noEmit`
预期: 无新增类型错误

**Step 3: 提交**

```bash
cd interview-bot
git add src/core/nodes.ts
git commit -m "refactor(core): update nodes to return Partial<InterviewState>"
```

---

### A.3: 实现条件边函数

**Files:**
- Modify: `src/core/edges.ts`
- Test: `tests/unit/core/edges.test.ts`

**Step 1: 实现路由逻辑**

```typescript
import type { InterviewState } from './state';

/**
 * Determine next node based on current state
 * Returns: 'interviewing' | 'followup' | 'analyzing' | 'end'
 */
export function shouldContinue(state: InterviewState): string {
  // If completed, go to END
  if (state.interviewStatus === 'completed') {
    return 'end';
  }

  // If analyzing, go to analyze node
  if (state.interviewStatus === 'analyzing') {
    return 'analyzing';
  }

  // If followup needed, go to followup
  if (state.interviewStatus === 'followup' || state.followupNeeded) {
    return 'followup';
  }

  // Default: continue interviewing
  return 'interviewing';
}

/**
 * Check if interview is complete
 */
export function isInterviewComplete(state: InterviewState): boolean {
  return (
    state.interviewStatus === 'completed' ||
    state.completedTopics.length >= state.template.topics.length
  );
}
```

**Step 2: 更新测试**

```typescript
import { describe, it, expect } from 'vitest';
import { shouldContinue, isInterviewComplete } from '../../../src/core/edges';
import { createInitialState } from '../../../src/core/state';
import type { InterviewTemplate } from '../../../src/core/types';

describe('Edge Functions', () => {
  const mockTemplate: InterviewTemplate = {
    id: 'test',
    name: 'Test',
    topics: [{ id: 't1', name: 'T1', initial_question: 'Q?' }],
    questions: [],
  };

  describe('shouldContinue', () => {
    it('should return "end" when completed', () => {
      const state = { ...createInitialState('s1', 't1', mockTemplate), interviewStatus: 'completed' as const };
      expect(shouldContinue(state)).toBe('end');
    });

    it('should return "analyzing" when status is analyzing', () => {
      const state = { ...createInitialState('s1', 't1', mockTemplate), interviewStatus: 'analyzing' as const };
      expect(shouldContinue(state)).toBe('analyzing');
    });

    it('should return "followup" when followup needed', () => {
      const state = { ...createInitialState('s1', 't1', mockTemplate), interviewStatus: 'followup' as const };
      expect(shouldContinue(state)).toBe('followup');
    });

    it('should return "interviewing" by default', () => {
      const state = { ...createInitialState('s1', 't1', mockTemplate), interviewStatus: 'interviewing' as const };
      expect(shouldContinue(state)).toBe('interviewing');
    });
  });

  describe('isInterviewComplete', () => {
    it('should return true when completed', () => {
      const state = { ...createInitialState('s1', 't1', mockTemplate), interviewStatus: 'completed' as const };
      expect(isInterviewComplete(state)).toBe(true);
    });

    it('should return false when in progress', () => {
      const state = createInitialState('s1', 't1', mockTemplate);
      expect(isInterviewComplete(state)).toBe(false);
    });
  });
});
```

**Step 3: 运行测试**

运行: `cd interview-bot && npm test -- tests/unit/core/edges.test.ts`
预期: 所有测试通过

**Step 4: 提交**

```bash
cd interview-bot
git add src/core/edges.ts tests/unit/core/edges.test.ts
git commit -m "refactor(core): simplify edge functions for LangGraph"
```

---

### A.4: 构建完整的 StateGraph

**Files:**
- Rewrite: `src/core/graph.ts`
- Test: `tests/unit/core/graph.test.ts`

**Step 1: 实现完整的 StateGraph**

```typescript
import { StateGraph, END, MemorySaver } from '@langchain/langgraph';
import { InterviewStateAnnotation, type InterviewState } from './state';
import { planningNode, interviewNode, followupNode, analyzeNode } from './nodes';
import { shouldContinue } from './edges';
import type { InterviewTemplate, LLMProvider } from './types';

// Graph instance cache
let graphInstance: ReturnType<typeof createInterviewGraph> | null = null;

/**
 * Create the interview conversation graph
 */
export function createInterviewGraph(llm?: LLMProvider) {
  // Create the state graph with our annotation
  const workflow = new StateGraph(InterviewStateAnnotation);

  // Add nodes
  workflow.addNode('planning', async (state: InterviewState) => planningNode(state, llm));
  workflow.addNode('interviewing', async (state: InterviewState) => interviewNode(state, llm));
  workflow.addNode('followup', async (state: InterviewState) => followupNode(state, llm));
  workflow.addNode('analyzing', async (state: InterviewState) => analyzeNode(state, llm));

  // Set entry point
  workflow.setEntryPoint('planning');

  // Add edges
  workflow.addEdge('planning', 'interviewing');
  
  // Conditional edges from interviewing
  workflow.addConditionalEdges('interviewing', shouldContinue, {
    interviewing: 'interviewing',
    followup: 'followup',
    analyzing: 'analyzing',
    end: END,
  });

  workflow.addEdge('followup', 'interviewing');
  workflow.addEdge('analyzing', END);

  // Compile with memory saver for state persistence
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}

/**
 * Get or create the singleton graph instance
 */
export function getInterviewGraph(llm?: LLMProvider) {
  if (!graphInstance) {
    graphInstance = createInterviewGraph(llm);
  }
  return graphInstance;
}

/**
 * Run a single turn of the interview
 * @param sessionId - Session identifier for state persistence
 * @param templateId - Template identifier
 * @param template - Interview template
 * @param userMessage - User's message (optional for first turn)
 * @param llm - LLM provider
 * @returns Updated interview state
 */
export async function runInterviewTurn(
  sessionId: string,
  templateId: string,
  template: InterviewTemplate,
  userMessage: string | null,
  llm?: LLMProvider
): Promise<InterviewState> {
  const graph = getInterviewGraph(llm);

  // Build initial state or update with user message
  const initialState: InterviewState = {
    sessionId,
    templateId,
    template,
    conversationHistory: userMessage
      ? [{ role: 'user', content: userMessage }]
      : [],
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    answers: {},
    completedTopics: [],
    interviewStatus: 'planning',
    followupNeeded: false,
    followupQuestion: undefined,
    startTime: new Date(),
    endTime: undefined,
    report: undefined,
    error: undefined,
  };

  // Invoke the graph with thread_id for state persistence
  const result = await graph.invoke(initialState, {
    configurable: { thread_id: sessionId },
  });

  return result as InterviewState;
}

/**
 * Resume an existing interview from saved state
 */
export async function resumeInterview(
  sessionId: string,
  currentState: InterviewState,
  userMessage: string,
  llm?: LLMProvider
): Promise<InterviewState> {
  const graph = getInterviewGraph(llm);

  // Add user message to history
  const stateWithMessage: InterviewState = {
    ...currentState,
    conversationHistory: [
      ...currentState.conversationHistory,
      { role: 'user', content: userMessage },
    ],
  };

  // Invoke the graph
  const result = await graph.invoke(stateWithMessage, {
    configurable: { thread_id: sessionId },
  });

  return result as InterviewState;
}

/**
 * Reset the graph instance (for testing)
 */
export function resetGraphInstance(): void {
  graphInstance = null;
}
```

**Step 2: 更新测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createInterviewGraph, runInterviewTurn, resetGraphInstance } from '../../../src/core/graph';
import { MockLLMProvider } from '../../../src/services/llm/llm-provider';
import type { InterviewTemplate } from '../../../src/core/types';

describe('Interview Graph', () => {
  const mockTemplate: InterviewTemplate = {
    id: 'test',
    name: 'Test Interview',
    topics: [
      { id: 't1', name: 'Topic 1', initial_question: 'How are you?' }
    ],
    questions: [
      { id: 'q1', type: 'text', text: 'What is your name?' }
    ],
  };

  beforeEach(() => {
    resetGraphInstance();
  });

  describe('createInterviewGraph', () => {
    it('should create a graph with all nodes', () => {
      const graph = createInterviewGraph();
      expect(graph).toBeDefined();
    });
  });

  describe('runInterviewTurn', () => {
    it('should run planning and interviewing nodes', async () => {
      const llm = new MockLLMProvider();
      const result = await runInterviewTurn(
        'session-1',
        'test',
        mockTemplate,
        'Hello',
        llm
      );

      expect(result.sessionId).toBe('session-1');
      expect(result.conversationHistory.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 3: 运行测试**

运行: `cd interview-bot && npm test -- tests/unit/core/graph.test.ts`
预期: 测试通过 (可能需要调整 MockLLMProvider)

**Step 4: 提交**

```bash
cd interview-bot
git add src/core/graph.ts tests/unit/core/graph.test.ts
git commit -m "feat(core): implement StateGraph with MemorySaver"
```

---

## Task B: 实现 DashScope/Qwen LLM 服务

### B.1: 定义 LLM 服务接口

**Files:**
- Modify: `src/services/llm/llm-provider.ts`
- Create: `src/services/llm/dashscope.ts`
- Create: `src/services/llm/index.ts`

**Step 1: 增强 LLMProvider 接口**

修改 `src/services/llm/llm-provider.ts`:

```typescript
import type { LLMMessage, LLMResponse, LLMOptions } from '../../types';

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  generateResponse(prompt: string, history: Array<{ role: string; content: string }>): Promise<{ content: string; isFollowupNeeded?: boolean; followupQuestion?: string }>;
}

/**
 * Mock LLM Provider for testing
 */
export class MockLLMProvider implements LLMProvider {
  private responses: string[] = [
    '好的，让我来了解一下您的情况。',
    '非常感谢您的回答，这很有帮助。',
    '明白了，您能再详细说说吗？',
    '访谈报告已生成完毕。',
  ];
  private responseIndex = 0;

  async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    const content = this.responses[this.responseIndex % this.responses.length];
    this.responseIndex++;

    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async generateResponse(prompt: string, _history: Array<{ role: string; content: string }>) {
    // Simulate followup detection based on prompt
    const isFollowup = prompt.includes('详细') || prompt.includes('追问');
    return {
      content: this.responses[this.responseIndex++ % this.responses.length],
      isFollowupNeeded: isFollowup,
    };
  }

  setResponses(responses: string[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }
}

/**
 * Dummy LLM Provider for quick testing
 */
export class DummyLLMProvider implements LLMProvider {
  async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
    return {
      content: 'This is a dummy response.',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async generateResponse(_prompt: string, _history: Array<{ role: string; content: string }>) {
    return { content: 'This is a dummy response.' };
  }
}
```

**Step 2: 创建 DashScope 服务**

创建 `src/services/llm/dashscope.ts`:

```typescript
import type { LLMMessage, LLMResponse, LLMOptions } from '../../types';

export interface DashScopeConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
}

/**
 * DashScope (Qwen) LLM Provider
 * Implements LLMProvider interface for Alibaba Cloud's Qwen models
 */
export class DashScopeProvider {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: DashScopeConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'qwen-max';
    this.endpoint = config.endpoint ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  }

  /**
   * Send chat request to DashScope API
   */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), (options?.timeout ?? 30) * 1000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DashScope API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate response with conversation history
   */
  async generateResponse(
    prompt: string,
    history: Array<{ role: string; content: string }>
  ): Promise<{ content: string; isFollowupNeeded?: boolean; followupQuestion?: string }> {
    // Build messages from history + current prompt
    const messages: LLMMessage[] = [
      ...history.map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
      { role: 'user', content: prompt },
    ];

    const response = await this.chat(messages);

    // Try to parse follow-up information from response
    // In production, this could be a separate LLM call or structured output
    const isFollowupNeeded = response.content.includes('追问') || response.content.includes('详细说明');
    
    return {
      content: response.content,
      isFollowupNeeded,
    };
  }

  /**
   * Check if follow-up is needed based on user answer
   */
  async isFollowupNeeded(
    conversationHistory: Array<{ role: string; content: string }>,
    userAnswer: string
  ): Promise<{ needed: boolean; type: string; reason: string }> {
    const prompt = `分析用户回答，判断是否需要追问。

用户回答: "${userAnswer}"

如果回答过于简短（少于10个字）、模糊或需要更多细节，请回复JSON格式:
{"needed": true, "type": "clarification|deep|validation|expansion", "reason": "原因"}

如果回答充分，请回复:
{"needed": false, "type": "", "reason": ""}`;

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个访谈分析专家，帮助判断回答质量。' },
      { role: 'user', content: prompt },
    ];

    const response = await this.chat(messages);
    
    try {
      // Try to extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If parsing fails, default to no followup
    }

    return { needed: false, type: '', reason: '' };
  }

  /**
   * Generate interview report
   */
  async generateReport(
    conversationHistory: Array<{ role: string; content: string }>,
    topics: string[]
  ): Promise<string> {
    const prompt = `请根据以下访谈记录生成一份详细的访谈报告。

访谈主题: ${topics.join(', ')}

访谈记录:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

报告应包括:
1. 访谈概览
2. 各主题详细分析
3. 关键发现
4. 建议`;

    const messages: LLMMessage[] = [
      { role: 'system', content: '你是一个访谈报告撰写专家，擅长总结和分析访谈内容。' },
      { role: 'user', content: prompt },
    ];

    const response = await this.chat(messages, { maxTokens: 3000 });
    return response.content;
  }
}

// Singleton instance
let dashScopeInstance: DashScopeProvider | null = null;

/**
 * Get or create DashScope provider instance
 */
export function getDashScopeProvider(config?: DashScopeConfig): DashScopeProvider {
  if (!dashScopeInstance && config) {
    dashScopeInstance = new DashScopeProvider(config);
  }
  if (!dashScopeInstance) {
    throw new Error('DashScope provider not initialized. Call getDashScopeProvider with config first.');
  }
  return dashScopeInstance;
}

/**
 * Initialize DashScope provider
 */
export function initializeDashScope(config: DashScopeConfig): DashScopeProvider {
  dashScopeInstance = new DashScopeProvider(config);
  return dashScopeInstance;
}
```

**Step 3: 创建 barrel export**

创建 `src/services/llm/index.ts`:

```typescript
export { MockLLMProvider, DummyLLMProvider, type LLMProvider } from './llm-provider';
export { DashScopeProvider, getDashScopeProvider, initializeDashScope, type DashScopeConfig } from './dashscope';
```

**Step 4: 创建测试**

创建 `tests/unit/services/llm/dashscope.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DashScopeProvider } from '../../../../src/services/llm/dashscope';

describe('DashScopeProvider', () => {
  it('should initialize with config', () => {
    const provider = new DashScopeProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('should use default model qwen-max', () => {
    const provider = new DashScopeProvider({ apiKey: 'test-key' });
    // Access private property for testing
    expect((provider as any).model).toBe('qwen-max');
  });

  // Note: Integration tests would require actual API key
  it.skip('should call DashScope API', async () => {
    // This would be an integration test with real API
  });
});
```

**Step 5: 运行测试**

运行: `cd interview-bot && npm test -- tests/unit/services/llm/`
预期: Mock 测试通过

**Step 6: 提交**

```bash
cd interview-bot
git add src/services/llm/ tests/unit/services/llm/
git commit -m "feat(services): implement DashScope LLM provider"
```

---

## Task C: 连接 Webhook → Conversation Engine

### C.1: 创建 Conversation Engine 服务

**Files:**
- Create: `src/services/conversation/engine.ts`
- Create: `src/services/conversation/index.ts`

**Step 1: 创建 Conversation Engine**

```typescript
import { getInterviewGraph, runInterviewTurn, resumeInterview } from '../../core/graph';
import { getDashScopeProvider, type DashScopeConfig } from '../llm';
import { InterviewRepository } from '../../repositories/interview';
import { MessageRepository } from '../../repositories/message';
import { MessageRole } from '@prisma/client';
import type { InterviewTemplate } from '../../core/types';

export interface ConversationEngineConfig {
  llmConfig?: DashScopeConfig;
  useLlm?: boolean;
}

/**
 * Conversation Engine
 * Orchestrates the interview flow between webhook and LangGraph
 */
export class ConversationEngine {
  private useLlm: boolean;
  private llmConfig?: DashScopeConfig;

  constructor(config: ConversationEngineConfig = {}) {
    this.useLlm = config.useLlm ?? false;
    this.llmConfig = config.llmConfig;
  }

  /**
   * Process an incoming user message
   * @returns The assistant's response
   */
  async processMessage(
    sessionId: string,
    userId: string,
    templateId: string,
    template: InterviewTemplate,
    userMessage: string
  ): Promise<string> {
    // Get LLM provider if enabled
    const llm = this.useLlm && this.llmConfig
      ? getDashScopeProvider(this.llmConfig)
      : undefined;

    // Check for existing interview
    const existingInterview = await InterviewRepository.findBySessionId(sessionId);
    
    let result;
    if (existingInterview) {
      // Resume existing conversation
      const currentState = this.deserializeState(existingInterview);
      result = await resumeInterview(sessionId, currentState, userMessage, llm);
    } else {
      // Start new conversation
      result = await runInterviewTurn(sessionId, templateId, template, userMessage, llm);
    }

    // Save updated state to database
    await this.saveState(sessionId, userId, templateId, result);

    // Return assistant's last message
    const lastAssistantMessage = result.conversationHistory
      .filter(m => m.role === 'assistant')
      .pop();
    
    return lastAssistantMessage?.content ?? '感谢您的回复。';
  }

  /**
   * Deserialize database record to InterviewState
   */
  private deserializeState(interview: any): any {
    return {
      sessionId: interview.sessionId,
      templateId: interview.templateId,
      template: interview.conversationHistory?.template ?? {},
      conversationHistory: interview.conversationHistory?.messages ?? [],
      currentTopicIndex: interview.conversationHistory?.currentTopicIndex ?? 0,
      currentQuestionIndex: interview.conversationHistory?.currentQuestionIndex ?? 0,
      answers: interview.extractedInfo?.answers ?? {},
      completedTopics: interview.conversationHistory?.completedTopics ?? [],
      interviewStatus: 'interviewing', // Resume in interviewing state
      followupNeeded: false,
      startTime: interview.createdAt,
    };
  }

  /**
   * Save state to database
   */
  private async saveState(
    sessionId: string,
    userId: string,
    templateId: string,
    state: any
  ): Promise<void> {
    const existingInterview = await InterviewRepository.findBySessionId(sessionId);

    const conversationHistory = {
      template: state.template,
      messages: state.conversationHistory,
      currentTopicIndex: state.currentTopicIndex,
      currentQuestionIndex: state.currentQuestionIndex,
      completedTopics: state.completedTopics,
    };

    const extractedInfo = {
      answers: state.answers,
    };

    if (existingInterview) {
      await InterviewRepository.update(existingInterview.id, {
        conversationHistory,
        extractedInfo,
        status: state.interviewStatus === 'completed' ? 'COMPLETED' : 'IN_PROGRESS',
        report: state.report,
      });
    } else {
      await InterviewRepository.create({
        sessionId,
        userId,
        templateId,
        topic: state.template.name,
        conversationHistory,
        extractedInfo,
      });
    }
  }
}

// Singleton instance
let engineInstance: ConversationEngine | null = null;

/**
 * Get or create conversation engine instance
 */
export function getConversationEngine(config?: ConversationEngineConfig): ConversationEngine {
  if (!engineInstance) {
    engineInstance = new ConversationEngine(config);
  }
  return engineInstance;
}

/**
 * Initialize conversation engine
 */
export function initializeConversationEngine(config: ConversationEngineConfig): ConversationEngine {
  engineInstance = new ConversationEngine(config);
  return engineInstance;
}
```

**Step 2: 创建 barrel export**

```typescript
export { ConversationEngine, getConversationEngine, initializeConversationEngine, type ConversationEngineConfig } from './engine';
```

**Step 3: 提交**

```bash
cd interview-bot
git add src/services/conversation/
git commit -m "feat(services): add conversation engine service"
```

---

### C.2: 更新 Webhook Handler

**Files:**
- Modify: `src/api/webhook.ts`

**Step 1: 集成 Conversation Engine**

在 `src/api/webhook.ts` 中替换 TODO 部分:

找到:
```typescript
// TODO: Call conversation engine to process message
// For now, just echo back
const responseMessage = `已收到您的消息: ${content}`;
```

替换为:
```typescript
// Process message through conversation engine
const { getConversationEngine } = await import('../services/conversation/index.js');
const engine = getConversationEngine({
  useLlm: process.env.LLM_API_KEY ? true : false,
  llmConfig: process.env.LLM_API_KEY ? {
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  } : undefined,
});

const responseMessage = await engine.processMessage(
  sessionId,
  user_id,
  interview.templateId || 'quality_survey',
  template,
  content
);
```

**Step 2: 更新环境配置**

在 `src/config.ts` 中添加 LLM 配置:

```typescript
// Add to EnvironmentSchema
LLM_API_KEY: z.string().optional(),
LLM_MODEL: z.string().default('qwen-max'),
LLM_ENDPOINT: z.string().optional(),
```

**Step 3: 运行类型检查**

运行: `cd interview-bot && npx tsc --noEmit`
预期: 无错误

**Step 4: 提交**

```bash
cd interview-bot
git add src/api/webhook.ts src/config.ts
git commit -m "feat(api): integrate conversation engine in webhook handler"
```

---

## Task D: 测试和验证

### D.1: 运行完整测试套件

运行: `cd interview-bot && npm test`
预期: 所有测试通过

### D.2: 手动验证

```bash
# Start server
cd interview-bot
npm run dev

# In another terminal, test webhook
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"msgtype":"text","text":{"content":"开始"},"senderStaffId":"user123"}'
```

预期: 返回欢迎消息和第一个问题

---

## 完成检查清单

- [ ] LangGraph StateGraph 实现完成
- [ ] MemorySaver 状态持久化工作
- [ ] DashScope LLM 服务可调用
- [ ] Webhook 正确处理消息
- [ ] 状态可在多轮对话中保持
- [ ] 所有测试通过
- [ ] TypeScript 编译无错误

---

## 文件变更总结

### 新增文件
- `src/services/llm/dashscope.ts` - DashScope API 客户端
- `src/services/llm/index.ts` - LLM 服务 barrel export
- `src/services/conversation/engine.ts` - 对话引擎
- `src/services/conversation/index.ts` - 对话引擎 barrel
- `tests/unit/services/llm/dashscope.test.ts` - LLM 测试

### 修改文件
- `src/core/state.ts` - 添加 LangGraph Annotation
- `src/core/nodes.ts` - 返回 Partial<State>
- `src/core/edges.ts` - 简化条件边
- `src/core/graph.ts` - 完整 StateGraph 实现
- `src/services/llm/llm-provider.ts` - 增强 LLMProvider 接口
- `src/api/webhook.ts` - 集成 conversation engine
- `src/config.ts` - 添加 LLM 环境变量
- `tests/unit/core/*.test.ts` - 更新测试

---

## 执行选项

计划已保存到 `docs/plans/2026-03-31-typescript-langgraph-integration.md`

**两种执行方式:**

1. **Subagent-Driven (当前会话)** - 我在此会话中逐任务派发子代理，任务间进行代码审查，快速迭代

2. **Parallel Session (新会话)** - 在新会话中使用 executing-plans skill，批量执行带检查点

**你选择哪种方式？**