import { describe, expect, it } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { planningNode } from '../src/core/nodes/planning.js';

describe('planningNode', () => {
  const baseState: InterviewState = {
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
    status: 'PENDING',
    messages: [],
    currentQuestion: 0,
    followupCount: 0,
    maxFollowups: 2,
    responses: [],
    reportGenerated: false,
    version: 1,
    originalVersion: 1,
    pendingMessages: [],
    pendingResponses: [],
  };

  it('should return first question as response', async () => {
    const result = await planningNode(baseState);

    expect(result.response).toBe('请简单介绍一下您的工作经历？');
    expect(result.shouldContinue).toBe(true);
    expect(result.currentQuestion).toBe(0);
  });

  it('should add first question message to messages array', async () => {
    const result = await planningNode(baseState);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe('请简单介绍一下您的工作经历？');
    expect(result.messages[0].timestamp).toBeDefined();
  });

  it('should preserve existing messages', async () => {
    const stateWithMessages = {
      ...baseState,
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
    };

    const result = await planningNode(stateWithMessages);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
  });

  it('should use default template when templateId is undefined', async () => {
    const stateWithoutTemplate = { ...baseState, templateId: undefined };
    const result = await planningNode(stateWithoutTemplate);

    expect(result.response).toBe('请简单介绍一下您的工作经历？');
    expect(result.shouldContinue).toBe(true);
  });

  it('should set currentQuestion to 0', async () => {
    const state = { ...baseState, currentQuestion: 5 };
    const result = await planningNode(state);

    expect(result.currentQuestion).toBe(0);
  });
});
