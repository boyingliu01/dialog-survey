import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import { promptService } from '../src/services/prompt.service.js';

/**
 * @test REQ-203b
 * @intent 修复 #203：追问上限两条强制路径的「回复/题目错位」，并为 NEXT 切题补上程序化承接保障
 * @covers resultFromParsed 上限降级文案、routeAction 上限降级的文案与题目一致性、无承接 NEXT 的补接、双问号硬保障、编造细节的提示词约束
 *
 * The real 12-question interview that produced this issue showed two families of
 * defect. The first is deterministic: `routeAction` coerced an over-limit
 * FOLLOWUP into NEXT but kept the model's follow-up wording, so the interviewee
 * was shown a question about the OLD topic while the pointer had already moved to
 * the new one — their next answer was filed under the wrong question (#200
 * family). `routeAction` is the last word before the turn is persisted, so these
 * assertions pin the pairing there, not just in the service that feeds it.
 *
 * The second is model behaviour: 6 of 11 NEXT turns had no acknowledgement of the
 * previous answer at all, one reply carried two question marks, and one follow-up
 * invented details the interviewee never mentioned. The prompt was strengthened,
 * but the two hard guarantees asserted here are programmatic: at most one question
 * mark per reply, and a NEXT that is *only* the next question always gets a
 * neutral lead-in.
 */

const mockChat = vi.fn();
const mockInfo = vi.fn();
const mockWarn = vi.fn();

vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: { fromEnv: () => ({ chat: mockChat }) },
  DEFAULT_MODEL: 'test-model',
}));

vi.mock('../src/utils/logger.js', () => ({
  info: (...a: unknown[]) => mockInfo(...a),
  warn: (...a: unknown[]) => mockWarn(...a),
  error: vi.fn(),
  debug: vi.fn(),
}));

// The real prompt service is kept: the default path must render the real
// template so the strengthened requirements are covered by these tests rather
// than mocked away.
const mockContent = {
  invitationPrompt: '欢迎参与本次访谈。',
  questions: ['问题一？', '问题二？', '问题三？'],
  closingMessage: '访谈结束，感谢参与！',
};

vi.mock('../src/core/nodes/template-utils.js', () => ({
  loadTemplateContent: vi.fn(async () => mockContent),
}));

// `generateSmartResponse` is wrapped, not replaced: by default it calls the real
// implementation (so the custom/default prompt paths are exercised for real), and
// the node-level tests override the behaviour for one exact turn each.
const mockStubGeneration = vi.fn();
vi.mock('../src/services/followup.service.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/followup.service.js')>(
    '../src/services/followup.service.js'
  );
  return {
    ...actual,
    generateSmartResponse: (...args: unknown[]) =>
      mockStubGeneration.getMockImplementation()
        ? mockStubGeneration(...args)
        : (actual.generateSmartResponse as (...a: unknown[]) => unknown)(...args),
  };
});

const followup = await import('../src/services/followup.service.js');
const {
  generateSmartResponse,
  resultFromParsed,
  stripExtraQuestions,
  addContinuityLeadIn,
  MAX_QUESTION_MARKS,
  FORCED_NEXT_LEAD_IN,
} = followup;

/** The node under test, imported after the mock above is registered. */
const { interviewingNode } = await import('../src/core/nodes/interviewing.js');

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

function replyWith(payload: Record<string, unknown>): void {
  mockChat.mockResolvedValue({ content: JSON.stringify(payload) });
}

/** How many question marks a piece of text carries. */
function questionMarkCount(text: string): number {
  return (text.match(/[?？]/g) ?? []).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to "call the real implementation" for the next test.
  mockStubGeneration.mockReset();
});

describe('#203 FOLLOWUP→NEXT coercion: reply and question index describe the same question', () => {
  describe('custom-prompt path', () => {
    it('returns the forced transition naming the next question, never the follow-up wording', async () => {
      // The model wanted one more follow-up on 问题一 at the cap.
      replyWith({ action: 'FOLLOWUP', response: '关于这一点，能再举个具体例子吗？' });

      const result = await generateSmartResponse(
        state({ currentQuestion: 0, followupCount: 2, maxFollowups: 2 }),
        '我的回答',
        '问题一？',
        '问题二？',
        '自定义模板：{{userAnswer}}'
      );

      expect(result.action).toBe('NEXT');
      // The reply describes the question the pointer is about to move to...
      expect(result.response).toContain('问题二？');
      // ...and no longer re-asks the question the pointer is leaving.
      expect(result.response).not.toContain('能再举个具体例子吗');
      expect(result.response).not.toContain('问题一？');
    });

    it('pins the coercion on the pure conversion used by both paths', () => {
      const capped = resultFromParsed(
        { thinking: '', strategy: 1, action: 'FOLLOWUP', response: '能再具体说说吗？' },
        2,
        2,
        '问题二？'
      );

      expect(capped.action).toBe('NEXT');
      expect(capped.response).toContain('问题二？');
      expect(capped.response).not.toContain('能再具体说说吗');
    });
  });

  describe('routeAction coercion (last word before persistence)', () => {
    function smartPayload(overrides: Record<string, unknown>) {
      return {
        response: '好的，我们继续。',
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
        ...overrides,
      };
    }

    it('never pairs an over-limit FOLLOWUP reply with the advanced question index', async () => {
      mockStubGeneration.mockResolvedValue(
        smartPayload({
          action: 'FOLLOWUP',
          // Text written for the OLD question; the pointer will move to 问题二.
          response: '关于问题一，您能再展开讲讲当时的场景吗？',
          shouldProceedToNext: false,
        })
      );

      const result = await interviewingNode(
        state({ currentQuestion: 0, followupCount: 2, maxFollowups: 2 }),
        { content: '我的回答' }
      );

      // The pointer advanced...
      expect(result.currentQuestion).toBe(1);
      expect(result.followupCount).toBe(0);
      // ...so the reply must be about the question now being asked.
      expect(result.response).toContain('问题二？');
      expect(result.response).not.toContain('当时的场景');
    });

    it('completes instead of advancing past the end when an over-limit FOLLOWUP is coerced on the last question', async () => {
      mockStubGeneration.mockResolvedValue(
        smartPayload({
          action: 'FOLLOWUP',
          response: '关于问题三，能再补充一点吗？',
          shouldProceedToNext: false,
        })
      );

      const result = await interviewingNode(
        state({ currentQuestion: 2, followupCount: 2, maxFollowups: 2 }),
        { content: '我的回答' }
      );

      expect(result.shouldContinue).toBe(false);
      expect(result.status).toBe('COMPLETED');
      expect(result.response).toBe(mockContent.closingMessage);
      expect(result.response).not.toContain('能再补充一点吗');
    });

    it('leaves a below-cap FOLLOWUP untouched', async () => {
      mockStubGeneration.mockResolvedValue(
        smartPayload({
          action: 'FOLLOWUP',
          response: '关于问题一，您能再展开讲讲当时的场景吗？',
          shouldProceedToNext: false,
        })
      );

      const result = await interviewingNode(
        state({ currentQuestion: 0, followupCount: 0, maxFollowups: 2 }),
        { content: '我的回答' }
      );

      expect(result.currentQuestion).toBe(0);
      expect(result.response).toBe('关于问题一，您能再展开讲讲当时的场景吗？');
    });
  });
});

describe('#203 one question per turn is enforced on both prompt paths', () => {
  it('custom-prompt path: a two-question NEXT reply is trimmed to one', async () => {
    replyWith({
      action: 'NEXT',
      response: '感谢您的分享。那我们聊聊问题二：您平时怎么安排时间？还有别的习惯吗？',
    });

    const result = await generateSmartResponse(
      state(),
      '我的回答',
      '问题一？',
      '问题二？',
      '自定义：{{userAnswer}}'
    );

    expect(questionMarkCount(result.response)).toBeLessThanOrEqual(MAX_QUESTION_MARKS);
    expect(result.response).toContain('您平时怎么安排时间？');
    expect(result.response).not.toContain('还有别的习惯吗');
  });

  it('default-prompt path: a two-question NEXT reply is trimmed to one', async () => {
    replyWith({
      action: 'NEXT',
      response: '感谢您的分享。那我们聊聊问题二：您平时怎么安排时间？还有别的习惯吗？',
    });

    const result = await generateSmartResponse(state(), '我的回答', '问题一？', '问题二？');

    expect(questionMarkCount(result.response)).toBeLessThanOrEqual(MAX_QUESTION_MARKS);
    expect(result.response).not.toContain('还有别的习惯吗');
  });

  it('default-prompt path: an unparseable reply carrying two questions is still trimmed', async () => {
    mockChat.mockResolvedValue({ content: '您平时怎么安排时间？还有别的习惯吗？' });

    const result = await generateSmartResponse(state(), '我的回答', '问题一？', '问题二？');

    expect(questionMarkCount(result.response)).toBeLessThanOrEqual(MAX_QUESTION_MARKS);
  });

  it('the forced transition itself never carries more than one question mark', () => {
    const text = followup.buildForcedNextTransition('您平时怎么安排时间？具体说说？');

    expect(questionMarkCount(text)).toBeLessThanOrEqual(MAX_QUESTION_MARKS);
  });
});

describe('#203 NEXT turns acknowledge the previous answer before asking', () => {
  it('prepends a neutral lead-in when the reply repeats the next question verbatim', () => {
    const result = addContinuityLeadIn('您平时怎么安排时间？', '您平时怎么安排时间？');

    expect(result).toBe(`${FORCED_NEXT_LEAD_IN}您平时怎么安排时间？`);
  });

  it('prepends a neutral lead-in when the reply is nothing but a question', () => {
    const result = addContinuityLeadIn('平时有什么爱好吗？', '您平时怎么安排时间？');

    expect(result).toBe(`${FORCED_NEXT_LEAD_IN}平时有什么爱好吗？`);
  });

  it('prepends the transition before the question, not after it', () => {
    const result = addContinuityLeadIn('您平时怎么安排时间？', '问题二？');

    expect(result.indexOf(FORCED_NEXT_LEAD_IN)).toBe(0);
    expect(result.endsWith('您平时怎么安排时间？')).toBe(true);
  });

  it('leaves a reply that already has any lead-in untouched', () => {
    // The list of texts that must survive verbatim: anything with an opener in
    // front of the question, however it is phrased. A false positive here
    // rewrites a good reply, which is the failure mode this check must never
    // have. (A bare `您平时怎么安排时间？` is NOT in this list — that is exactly
    // the shape the check exists to fix.)
    const goodReplies = [
      '感谢您的分享。那我们聊聊问题二：您平时怎么安排时间？',
      '明白了。您平时怎么安排时间？',
      '好的——您平时怎么安排时间？',
      '这一点很有意思，我想接着问：您平时怎么安排时间？',
      '您提到时间安排，那您平时怎么安排时间？',
      'OK。您平时怎么安排时间？',
      '感谢您的坦诚分享！您平时怎么安排时间？',
      '那太好了。您平时怎么安排时间？',
    ];

    for (const text of goodReplies) {
      expect(addContinuityLeadIn(text, '问题二？')).toBe(text);
    }
  });

  it('leaves a statement-only reply untouched', () => {
    const text = '感谢您的分享，这些细节很有价值。';

    expect(addContinuityLeadIn(text, '问题二？')).toBe(text);
  });

  it('does not touch a reply that is only punctuation or empty', () => {
    expect(addContinuityLeadIn('', '问题二？')).toBe('');
    expect(addContinuityLeadIn('…', '问题二？')).toBe('…');
  });

  it('does not rewrite Chinese quotes that could hide a lead-in', () => {
    // A reply opening with a quoted phrase is still a lead-in; trimming it would
    // corrupt the quote.
    const quoted = '您说的「压力大」很关键。那您平时怎么安排时间？';

    expect(addContinuityLeadIn(quoted, '问题二？')).toBe(quoted);
  });
});

describe('#203 the NEXT path routes bare-question replies through the lead-in', () => {
  it('a NEXT that is only the next question gets the transition in the real turn output', async () => {
    mockStubGeneration.mockResolvedValue({
      // What qwen-plus actually returned on the bare NEXT turns in the transcript:
      // the next question verbatim, with nothing acknowledging the answer.
      response: '问题二？',
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const result = await interviewingNode(state({ currentQuestion: 0 }), {
      content: '我的回答',
    });

    expect(result.currentQuestion).toBe(1);
    expect(result.response).toBeDefined();
    expect(result.response?.startsWith(FORCED_NEXT_LEAD_IN)).toBe(true);
    expect(result.response).toContain('问题二？');
  });

  it('a NEXT with its own lead-in reaches the user unchanged', async () => {
    const text = '感谢您的分享，这段经历很具体。那我们接着聊：问题二？';
    mockStubGeneration.mockResolvedValue({
      response: text,
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    });

    const result = await interviewingNode(state({ currentQuestion: 0 }), {
      content: '我的回答',
    });

    expect(result.response).toBe(text);
  });

  it('does not add a lead-in to a genuine END or the closing copy', async () => {
    mockStubGeneration.mockResolvedValue({
      response: '感谢您的坦诚分享。',
      action: 'END',
      shouldProceedToNext: false,
      shouldEndInterview: true,
    });

    const result = await interviewingNode(state({ currentQuestion: 2 }), {
      content: '我的回答',
    });

    expect(result.response).not.toContain(FORCED_NEXT_LEAD_IN);
  });
});

describe('#203 the prompt itself demands continuity and forbids invention', () => {
  it('the next-question flag requires naming the previous answer before the question', async () => {
    replyWith({ action: 'NEXT', response: '好的。问题二？' });

    await generateSmartResponse(state(), '我平时主要靠番茄钟', '问题一？', '问题二？');

    const sent = (mockChat.mock.calls[0]?.[0] as { messages: Array<{ content: string }> })
      .messages[0]?.content;
    expect(sent).toContain('承接');
    expect(sent).toContain('【下一问题】');
    // The rule must be stated in terms the model can act on: point at the
    // previous answer, then ask exactly one question.
    expect(sent).toContain('一个');
    expect(sent).toMatch(/不要编造|不得编造|严禁编造/);
  });

  it('the default template forbids inventing details and fake quotes', () => {
    const template = promptService.getTemplate('generateSmartResponse')?.template ?? '';

    expect(template).toMatch(/不要编造|不得编造|严禁编造/);
    expect(template).toMatch(/原话/);
    expect(template).toContain('承接');
  });

  it('strengthened prompt rules survive rendering without breaking placeholders', () => {
    const rendered = promptService.render('generateSmartResponse', {
      conversationHistory: '用户: 我平时用番茄钟\n主持人: 好的',
      currentQuestion: '问题一？',
      questionProgress: '第 1/3 个问题',
      followupCount: '0',
      maxFollowups: '2',
      userAnswer: '我平时用番茄钟',
      userName: '受访者',
      lastQuestionFlag: '',
      nextQuestionFlag: '\n【下一问题】：问题二？\n',
    });

    expect(rendered).toContain('问题二？');
    expect(rendered).not.toContain('{{nextQuestionFlag}}');
    expect(rendered).toContain('承接');
  });
});

describe('#203 stripExtraQuestions keeps its contract', () => {
  it('is idempotent', () => {
    const text = '第一问？第二问？第三问？';

    expect(stripExtraQuestions(stripExtraQuestions(text))).toBe(stripExtraQuestions(text));
  });

  it('counts a question mark inside a quoted phrase', () => {
    // Deliberately conservative — the cost of a wrong trim on the NEXT path is
    // lower than the cost of showing the interviewee two questions.
    expect(stripExtraQuestions('他说「为什么？」是什么意思？')).toBe('他说「为什么？」');
  });
});
