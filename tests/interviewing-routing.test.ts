import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import type { InterviewState } from '../src/core/types/index.js';
import { generateSmartResponse } from '../src/services/followup.service.js';
import type { SmartResponseResult } from '../src/services/followup.service.js';

/**
 * @test REQ-155-INTERVIEWING
 * @intent 覆盖 interviewing 状态机的路由分支（追问上限、提前结束、末题推进），提升变异分数
 * @covers enforceFollowupLimit 的降级、TERMINAL 分支的提前结束告警、REASK 的计数递增、NEXT 在末题的完成
 *
 * Gate M had interviewing.ts at 60.83% — passing, but with so little margin that
 * any change could drop it under the 60% threshold. The survivors clustered on
 * the routing branches: which action wins, what the pointer becomes, and whether
 * the early-end warning fires. Those are exactly the decisions this state machine
 * exists to make, so they deserve direct assertions.
 */

const mockWarn = vi.fn();
vi.mock('../src/utils/logger.js', () => ({
  warn: (...args: unknown[]) => mockWarn(...args),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockContent = {
  invitationPrompt: '欢迎参与本次访谈。',
  questions: ['问题一？', '问题二？', '问题三？'],
  closingMessage: '访谈结束，感谢参与！',
  llmPromptTemplate: '自定义提示词',
};

vi.mock('../src/core/nodes/template-utils.js', () => ({
  loadTemplateContent: vi.fn(async () => mockContent),
}));

vi.mock('../src/services/followup.service.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/followup.service.js')>(
    '../src/services/followup.service.js'
  );
  return { ...actual, generateSmartResponse: vi.fn() };
});

const mockSmart = vi.mocked(generateSmartResponse);

function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'u1',
    interviewId: 'iv-1',
    templateId: 'tpl-1',
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
    ...overrides,
  } as InterviewState;
}

function smart(overrides: Record<string, unknown> = {}): SmartResponseResult {
  return {
    response: '好的，我们继续。',
    action: 'NEXT',
    shouldProceedToNext: true,
    shouldEndInterview: false,
    ...overrides,
    // `STAY` is a value the routing table handles but `SmartResponseResult` does
    // not declare, so the cast is deliberate — see the STAY test below.
  } as SmartResponseResult;
}

async function run(s: InterviewState) {
  return interviewingNode(s, { content: '我的回答' });
}

describe('interviewing routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmart.mockResolvedValue(smart());
  });

  describe('follow-up cap', () => {
    it('re-asks the current question and burns a follow-up slot', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'FOLLOWUP', response: '能具体说说吗？' }));

      const result = await run(state({ currentQuestion: 1, followupCount: 0 }));

      expect(result.currentQuestion).toBe(1);
      expect(result.followupCount).toBe(1);
      expect(result.shouldContinue).toBe(true);
    });

    it('degrades an over-limit FOLLOWUP into advancing', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'FOLLOWUP', response: '还能再说说吗？' }));

      // maxFollowups 2, followupCount 2 -> the cap is already reached.
      const result = await run(state({ currentQuestion: 0, followupCount: 2 }));

      expect(result.currentQuestion).toBe(1);
      expect(result.followupCount).toBe(0);
    });

    it('lets STAY re-ask even past the cap', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'STAY', response: '请再多说一些。' }));

      const result = await run(state({ currentQuestion: 0, followupCount: 5 }));

      // STAY means "wait for the user", so the cap does not apply.
      expect(result.currentQuestion).toBe(0);
      expect(result.followupCount).toBe(6);
    });
  });

  describe('ending early', () => {
    it('warns when the user ends before the last question and keeps the pointer', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'END', response: '明白了。' }));

      const result = await run(state({ currentQuestion: 0 }));

      expect(result.status).toBe('COMPLETED');
      expect(result.currentQuestion).toBe(0);
      expect(result.shouldContinue).toBe(false);
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('end interview early'),
        expect.objectContaining({ currentQ: 0, totalQuestions: 3, remainingQuestions: 2 })
      );
    });

    it('does not warn when ending on the last question', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'END', response: '我这边说完了，谢谢。' }));

      await run(state({ currentQuestion: 2 }));

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('counts remaining questions correctly mid-interview', async () => {
      mockSmart.mockResolvedValue(smart({ action: 'END', response: '先到这吧。' }));

      await run(state({ currentQuestion: 1 }));

      expect(mockWarn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ remainingQuestions: 1 })
      );
    });
  });

  describe('advancing', () => {
    it('moves to the next question and resets the follow-up counter', async () => {
      const result = await run(state({ currentQuestion: 0, followupCount: 2 }));

      expect(result.currentQuestion).toBe(1);
      expect(result.followupCount).toBe(0);
      expect(result.shouldContinue).toBe(true);
    });

    it('completes the interview when advancing past the last question', async () => {
      const result = await run(state({ currentQuestion: 2 }));

      expect(result.status).toBe('COMPLETED');
      expect(result.shouldContinue).toBe(false);
      expect(result.currentQuestion).toBe(3);
    });
  });

  describe('prompt arguments', () => {
    it('tells the model this is the last question only on the final one', async () => {
      await run(state({ currentQuestion: 0 }));
      expect(mockSmart.mock.calls[0]?.[5]).toBe(false);

      mockSmart.mockClear();
      await run(state({ currentQuestion: 2 }));
      expect(mockSmart.mock.calls[0]?.[5]).toBe(true);
    });

    it('passes the question count and the template prompt through', async () => {
      await run(state({ currentQuestion: 1 }));

      const args = mockSmart.mock.calls[0];
      expect(args?.[2]).toBe('问题二？');
      expect(args?.[3]).toBe('问题三？');
      expect(args?.[4]).toBe('自定义提示词');
      expect(args?.[6]).toBe(3);
    });

    it('passes the previous question when on the final one', async () => {
      await run(state({ currentQuestion: 2 }));

      const args = mockSmart.mock.calls[0];
      expect(args?.[2]).toBe('问题三？');
      expect(args?.[3]).toBeUndefined();
    });
  });

  describe('fallback when the model call fails', () => {
    it('advances to the next question', async () => {
      mockSmart.mockRejectedValue(new Error('LLM unavailable'));

      const result = await run(state({ currentQuestion: 0 }));

      expect(result.currentQuestion).toBe(1);
      expect(result.shouldContinue).toBe(true);
      expect(result.response).toBe('问题二？');
    });

    it('closes the interview on the final question', async () => {
      mockSmart.mockRejectedValue(new Error('LLM unavailable'));

      const result = await run(state({ currentQuestion: 2 }));

      expect(result.shouldContinue).toBe(false);
      expect(result.response).toBe('访谈结束，感谢参与！');
    });
  });
});
