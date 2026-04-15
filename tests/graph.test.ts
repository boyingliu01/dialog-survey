import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { runInterviewGraph } from '../src/core/graph.js';

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

vi.mock('../src/core/nodes/analyzing.js', () => ({
  analyzingNode: vi.fn().mockResolvedValue({
    status: 'COMPLETED',
    reportGenerated: true,
  }),
}));

vi.mock('../src/core/nodes/completed.js', () => ({
  completedNode: vi.fn().mockResolvedValue(undefined),
}));

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
   * @intent 验证当访谈结束时执行分析节点和完成节点的状态机边条件
   */
  it('should run analyzing and completed nodes when interview ends', async () => {
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');
    const { analyzingNode } = await import('../src/core/nodes/analyzing.js');
    const { completedNode } = await import('../src/core/nodes/completed.js');

    vi.mocked(interviewingNode).mockResolvedValueOnce({
      currentQuestion: 4,
      responses: [{ questionId: 'q3', content: 'Final answer', isFollowup: false }],
      response: '访谈已完成，感谢您的参与！',
      shouldContinue: false,
    });

    initialState.status = 'ACTIVE';

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '最终回答',
      isVoice: false,
    });

    expect(analyzingNode).toHaveBeenCalled();
    expect(completedNode).toHaveBeenCalled();
    expect(result.nextState.status).toBe('COMPLETED');
    expect(result.nextState.reportGenerated).toBe(true);
  });

  /**
   * @test REQ-003-8-02
   * @intent 验证在分析完成后，如果不是COMPLETED状态则不会运行完成节点的状态机边条件
   */
  it('should not run completed node if status is not COMPLETED after analyzing', async () => {
    const { interviewingNode } = await import('../src/core/nodes/interviewing.js');
    const { analyzingNode } = await import('../src/core/nodes/analyzing.js');
    const { completedNode } = await import('../src/core/nodes/completed.js');

    vi.mocked(interviewingNode).mockResolvedValueOnce({
      currentQuestion: 3,
      responses: [],
      response: 'No more questions',
      shouldContinue: false,
    });

    vi.mocked(analyzingNode).mockResolvedValueOnce({
      status: 'WAITING',
      reportGenerated: false,
    });

    initialState.status = 'ACTIVE';

    const result = await runInterviewGraph(initialState, {
      userId: 'user-123',
      content: '回答',
      isVoice: false,
    });

    expect(analyzingNode).toHaveBeenCalled();
    expect(completedNode).not.toHaveBeenCalled();
    expect(result.nextState.status).toBe('WAITING');
  });
});
