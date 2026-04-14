import { describe, expect, it } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { completedNode } from '../src/core/nodes/completed.js';

describe('completedNode', () => {
  const baseState: InterviewState = {
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
    status: 'COMPLETED',
    messages: [],
    currentQuestion: 4,
    followupCount: 2,
    maxFollowups: 2,
    responses: [],
    reportGenerated: true,
    version: 6,
    originalVersion: 6,
    pendingMessages: [],
    pendingResponses: [],
  };

  it('should return completion status', async () => {
    const result = await completedNode(baseState);

    expect(result.status).toBe('COMPLETED');
  });

  it('should return thank you message', async () => {
    const result = await completedNode(baseState);

    expect(result.response).toBe('访谈已完成。感谢您的参与！');
    expect(result.shouldContinue).toBe(false);
  });

  it('should work with minimal state', async () => {
    const minimalState: InterviewState = {
      userId: 'user-min',
      status: 'COMPLETED',
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: 2,
      responses: [],
      reportGenerated: true,
      version: 1,
      originalVersion: 1,
      pendingMessages: [],
      pendingResponses: [],
    };

    const result = await completedNode(minimalState);

    expect(result.status).toBe('COMPLETED');
    expect(result.response).toBe('访谈已完成。感谢您的参与！');
  });
});
