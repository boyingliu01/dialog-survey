import { describe, expect, it } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { analyzingNode } from '../src/core/nodes/analyzing.js';

describe('analyzingNode', () => {
  const baseState: InterviewState = {
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
    status: 'ACTIVE',
    messages: [],
    currentQuestion: 4,
    followupCount: 2,
    maxFollowups: 2,
    responses: [
      { questionId: 'q0', content: 'R1', isFollowup: false },
      { questionId: 'q1', content: 'R2', isFollowup: false },
    ],
    reportGenerated: false,
    version: 5,
    originalVersion: 5,
    pendingMessages: [],
    pendingResponses: [],
  };

  it('should set status to COMPLETED', async () => {
    const result = await analyzingNode(baseState);

    expect(result.status).toBe('COMPLETED');
  });

  it('should set reportGenerated to true', async () => {
    const result = await analyzingNode(baseState);

    expect(result.reportGenerated).toBe(true);
  });

  it('should return analysis message', async () => {
    const result = await analyzingNode(baseState);

    expect(result.response).toBe('正在生成分析报告...');
    expect(result.shouldContinue).toBe(false);
  });

  it('should work with minimal state', async () => {
    const minimalState: InterviewState = {
      userId: 'user-min',
      status: 'ACTIVE',
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

    const result = await analyzingNode(minimalState);

    expect(result.status).toBe('COMPLETED');
    expect(result.reportGenerated).toBe(true);
  });
});
