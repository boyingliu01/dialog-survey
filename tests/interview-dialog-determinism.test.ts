import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviewingNode } from '../src/core/nodes/interviewing.js';
import type { InterviewState } from '../src/core/types/index.js';
import { resultFromParsed, stripExtraQuestions } from '../src/services/followup.service.js';

/**
 * @test REQ-203a
 * @intent 验证三处确定性对话缺陷：每轮只问一个问题、END 覆盖 NEXT 时不承诺未兑现的问题、追问回答被正确标记
 * @covers stripExtraQuestions 接入两条 LLM 路径、routeAction 结束时文案与状态一致、isFollowup/followupDepth 按实际轮次写入
 *
 * Each of these produced a visible contradiction between what the bot said and
 * what it did next. They are deterministic — no LLM quality judgement involved —
 * which is why they are fixed and pinned separately from the conversation-quality
 * work in #203b.
 */

const mockSmart = vi.fn();

vi.mock('../src/services/followup.service.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/followup.service.js')>(
    '../src/services/followup.service.js'
  );
  return { ...actual, generateSmartResponse: (...args: unknown[]) => mockSmart(...args) };
});

const mockContent = {
  invitationPrompt: '欢迎参与本次访谈。',
  questions: ['问题一？', '问题二？', '问题三？'],
  closingMessage: '访谈结束，感谢参与！',
};

vi.mock('../src/core/nodes/template-utils.js', () => ({
  loadTemplateContent: vi.fn(async () => mockContent),
}));

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

function smart(overrides: Record<string, unknown> = {}) {
  return {
    response: '好的，那我们继续。',
    action: 'NEXT',
    shouldProceedToNext: true,
    shouldEndInterview: false,
    ...overrides,
  };
}

describe('one question per turn', () => {
  it('keeps only the first question when the model returns several', () => {
    const text = '那我们聊下一个话题：你觉得测试覆盖重要吗？另外你怎么看自动化？';

    expect(stripExtraQuestions(text)).toBe('那我们聊下一个话题：你觉得测试覆盖重要吗？');
  });

  it('leaves a single-question reply untouched', () => {
    const text = '好的。你觉得这个流程顺畅吗？';

    expect(stripExtraQuestions(text)).toBe(text);
  });

  it('leaves a statement with no question mark untouched', () => {
    const text = '感谢您的回答，我们继续下一个话题。';

    expect(stripExtraQuestions(text)).toBe(text);
  });

  it('applies the rule on the parsed path', () => {
    const result = resultFromParsed(
      {
        response: '好的。第一问？第二问？第三问？',
        action: 'NEXT',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      0,
      2,
      '下一题？'
    );

    expect(result.response).toBe('好的。第一问？');
  });

  /**
   * The follow-up branch is deliberately exempt: a re-asked question is one
   * question by construction, and trimming it risks cutting a summary sentence
   * that happens to contain a question mark in half.
   */
  it('does not trim a follow-up reply', () => {
    const text = '我理解您的意思。能再多说说吗？为什么？';
    const result = resultFromParsed(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { response: text, action: 'FOLLOWUP' } as any,
      0,
      2,
      '下一题？'
    );

    expect(result.response).toBe(text);
  });
});

describe('ending copy never promises a question that is not asked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not lead into the closing with a transition when shouldEndInterview overrides NEXT', async () => {
    mockSmart.mockResolvedValue(
      smart({
        // The model wanted to move on, but the end flag overrides it.
        action: 'NEXT',
        shouldEndInterview: true,
        response: '好，那我们聊聊下一个话题：关于流程。',
      })
    );

    const result = await interviewingNode(state(), { content: '我的回答' });

    expect(result.status).toBe('COMPLETED');
    // The announced next question is never asked, so it must not be announced.
    expect(result.response).not.toContain('下一个话题');
    expect(result.response).toContain('访谈结束，感谢参与！');
  });

  it('keeps the model lead-in when it genuinely chose to end', async () => {
    mockSmart.mockResolvedValue(
      smart({
        action: 'END',
        shouldEndInterview: true,
        response: '感谢您的坦诚分享。',
      })
    );

    const result = await interviewingNode(state(), { content: '我的回答' });

    expect(result.status).toBe('COMPLETED');
    expect(result.response).toContain('感谢您的坦诚分享。');
    expect(result.response).toContain('访谈结束，感谢参与！');
  });

  it('keeps the wrap-up text when NEXT finishes the final question', async () => {
    mockSmart.mockResolvedValue(smart({ response: '好，最后一个话题也聊完了。' }));

    const result = await interviewingNode(state({ currentQuestion: 2 }), {
      content: '最后一题的回答',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.response).toContain('好，最后一个话题也聊完了。');
    expect(result.response).toContain('访谈结束，感谢参与！');
  });
});

describe('follow-up answers are marked as such', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a first answer as depth 0', async () => {
    mockSmart.mockResolvedValue(smart());

    const result = await interviewingNode(state(), { content: '我的回答' });
    const entry = result.responses?.[0];

    expect(entry?.isFollowup).toBe(false);
    expect(entry?.followupDepth).toBe(0);
  });

  it('records an answer to a re-asked question as a follow-up with its depth', async () => {
    mockSmart.mockResolvedValue(smart());
    // followupCount 1 means the previous turn re-asked the question.
    const result = await interviewingNode(state({ followupCount: 1 }), {
      content: '补充说明',
    });
    const entry = result.responses?.[0];

    expect(entry?.isFollowup).toBe(true);
    expect(entry?.followupDepth).toBe(1);
  });

  it('tracks the depth of a second follow-up', async () => {
    mockSmart.mockResolvedValue(smart());
    const result = await interviewingNode(state({ followupCount: 2 }), {
      content: '再补充一句',
    });

    expect(result.responses?.[0]?.followupDepth).toBe(2);
  });
});
