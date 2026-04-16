import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { interviewingNode } from '../src/core/nodes/interviewing.js';

vi.mock('../src/services/followup.service.js', () => ({
  isFollowupNeeded: vi.fn().mockResolvedValue(false),
  generateFollowup: vi.fn().mockResolvedValue(null),
}));

describe('interviewingNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseState: InterviewState = {
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
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

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点添加响应并移动到下一问题的功能
   */
  it('should add response and move to next question', async () => {
    const result = await interviewingNode(baseState, { content: '我的回答' });

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0].questionId).toBe('q0');
    expect(result.responses[0].content).toBe('我的回答');
    expect(result.responses[0].isFollowup).toBe(false);
    expect(result.currentQuestion).toBe(1);
    expect(result.response).toBe('您在工作中遇到过最大的挑战是什么？');
    expect(result.shouldContinue).toBe(true);
  });

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点在没有更多问题时返回完成消息
   */
  it('should return completion message when no more questions', async () => {
    const lastQuestionState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastQuestionState, {
      content: '最后回答',
    });

    expect(result.responses).toHaveLength(1);
    expect(result.currentQuestion).toBe(4);
    expect(result.response).toBe(
      '访谈已完成，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！'
    );
    expect(result.shouldContinue).toBe(false);
    expect(result.nextQuestion).toBeUndefined();
  });

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点在多轮对话中累积响应
   */
  it('should accumulate responses across multiple turns', async () => {
    const stateWithResponses = {
      ...baseState,
      responses: [{ questionId: 'q0', content: '回答1', isFollowup: false }],
      currentQuestion: 1,
    };

    const result = await interviewingNode(stateWithResponses, {
      content: '回答2',
    });

    expect(result.responses).toHaveLength(2);
    expect(result.responses[0].questionId).toBe('q0');
    expect(result.responses[1].questionId).toBe('q1');
    expect(result.currentQuestion).toBe(2);
  });

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点在没有指定模板时使用默认模板
   */
  it('should use default template when templateId is undefined', async () => {
    const stateWithoutTemplate = { ...baseState, templateId: undefined };
    const result = await interviewingNode(stateWithoutTemplate, {
      content: '回答',
    });

    expect(result.response).toBeDefined();
    expect(result.shouldContinue).toBe(true);
  });

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点正确处理第二问题
   */
  it('should handle second question correctly', async () => {
    const state = { ...baseState, currentQuestion: 1 };
    const result = await interviewingNode(state, { content: '挑战回答' });

    expect(result.currentQuestion).toBe(2);
    expect(result.response).toBe('您是如何解决这个挑战的？');
    expect(result.shouldContinue).toBe(true);
  });

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点正确处理第三问题
   */
  it('should handle third question correctly', async () => {
    const state = { ...baseState, currentQuestion: 2 };
    const result = await interviewingNode(state, { content: '解决方案' });

    expect(result.currentQuestion).toBe(3);
    expect(result.response).toBe('您对未来的职业规划是什么？');
    expect(result.shouldContinue).toBe(true);
  });
});
