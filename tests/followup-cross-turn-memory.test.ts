import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';

/**
 * @test REQ-230 REQ-229
 * @intent 跨轮记忆必须覆盖整段访谈，且提示词要能禁止"前提已锁定仍原样重问"
 *
 * Issue #230: the prompt used to render only `messages.slice(-6)`. The measured
 * cost was a compliant interviewee repeating himself four times — in interview
 * `18811eb7` he said "我不是团队负责人，也不是质量接口人，我只是PQA" at 17:28 and
 * 17:29, and by q9 (17:42) that clarification had slid out of the window, so the
 * bot asked about "您团队" and he had to correct it again.
 *
 * Issue #229: the built-in strategies covered 敷衍/困惑/拒绝/情绪/结束/跳过/质疑/跑题
 * but had NO strategy for "this question's premise was already answered". Without
 * one, a 2-element answer ("基层和中层") gets re-asked as "只能挑两个，您会选哪两个",
 * and the answer degrades to 1 element.
 *
 * These assert on the PROMPT, because that is the whole mechanism: the model can
 * only reuse what is rendered, and can only refuse to re-ask if it is told to.
 */

const mockChat = vi.fn();

// Only the LLM is faked. `prompt.service.js` is deliberately NOT mocked, unlike the
// sibling suite: the point here is what the real built-in template renders, so a
// missing `{{conversationHistory}}` or a dropped strategy must fail this file.
vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: { fromEnv: () => ({ chat: (...args: unknown[]) => mockChat(...args) }) },
  DEFAULT_MODEL: 'test-model',
}));

const { generateSmartResponse } = await import('../src/services/followup.service.js');

function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'u-memory',
    templateId: 't1',
    status: 'ACTIVE',
    messages: [],
    currentQuestion: 9,
    followupCount: 0,
    maxFollowups: 2,
    responses: [],
    reportGenerated: false,
    nudgeCount: 0,
    version: 1,
    originalVersion: 1,
    pendingMessages: [],
    pendingResponses: [],
    ...overrides,
  } as unknown as InterviewState;
}

function turns(records: { role: 'user' | 'assistant'; content: string }[]): InterviewState {
  return state({ messages: records });
}

/** The prompt text actually handed to the model. */
function sentPrompt(): string {
  const call = mockChat.mock.calls[0];
  const messages = (call?.[0] as { messages: Array<{ content: string }> }).messages;
  return messages[0]?.content ?? '';
}

beforeEach(() => {
  mockChat.mockReset();
  mockChat.mockResolvedValue({ content: 'ACTION: NEXT\nRESPONSE: 好的，谢谢您。' });
});

describe('cross-turn memory (#230)', () => {
  it('keeps a role clarification made more than six messages ago', async () => {
    // The measured shape: the clarification sits at the TOP, followed by enough
    // turns to push it out of a 6-message window. It must still reach the prompt.
    const late = Array.from({ length: 8 }, (_, i) => [
      { role: 'assistant' as const, content: `追问${i}` },
      { role: 'user' as const, content: `回答${i}` },
    ]).flat();

    await generateSmartResponse(
      turns([{ role: 'user', content: '我不是团队负责人，也不是质量接口人，我只是PQA' }, ...late]),
      '回答8',
      '您团队的情况如何？'
    );

    expect(sentPrompt()).toContain('我只是PQA');
  });

  it('still renders the newest exchange, so recency is not traded away', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `用户第${i}句`,
    }));

    await generateSmartResponse(
      turns([{ role: 'user', content: '最早的澄清' }, ...many]),
      '最新回答',
      '下一题？'
    );

    const prompt = sentPrompt();
    expect(prompt).toContain('用户第9句');
    expect(prompt).toContain('最早的澄清');
  });

  it('trims from the OLDEST end when the transcript blows the budget', async () => {
    // A very long transcript must not silently drop the newest turns: the model
    // reasons about the latest answer, so recency wins when a choice is forced.
    // The budget is 24k chars, so this needs to clear it with room to spare.
    const huge = '填充'.repeat(20_000); // ~40k chars, well past the budget
    await generateSmartResponse(
      turns([
        { role: 'user', content: `远古内容${huge}` },
        { role: 'assistant', content: '中间的回应' },
        { role: 'user', content: '最新的关键回答' },
      ]),
      '最新的关键回答',
      '下一题？'
    );

    const prompt = sentPrompt();
    expect(prompt).toContain('最新的关键回答');
    expect(prompt).not.toContain('远古内容');
  });
});

describe('already-answered premise (#229)', () => {
  it('carries an explicit instruction against re-asking a locked premise', async () => {
    await generateSmartResponse(
      turns([{ role: 'user', content: '我认为重点需要覆盖基层和中层管理人员' }]),
      '我认为重点需要覆盖基层和中层管理人员',
      '如果只能挑两个层级做深度覆盖，您会选哪两个？'
    );

    // The strategy has to be present as a rule, not a hint: #203 measured ~40%
    // compliance for soft prompt wording on this stack.
    const prompt = sentPrompt();
    expect(prompt).toContain('已答 / 前提已锁定');
    expect(prompt).toContain('不要重复提问');
  });
});
