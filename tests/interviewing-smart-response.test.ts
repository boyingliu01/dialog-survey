import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import type { InterviewState } from '../src/core/types/index.js';

vi.mock('../src/services/followup.service.js', () => ({
  generateSmartResponse: vi.fn(),
}));

vi.mock('../src/repositories/template.repository.js', () => {
  const MockTemplateRepository = class {
    findById = vi.fn().mockResolvedValue(null);
    findAll = vi.fn().mockResolvedValue([]);
  };
  return { TemplateRepository: MockTemplateRepository };
});

describe('interviewingNode - Smart Response Branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockState = (currentQuestion: number, followupCount = 0): InterviewState => ({
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
    status: 'ACTIVE',
    messages: [
      { role: 'assistant', content: '欢迎参与访谈' },
      { role: 'user', content: '你好' },
    ],
    currentQuestion,
    followupCount,
    maxFollowups: 2,
    responses: [],
    reportGenerated: false,
    version: 1,
    originalVersion: 1,
    pendingMessages: [],
    pendingResponses: [],
  });

  describe('NEXT action', () => {
    /**
     * @test REQ-005-5-04
     * @intent 验证当智能响应系统返回NEXT动作时，应推进到下一个问题，确保访谈按预期继续
     */
    it('should proceed to next question when action is NEXT', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '感谢分享！',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const result = await interviewingNode(createMockState(0), {
        content: '我在科技公司工作了5年',
      });

      expect(result.currentQuestion).toBe(1);
      expect(result.shouldContinue).toBe(true);
      expect(result.response).toContain('感谢分享！');
    });

    /**
     * @test REQ-005-5-04
     * @intent 验证在最后一个问题时NEXT动作将完成整个访谈，确保访谈流程按照预期结束
     */
    it('should complete interview on last question with NEXT', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '感谢参与！',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const result = await interviewingNode(createMockState(3), {
        content: '我的职业规划',
      });

      expect(result.currentQuestion).toBe(4);
      expect(result.shouldContinue).toBe(false);
    });
  });

  describe('FOLLOWUP action', () => {
    it('should stay on current question and increment followupCount', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '可以详细说明一下吗？',
        action: 'FOLLOWUP',
        shouldProceedToNext: false,
        shouldEndInterview: false,
      });

      const result = await interviewingNode(createMockState(0, 0), {
        content: '我做了一些项目',
      });

      expect(result.followupCount).toBe(1);
      expect(result.shouldContinue).toBe(true);
      expect(result.response).toBe('可以详细说明一下吗？');
    });

    it('should proceed to next question when followup limit exceeded', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '感谢回答，继续下一题。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const result = await interviewingNode(createMockState(0, 2), {
        content: '简单的回答',
      });

      expect(result.currentQuestion).toBe(1);
      expect(result.shouldContinue).toBe(true);
    });
  });

  describe('END action', () => {
    it('should set status to COMPLETED and end interview', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '感谢参与，访谈结束。',
        action: 'END',
        shouldProceedToNext: false,
        shouldEndInterview: true,
      });

      // Must be on last question for END to take effect
      const result = await interviewingNode(createMockState(3), {
        content: '我想结束访谈',
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.shouldContinue).toBe(false);
      // END response now includes closingMessage appended (fix for #104)
      expect(result.response).toContain('感谢参与，访谈结束。');
    });
  });

  describe('STAY action', () => {
    it('should stay on current question and increment followupCount', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '我理解您的疑惑，让我解释一下...',
        action: 'STAY',
        shouldProceedToNext: false,
        shouldEndInterview: false,
      });

      const result = await interviewingNode(createMockState(0, 0), {
        content: '我不太理解这个问题',
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.response).toBe('我理解您的疑惑，让我解释一下...');
      expect(result.followupCount).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should fallback to next question on error', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockRejectedValue(new Error('LLM error'));

      const result = await interviewingNode(createMockState(0), {
        content: '回答',
      });

      expect(result.currentQuestion).toBe(1);
      expect(result.shouldContinue).toBe(true);
    });

    it('should fallback to completion message on last question error', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockRejectedValue(new Error('LLM error'));

      const result = await interviewingNode(createMockState(3), {
        content: '回答',
      });

      expect(result.shouldContinue).toBe(false);
      expect(result.response).toContain('访谈已');
    });
  });

  describe('Response accumulation', () => {
    it('should accumulate responses correctly', async () => {
      const { generateSmartResponse } = await import('../src/services/followup.service.js');
      vi.mocked(generateSmartResponse).mockResolvedValue({
        response: '感谢！',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      });

      const stateWithResponses = createMockState(1);
      stateWithResponses.responses = [{ questionId: 'q0', content: '回答1', isFollowup: false }];

      const result = await interviewingNode(stateWithResponses, {
        content: '回答2',
      });

      expect(result.responses).toHaveLength(2);
    });
  });
});
