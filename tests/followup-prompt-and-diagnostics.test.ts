import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';

/**
 * @test REQ-155-FOLLOWUP
 * @intent 通过捕获发给 LLM 的 prompt 与诊断日志，覆盖 followup.service 的提示词构造和降级分支，提升变异分数
 * @covers 历史渲染的角色前缀与截断、末题提示、下一题提示、追问上限告警、无法解析时的回退
 *
 * Gate M had followup.service.ts at 48.77%. The largest single cluster was a
 * conditional whose entire body was an `info(...)` call — the branch ran and
 * nothing observable changed, which is the classic unassertable side effect
 * recorded in AGENTS.md. Mocking the logger makes the log line the observable;
 * capturing the prompt covers the prompt-building branch that decides whether
 * the model knows it is on the last question.
 */

const mockChat = vi.fn();
const mockInfo = vi.fn();
const mockWarn = vi.fn();

vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: { fromEnv: () => ({ chat: mockChat }) },
  DEFAULT_MODEL: 'test-model',
}));

vi.mock('../src/services/prompt.service.js', () => ({
  promptService: { render: (_t: string, vars: Record<string, string>) => JSON.stringify(vars) },
}));

vi.mock('../src/utils/logger.js', () => ({
  info: (...a: unknown[]) => mockInfo(...a),
  warn: (...a: unknown[]) => mockWarn(...a),
  error: vi.fn(),
  debug: vi.fn(),
}));

const { generateSmartResponse, FALLBACK_RESPONSE } = await import(
  '../src/services/followup.service.js'
);

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

function reply(payload: Record<string, unknown>): void {
  mockChat.mockResolvedValue({ content: JSON.stringify(payload) });
}

/** The prompt text actually handed to the model. */
function sentPrompt(): string {
  const call = mockChat.mock.calls[0];
  const messages = (call?.[0] as { messages: Array<{ content: string }> }).messages;
  return messages[0]?.content ?? '';
}

describe('follow-up prompt construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reply({ action: 'NEXT', response: '继续。' });
  });

  it('labels the speakers in the conversation history', async () => {
    await generateSmartResponse(
      state({
        messages: [
          { role: 'user', content: '我的回答' },
          { role: 'assistant', content: '主持人说话' },
        ],
      } as Partial<InterviewState>),
      '我的回答',
      '当前问题'
    );

    const prompt = sentPrompt();
    expect(prompt).toContain('用户: 我的回答');
    expect(prompt).toContain('主持人: 主持人说话');
  });

  it('renders only the last six turns', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `turn-${i}`,
    }));

    await generateSmartResponse(state({ messages: many } as Partial<InterviewState>), 'a', 'q');

    const prompt = sentPrompt();
    // The four oldest turns are dropped, the six newest kept.
    expect(prompt).not.toContain('turn-0');
    expect(prompt).not.toContain('turn-3');
    expect(prompt).toContain('turn-4');
    expect(prompt).toContain('turn-9');
  });

  it('tells the model when it is the last question', async () => {
    await generateSmartResponse(state(), 'a', '最后一问', undefined, undefined, true, 3);

    expect(sentPrompt()).toContain('这是最后一个问题');
  });

  it('does not claim the last question when it is not', async () => {
    await generateSmartResponse(state(), 'a', '当前问题', '下一问题', undefined, false, 3);

    expect(sentPrompt()).not.toContain('这是最后一个问题');
  });

  it('names the next question so the model can ask it verbatim', async () => {
    await generateSmartResponse(state(), 'a', '当前问题', '下一问题', undefined, false, 3);

    const prompt = sentPrompt();
    expect(prompt).toContain('【下一问题】');
    expect(prompt).toContain('NEXT');
  });

  it('omits the next-question hint on the last question', async () => {
    await generateSmartResponse(state(), 'a', '最后一问', '不该出现的问题', undefined, true, 3);

    expect(sentPrompt()).not.toContain('不该出现的问题');
  });

  it('omits the next-question hint when there is no next question', async () => {
    await generateSmartResponse(state(), 'a', '当前问题', undefined, undefined, false, 3);

    expect(sentPrompt()).not.toContain('【下一问题】');
  });
});

describe('follow-up routing and diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs when the follow-up cap forces a NEXT', async () => {
    reply({ action: 'FOLLOWUP', response: '还要继续吗？' });

    const result = await generateSmartResponse(
      state({ followupCount: 5, maxFollowups: 3 }),
      'a',
      'q'
    );

    expect(result.action).toBe('NEXT');
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Followup limit exceeded'));
  });

  it('does not log the cap warning when under the limit', async () => {
    reply({ action: 'FOLLOWUP', response: '还要继续吗？' });

    await generateSmartResponse(state({ followupCount: 0, maxFollowups: 3 }), 'a', 'q');

    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Followup limit exceeded'));
  });

  it('does not log the cap warning for a non-FOLLOWUP action at the limit', async () => {
    reply({ action: 'NEXT', response: '继续。' });

    await generateSmartResponse(state({ followupCount: 5, maxFollowups: 3 }), 'a', 'q');

    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Followup limit exceeded'));
  });

  it('logs and falls back when the default-path reply cannot be parsed', async () => {
    mockChat.mockResolvedValue({ content: 'not json at all' });

    const result = await generateSmartResponse(state(), 'a', 'q');

    expect(result.response).toBe(FALLBACK_RESPONSE);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Failed to parse LLM response'));
  });

  it('warns and returns raw text when the custom path cannot be parsed', async () => {
    mockChat.mockResolvedValue({ content: 'raw custom text' });

    const result = await generateSmartResponse(state(), 'a', 'q', undefined, 'custom-prompt');

    expect(result.response).toBe('raw custom text');
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse custom prompt'));
  });

  it('warns when the custom prompt call throws', async () => {
    mockChat.mockRejectedValue(new Error('boom'));

    const result = await generateSmartResponse(state(), 'a', 'q', undefined, 'custom-prompt');

    expect(result.response).toBe(FALLBACK_RESPONSE);
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Custom prompt LLM call failed'));
  });

  it('logs the error message when the default path throws', async () => {
    mockChat.mockRejectedValue(new Error('specific failure'));

    const result = await generateSmartResponse(state(), 'a', 'q');

    expect(result.response).toBe(FALLBACK_RESPONSE);
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Smart response generation failed'),
      expect.objectContaining({ error: 'specific failure' })
    );
  });

  it('stringifies a non-Error rejection', async () => {
    mockChat.mockRejectedValue('plain string');

    await generateSmartResponse(state(), 'a', 'q');

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Smart response generation failed'),
      expect.objectContaining({ error: expect.stringContaining('plain string') })
    );
  });
});

describe('forced transition text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the next question when the cap forces a move on', async () => {
    reply({ action: 'FOLLOWUP', response: '再问一次？' });

    const result = await generateSmartResponse(
      state({ followupCount: 5, maxFollowups: 3 }),
      'a',
      'q',
      '下一个话题'
    );

    expect(result.response).toContain('下一个话题');
  });

  it('uses a generic transition when there is no next question', async () => {
    reply({ action: 'FOLLOWUP', response: '再问一次？' });

    const result = await generateSmartResponse(
      state({ followupCount: 5, maxFollowups: 3 }),
      'a',
      'q'
    );

    expect(result.response).not.toContain('undefined');
    expect(result.response.length).toBeGreaterThan(0);
  });
});
