// @ts-nocheck
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { analyzingNode } from '../src/core/nodes/analyzing.js';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import type { InterviewState } from '../src/core/types/index.js';
import { AnalysisService } from '../src/services/analysis.service.js';
import { generateSmartResponse } from '../src/services/followup.service.js';

// Mock AnalysisService
vi.mock('../src/services/analysis.service.js', () => {
  return {
    AnalysisService: class {
      async analyzeInterview(interviewId: string) {
        return {
          success: true,
          report: {
            keyFindings: [{ title: 'test', content: 'test' }],
            insights: ['test'],
            recommendations: ['test'],
            overallFeedback: 'test',
          },
          error: null,
        };
      }
    },
  };
});

// Mock FollowUp service
vi.mock('../src/services/followup.service.js', async () => {
  const actual = await vi.importActual('../src/services/followup.service.js');
  return {
    ...(actual || {}),
    generateSmartResponse: vi.fn().mockResolvedValue({
      action: 'NEXT_QUESTION',
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

    /**
     * @test REQ-003-6-01
     * @intent 验证Analyzing节点在服务异常时的回退路径
     */
    it('should handle AnalysisService error gracefully', async () => {
      // Mock the AnalysisService to throw an error
      const analyzeInterviewSpy = vi
        .spyOn(AnalysisService.prototype, 'analyzeInterview')
        .mockRejectedValue(new Error('Analysis failed'));

      const state: InterviewState = {
        ...baseState,
        interviewId: 'test-interview-id',
      };

      const result = await analyzingNode(state);

      // Verify the result is still correct despite the async error
      expect(result.status).toBe('COMPLETED');
      expect(result.reportGenerated).toBe(true);
      expect(result.response).toContain('访谈已完成');
      expect(result.shouldContinue).toBe(false);

      // Wait for the promised setImmediate to allow async error to be caught
      await new Promise(process.nextTick);

      analyzeInterviewSpy.mockRestore();
    });

    /**
     * @test REQ-003-6-01
     * @intent 验证Analyzing节点在无interviewId情况下的早期返回
     */
    it('should handle case when interviewId is undefined', async () => {
      const stateWithoutId: InterviewState = { ...baseState, interviewId: undefined };

      const result = await analyzingNode(stateWithoutId);

      expect(result.status).toBe('COMPLETED');
      expect(result.reportGenerated).toBe(false);
      expect(result.response).toBe('访谈已结束，非常感谢您拨冗参与！');
      expect(result.shouldContinue).toBe(false);
    });
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

    /**
     * @test REQ-003-5-01
     * @intent 验证Interviewing节点在generateSmartResponse失败时的错误回退路径
     */
    it('should handle generateSmartResponse service error and use fallback path', async () => {
      // Mock generateSmartResponse to throw an error
      (generateSmartResponse as any).mockRejectedValueOnce(new Error('LLM service error'));

      const result = await interviewingNode(baseState, { content: '我的回答' });

      expect(result.responses?.length ?? 0).toBeGreaterThan(0);
      expect(result.response).toBeDefined();
    });

    /**
     * @test REQ-003-5-01
     * @intent 验证当LLM回应中包含多個問題時應正確處理
     */
    it('should handle multiple questions in LLM response', async () => {
      // Mock generateSmartResponse to return multiple questions in response
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'NEXT_QUESTION',
        response: '第一个问题？第二个问题？下一个常规问题',
        shouldEndInterview: false,
      });

      const state = { ...baseState, currentQuestion: 1 }; // Second question
      const result = await interviewingNode(state, { content: '用户回应' });

      // Verify that multiple questions are detected and handled
      expect(result.responses).toHaveLength(1);
      expect(result.responses?.[0]?.content).toBe('用户回应');

      // Should split content and show only first sentence followed by the next question
      expect(result.response).toMatch(/^[^?？]*\n\n.*$/); // Contains first sentence and next question
      expect(result.shouldContinue).toBe(true);
    });

    /**
     * @test REQ-003-5-01
     * @intent 验证在LLM生成回应后但为最后一个问题时的完整闭环处理
     */
    it('should handle closing message when LLM reaches last question', async () => {
      // Mock response for last question
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'NEXT_QUESTION',
        response: '很好的总结。这是我的反馈。',
        shouldEndInterview: false,
      });

      // State at the last question (index 3 based on default template)
      const lastQuestionState = { ...baseState, currentQuestion: 3 };
      const result = await interviewingNode(lastQuestionState, { content: '最终回答' });

      // Should move to completed and provide closing message
      expect(result.responses).toHaveLength(1);
      expect(result.currentQuestion).toBe(4); // Next question index
      expect(result.shouldContinue).toBe(false);
      expect(result.response).toContain('感谢您');
    });

    /**
     * @test REQ-003-5-01
     * @intent 验证LLM明确要求结束访谈时节点的行为
     */
    it('should end interview when LLM indicates shouldEndInterview', async () => {
      // Mock with indication to end the interview
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'FINISH',
        response: '非常感谢您的分享，访谈到此结束！',
        shouldEndInterview: true,
      });

      const result = await interviewingNode(baseState, { content: '回答内容' });

      // Should end interview regardless of remaining questions
      expect(result.responses).toHaveLength(1);
      expect(result.status).toBe('COMPLETED');
      expect(result.shouldContinue).toBe(false);
      expect(result.response).toContain('访谈到此结束');
    });

    /**
     * @test REQ-003-5-01
     * @intent 验证LLM生成前言行為時節點的響應
     */
    it('should handle FOLLOWUP action from LLM', async () => {
      // Mock with followup action
      (generateSmartResponse as any).mockResolvedValueOnce({
        action: 'FOLLOWUP',
        response: '基于您的回答，请再详细说明一下...',
        shouldEndInterview: false,
      });

      const result = await interviewingNode(baseState, { content: '原始回答' });

      // Should stay at current question but increment followup counter
      expect(result.responses).toHaveLength(1);
      expect(result.followupCount).toBe(1); // Incremented followups
      expect(result.shouldContinue).toBe(true); // Keep going
      expect(result.response).toContain('详细说明');
    });
  });
});
