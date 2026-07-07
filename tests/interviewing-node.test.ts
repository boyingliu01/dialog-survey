import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import { DEFAULT_CLOSING_MESSAGE, type InterviewState } from '../src/core/types/index.js';
import { generateSmartResponse } from '../src/services/followup.service.js';

vi.mock('../src/services/followup.service.js', () => ({
  generateSmartResponse: vi.fn(),
  isFollowupNeeded: vi.fn().mockResolvedValue(false),
  generateFollowup: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/repositories/template.repository.js', () => {
  return {
    TemplateRepository: class {
      async findById() {
        return null;
      }
      async findAll() {
        return [];
      }
    },
  };
});

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
    nudgeCount: 0,
  };

  /**
   * @test REQ-003-5-01
   * @intent 验证Interviewing节点添加响应并移动到下一问题的功能
   */
  it('should add response and move to next question', async () => {
    const result = await interviewingNode(baseState, { content: '我的回答' });

    expect(result.responses).toBeDefined();
    expect(result.responses).toHaveLength(1);
    const firstResponse = result.responses?.[0];
    expect(firstResponse?.questionId).toBe('q0');
    expect(firstResponse?.content).toBe('我的回答');
    expect(firstResponse?.isFollowup).toBe(false);
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
    expect(result.response).toBe(DEFAULT_CLOSING_MESSAGE);
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
    const firstResponse = result.responses?.[0];
    const secondResponse = result.responses?.[1];
    expect(firstResponse?.questionId).toBe('q0');
    expect(secondResponse?.questionId).toBe('q1');
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

  /**
   * @test REQ-003-5-02
   * @intent 验证handleSmartResult shouldEndInterview=true → status COMPLETED, shouldContinue false, has response
   */
  it('should end interview when smart response indicates shouldEndInterview', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的参与，访谈到此结束。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: true,
    });

    // Must be on last question for END to take effect
    const lastState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastState, { content: '我的回答' });

    expect(result.status).toBe('COMPLETED');
    expect(result.shouldContinue).toBe(false);
    expect(result.response).toContain('感谢您的参与，访谈到此结束。');
    expect(result.response).toContain('访谈已');
    expect(result.responses).toBeDefined();
    expect(result.responses).toHaveLength(1);
  });

  /**
   * @test REQ-003-5-02
   * @intent 验证handleSmartResult action=FOLLOWUP → followupCount incremented, shouldContinue true
   */
  it('should increment followupCount when smart response action is FOLLOWUP', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '您能再详细说明一下吗？',
      action: 'FOLLOWUP',
      shouldProceedToNext: false,
      shouldEndInterview: false,
    });

    const result = await interviewingNode(baseState, { content: '简短回答' });

    expect(result.followupCount).toBe(1);
    expect(result.shouldContinue).toBe(true);
    expect(result.response).toBe('您能再详细说明一下吗？');
  });

  /**
   * @test REQ-003-5-02
   * @intent 验证handleSmartResult action=STAY → responses preserved, shouldContinue true, no currentQuestion change
   */
  it('should preserve responses and stay on current question when smart response action is STAY', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '请继续补充您的想法。',
      action: 'STAY' as 'NEXT' | 'FOLLOWUP' | 'END',
      shouldProceedToNext: false,
      shouldEndInterview: false,
    });

    const result = await interviewingNode(baseState, { content: '部分回答' });

    expect(result.responses).toBeDefined();
    expect(result.responses).toHaveLength(1);
    expect(result.shouldContinue).toBe(true);
    expect(result.response).toBe('请继续补充您的想法。');
    // STAY now emits currentQuestion explicitly (0), fixing bug C-1a
    expect(result.currentQuestion).toBe(0);
  });

  /**
   * @test REQ-003-5-03
   * @intent 验证containsMultipleQuestions → when smart response has 2+ question marks, verify it strips to first sentence + appends next question
   */
  it('should strip extra questions when LLM response contains multiple question marks', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '您觉得这个挑战大吗？具体是什么挑战？您能描述一下吗？',
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const state = { ...baseState, currentQuestion: 0 };
    const result = await interviewingNode(state, { content: '遇到了很多挑战' });

    expect(result.currentQuestion).toBe(1);
    expect(result.shouldContinue).toBe(true);
    expect(result.response).toContain('您觉得这个挑战大吗');
    // NEXT response should NOT contain next question (LLM handles the transition)
    expect(result.response).not.toContain('您在工作中遇到过最大的挑战是什么');
  });

  /**
   * @test REQ-003-5-04
   * @intent 验证buildFallbackResponse error path → mock generateSmartResponse to throw, verify fallback returns next question
   */
  it('should fallback to next question when generateSmartResponse throws', async () => {
    vi.mocked(generateSmartResponse).mockRejectedValueOnce(new Error('LLM service unavailable'));

    const result = await interviewingNode(baseState, { content: '我的回答' });

    expect(result.responses).toHaveLength(1);
    expect(result.currentQuestion).toBe(1);
    expect(result.shouldContinue).toBe(true);
    expect(result.response).toBe('您在工作中遇到过最大的挑战是什么？');
  });

  /**
   * @test REQ-003-5-04
   * @intent 验证buildFallbackResponse last question → mock smart response to throw on last question, verify closing message
   */
  it('should return closing message when fallback on last question', async () => {
    vi.mocked(generateSmartResponse).mockRejectedValueOnce(new Error('LLM service unavailable'));

    const lastState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastState, { content: '最后回答' });

    expect(result.responses).toHaveLength(1);
    expect(result.currentQuestion).toBe(4);
    expect(result.shouldContinue).toBe(false);
    expect(result.response).toBe(DEFAULT_CLOSING_MESSAGE);
  });

  /**
   * @test REQ-003-5-05
   * @intent 验证Interviewing节点在最后问题有closingMessage时返回自定义closing
   */
  it('should return custom closing message when on last question with closingMessage', async () => {
    const { TemplateRepository } = await import('../src/repositories/template.repository.js');
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的详细回答。',
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    // Mock TemplateRepository to return a template with custom closingMessage
    const MockRepo = TemplateRepository as unknown as {
      new (...args: unknown[]): { findById: ReturnType<typeof vi.fn> };
    };
    const originalFindById = MockRepo.prototype.findById;
    MockRepo.prototype.findById = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        name: 'Custom Template',
        questions: ['问题1'],
        closingMessage: '自定义的结束语，谢谢您的参与！',
      }),
    });

    const mockPrisma = {} as unknown as import('@prisma/client').PrismaClient;
    const state = { ...baseState, templateId: 'custom-template', currentQuestion: 0 };
    const result = await interviewingNode(state, { content: '回答', prisma: mockPrisma });

    expect(result.currentQuestion).toBe(1);
    expect(result.shouldContinue).toBe(false);
    expect(result.response).toContain('感谢您的详细回答。');
    expect(result.response).toContain('自定义的结束语，谢谢您的参与！');

    // Restore original mock
    MockRepo.prototype.findById = originalFindById;
  });

  it('should force NEXT when LLM returns END prematurely (not last question)', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的参与，访谈到此结束。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: true,
    });

    // 4 questions (indices 0-3), currentQuestion=1 is NOT the last
    const multiState = { ...baseState, currentQuestion: 1 };
    const result = await interviewingNode(multiState, { content: '我的回答' });

    // END on non-last question → interview completes (user said goodbye)
    expect(result.status).toBe('COMPLETED');
    expect(result.shouldContinue).toBe(false);
    expect(result.currentQuestion).toBe(1);
    expect(result.followupCount).toBe(0);
    expect(result.response).toContain('感谢您的参与');
  });

  it('should allow END on the actual last question', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的参与，访谈到此结束。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: true,
    });

    // 4 questions (indices 0-3), currentQuestion=3 IS the last
    const lastState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastState, { content: '最后回答' });

    expect(result.status).toBe('COMPLETED');
    expect(result.shouldContinue).toBe(false);
    expect(result.response).toContain('感谢您的参与');
  });

  it('should force NEXT when action is END explicitly on non-last question', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '我觉得访谈到此为止吧。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: false,
    });

    const multiState = { ...baseState, currentQuestion: 0 };
    const result = await interviewingNode(multiState, { content: '回答' });

    // END on non-last question → interview completes (user said goodbye)
    expect(result.status).toBe('COMPLETED');
    expect(result.shouldContinue).toBe(false);
    expect(result.currentQuestion).toBe(0);
  });

  /**
   * @test #131-T5
   * @intent FOLLOWUP force-converted to NEXT (followup limit exceeded) should NOT have
   *        nextQuestion text mixed into the response. The safety net replaces the LLM's
   *        follow-up text with a generic transition. routeAction appends nextQuestion.
   */
  it('#131: should use safety net transition when FOLLOWUP is forced to NEXT', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '好的，关于这个话题我们已经聊得比较深入了。我们继续看下一个问题。',
      action: 'NEXT', // pre-converted by safety net in generateSmartResponse
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const state = { ...baseState, followupCount: 2 };
    const result = await interviewingNode(state, { content: '简短回答' });

    // safety net response ONLY — no next question appended (LLM handles transition)
    expect(result.response).toContain('我们继续看下一个问题');
    expect(result.response).not.toContain('您在工作中遇到过最大的挑战是什么');
    expect(result.currentQuestion).toBe(1);
    expect(result.followupCount).toBe(0);
    expect(result.shouldContinue).toBe(true);
  });

  /**
   * @test #131-T4
   * @intent END on last question: LLM farewell + system closingMessage is acceptable
   *        (routeAction line 58 appends closing). This is NOT the #131 bug path.
   */
  it('#131: should keep closingMessage concatenation on END + last question', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '非常感谢您的参与，您的分享很有价值。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: true,
    });

    const lastState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastState, { content: '最后回答' });

    expect(result.status).toBe('COMPLETED');
    expect(result.shouldContinue).toBe(false);
    expect(result.response).toContain('非常感谢您的参与');
    expect(result.response).toContain(DEFAULT_CLOSING_MESSAGE);
  });

  /**
   * @test #131-T3
   * @intent NEXT on last question: LLM farewell + system closingMessage is acceptable
   *        (routeAction line 90 appends closing). This is NOT the #131 bug path.
   */
  it('#131: should keep closingMessage concatenation on NEXT + last question', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的分享，访谈到此结束。',
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const lastState = { ...baseState, currentQuestion: 3 };
    const result = await interviewingNode(lastState, { content: '最后回答' });

    expect(result.shouldContinue).toBe(false);
    expect(result.response).toContain(DEFAULT_CLOSING_MESSAGE);
  });

  /**
   * @test #131-T1
   * @intent NEXT on non-last question: should ONLY return LLM transition text,
   *        NOT append nextQuestion (that was the bug — LLM handles the transition)
   */
  it('#131: NEXT should NOT append nextQuestion (LLM handles natural transition)', async () => {
    vi.mocked(generateSmartResponse).mockResolvedValueOnce({
      response: '感谢您的分享，您提到了工作中的一些挑战。',
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const result = await interviewingNode(baseState, { content: '我的回答' });

    expect(result.currentQuestion).toBe(1);
    expect(result.response).toContain('感谢您的分享');
    // The response should NOT contain the next question text (LLM handles transition)
    expect(result.response).not.toContain('您在工作中遇到过最大的挑战是什么');
    // Only LLM's own text, no extra question appended
    expect(result.response).toBe('感谢您的分享，您提到了工作中的一些挑战。');
  });
});
