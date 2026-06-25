import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import type { InterviewState } from '../src/core/types/index.js';
import { generateSmartResponse } from '../src/services/followup.service.js';

// Mock FollowUp service
vi.mock('../src/services/followup.service.js', async () => {
  const actual = await vi.importActual('../src/services/followup.service.js');
  return {
    ...(actual || {}),
    generateSmartResponse: vi.fn().mockResolvedValue({
      action: 'NEXT',
      response: 'Next question',
      shouldEndInterview: false,
    }),
  };
});

// Mock TemplateRepository
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

describe('Core Nodes Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('interviewingNode', () => {
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

    it('should handle generateSmartResponse service error and use fallback path', async () => {
      (generateSmartResponse as any).mockRejectedValueOnce(new Error('LLM service error'));

      const result = await interviewingNode(baseState, { content: '我的回答' });

      expect(result.responses?.length ?? 0).toBeGreaterThan(0);
      expect(result.response).toBeDefined();
    });

    it('should handle closing message when LLM reaches last question', async () => {
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'NEXT',
        response: '很好的总结。这是我的反馈。',
        shouldEndInterview: false,
      });

      const lastQuestionState = { ...baseState, currentQuestion: 3 };
      const result = await interviewingNode(lastQuestionState, { content: '最终回答' });

      expect(result.responses).toHaveLength(1);
      expect(result.currentQuestion).toBe(4);
      expect(result.shouldContinue).toBe(false);
      expect(result.response).toContain('感谢您');
    });

    it('should end interview when LLM indicates shouldEndInterview', async () => {
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'FINISH',
        response: '非常感谢您的分享，访谈到此结束！',
        shouldEndInterview: true,
      });

      const result = await interviewingNode(baseState, { content: '回答内容' });

      expect(result.responses).toHaveLength(1);
      expect(result.status).toBe('COMPLETED');
      expect(result.shouldContinue).toBe(false);
      expect(result.response).toContain('访谈到此结束');
    });

    it('should handle FOLLOWUP action from LLM', async () => {
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'FOLLOWUP',
        response: '基于您的回答，请再详细说明一下...',
        shouldEndInterview: false,
      });

      const result = await interviewingNode(baseState, { content: '原始回答' });

      expect(result.responses).toHaveLength(1);
      expect(result.followupCount).toBe(1);
      expect(result.shouldContinue).toBe(true);
      expect(result.response).toContain('详细说明');
    });

    it('should handle STAY action from LLM', async () => {
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'STAY',
        response: '请继续说明您的想法。',
        shouldEndInterview: false,
      });

      const result = await interviewingNode(baseState, { content: '部分回答' });

      expect(result.responses).toHaveLength(1);
      expect(result.followupCount).toBe(1);
      expect(result.shouldContinue).toBe(true);
      expect(result.response).toBe('请继续说明您的想法。');
    });
  });
});
