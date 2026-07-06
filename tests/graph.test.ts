import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInterviewGraph } from '../src/core/graph.js';
import type { InterviewState } from '../src/core/types/index.js';

vi.mock('../src/core/nodes/planning.js', () => ({
  planningNode: vi.fn().mockResolvedValue({
    currentQuestion: 0,
    messages: [{ role: 'assistant', content: '开场问题', timestamp: new Date() }],
    response: '开场问题',
    shouldContinue: true,
  }),
}));

vi.mock('../src/core/nodes/interviewing.js', () => ({
  interviewingNode: vi.fn().mockResolvedValue({
    currentQuestion: 1,
    responses: [{ questionId: 'q0', content: 'Answer', isFollowup: false }],
    response: '下一个问题',
    shouldContinue: true,
  }),
}));

// analyzingNode and completedNode deleted (M-1) — analysis trigger inlined in graph.ts

describe('runInterviewGraph', () => {
  let initialState: InterviewState;

  beforeEach(() => {
    vi.clearAllMocks();
    initialState = {
      userId: 'user-123',
      interviewId: 'interview-123',
      templateId: 'template-001',
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
      nudgeCount: 0,
    };
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证规划节点的状态机边条件：当访谈状态为PENDING时执行规划节点来生成开场问题
   */
  it('should run planning node for PENDING status', async () => {
    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '',
      isVoice: false,
    });

    expect(result.response).toBe('开场问题');
    expect(result.nextState.currentQuestion).toBe(0);
    expect(result.nextState.status).toBe('PENDING');
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证访谈节点的状态机边条件：当提供内容时执行访谈节点
   */
  it('should run interviewing node when content is provided', async () => {
    initialState.status = 'ACTIVE';

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '我的回答',
      isVoice: false,
    });

    expect(result.response).toBe('下一个问题');
    expect(result.nextState.currentQuestion).toBe(1);
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证状态转换结果包含正确的字段更新
   */
  it('should return nextState with updated fields', async () => {
    initialState.status = 'ACTIVE';

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '回答内容',
      isVoice: false,
    });

    expect(result.nextState).toBeDefined();
    expect(result.nextState.userId).toBe('user-123');
    expect(result.nextState.interviewId).toBe('interview-123');
    expect(result.nextState.version).toBe(1);
    expect(result.nextState.originalVersion).toBe(1);
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证状态转换结果保持了待处理的消息和回复
   */
  it('should preserve pendingMessages and pendingResponses in nextState', async () => {
    initialState.status = 'ACTIVE';
    initialState.pendingMessages = [{ role: 'user', content: 'Test', isVoice: false }];

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '回答',
      isVoice: false,
    });

    expect(result.nextState.pendingMessages).toBeDefined();
    expect(result.nextState.pendingResponses).toBeDefined();
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证当访谈结束时shouldContinue=false, response设为closing message
   */
  it('should return closing message when interview ends', async () => {
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

    vi.mocked(interviewingNode).mockResolvedValueOnce({
      currentQuestion: 4,
      responses: [{ questionId: 'q3', content: 'Final answer', isFollowup: false }],
      response: '访谈已完成，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！',
      shouldContinue: false,
    });

    initialState.status = 'ACTIVE';

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '最终回答',
      isVoice: false,
    });

    expect(result.response).toContain('访谈已完成');
    expect(result.response).toContain('一切顺利');
  });

  /**
   * @test REQ-003-8-03
   * @intent 验证空content输入时不调用interviewingNode且无error
   */
  it('should skip interviewing node when content is empty', async () => {
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '',
      isVoice: false,
    });

    expect(interviewingNode).not.toHaveBeenCalled();
    expect(result.response).toBe('开场问题');
  });

  /**
   * @test REQ-003-8-03
   * @intent 验证PENDING状态有content时只执行planningNode(Phase 1立即返回)
   */
  it('should run planning then return immediately when PENDING with content', async () => {
    const { planningNode } = await import('../src/core/nodes/planning.js');
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '我的回答',
      isVoice: false,
    });

    expect(planningNode).toHaveBeenCalled();
    expect(interviewingNode).not.toHaveBeenCalled();
    expect(result.nextState.currentQuestion).toBe(0);
  });

  /**
   * @test REQ-003-8-03
   * @intent 验证PENDING状态无content时只调用planningNode
   */
  it('should only run planning node when PENDING with no content', async () => {
    const { planningNode } = await import('../src/core/nodes/planning.js');
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '',
      isVoice: false,
    });

    expect(planningNode).toHaveBeenCalled();
    expect(interviewingNode).not.toHaveBeenCalled();
    expect(result.nextState.status).toBe('PENDING');
  });

  /**
   * @test REQ-003-8-03
   * @intent 验证CANCELLED状态被guard拦截,返回DEFAULT_CLOSING_MESSAGE
   */
  it('should skip processing for CANCELLED status', async () => {
    const { planningNode } = await import('../src/core/nodes/planning.js');
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

    const cancelledState: InterviewState = {
      ...initialState,
      status: 'CANCELLED',
    };

    const result = await runInterviewGraph(cancelledState, {
      userId: 'user-123',
      content: '不应该被处理',
      isVoice: false,
    });

    expect(planningNode).not.toHaveBeenCalled();
    expect(interviewingNode).not.toHaveBeenCalled();
    expect(result.nextState.status).toBe('CANCELLED');
    expect(result.response).toContain('访谈已结束');
  });
});
