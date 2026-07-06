import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import {
  generateSmartResponse,
  parseLLMResponse,
  smartTruncate,
} from '../src/services/followup.service.js';

const mockChat = vi.fn();

// Mock LLM so generateSmartResponse doesn't make real HTTP calls
vi.mock('../src/integrations/llm/openai-compatible.js', () => ({
  OpenAICompatibleLLM: {
    fromEnv: () => ({ chat: mockChat }),
  },
  DEFAULT_MODEL: 'test-model',
}));

// Mock prompt service
vi.mock('../src/services/prompt.service.js', () => ({
  promptService: {
    render: vi.fn(() => 'default prompt text'),
  },
}));

function makeState(overrides?: Partial<InterviewState>): InterviewState {
  return {
    userId: 'test-user',
    status: 'ACTIVE',
    followupCount: 0,
    maxFollowups: 3,
    userName: 'Test User',
    currentQuestion: 0,
    messages: [
      { role: 'assistant', content: 'How are you?' },
      { role: 'user', content: 'I am fine' },
    ],
    responses: [],
    reportGenerated: false,
    version: 1,
    originalVersion: 1,
    pendingMessages: [],
    pendingResponses: [],
    ...overrides,
  };
}

describe('Branch Coverage: followup.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseLLMResponse - Additional Branch Coverage', () => {
    it('should parse JSON with no language specification in code fence', () => {
      const wrappedJson = `
\`\`\`
{"thinking":"Simple format","action":"NEXT","response":"Simple response"}
\`\`\`
`;
      const result = parseLLMResponse(wrappedJson);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('NEXT');
      expect(result?.response).toBe('Simple response');
    });

    it('should parse JSON wrapped with extra whitespace', () => {
      const jsonWithWhitespace = `

        {"   thinking   ":"extra   space", "action":"FOLLOWUP", "response":"test"}   

      `;
      const result = parseLLMResponse(jsonWithWhitespace);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('FOLLOWUP');
      expect(result?.response).toBe('test');
    });

    it('should handle JSON with unescaped quotes', () => {
      const badJson = `{"response":"This has "quotes" in it", "action":"STAY"}`;
      const result = parseLLMResponse(badJson);
      expect(result).toBeNull();
    });

    it('should return null when response field is missing', () => {
      const missingResponseJson = `{"action":"NEXT","thinking":"some thinking","strategy":2}`;
      const result = parseLLMResponse(missingResponseJson);
      expect(result).toBeNull();
    });

    it('should return null when action field is missing', () => {
      const missingActionJson = `{"response":"some response","thinking":"some thinking","strategy":2}`;
      const result = parseLLMResponse(missingActionJson);
      expect(result).toBeNull();
    });

    it('should fallback to NEXT when action is invalid but response is valid', () => {
      const invalidActionJson = `{"action":"INVALID_ACTION","response":"some response","thinking":"some thinking","strategy":2}`;
      const result = parseLLMResponse(invalidActionJson);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('NEXT');
      expect(result?.response).toBe('some response');
    });

    it('should handle JSON with multiple null values gracefully', () => {
      const jsonWithNulls = `{"action":"NEXT","response":"some response","thinking":null,"strategy":null}`;
      const result = parseLLMResponse(jsonWithNulls);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('NEXT');
      expect(result?.response).toBe('some response');
      expect(result?.thinking).toBe('');
      expect(result?.strategy).toBe(1);
    });
  });

  describe('smartTruncate - Additional Branch Coverage', () => {
    it('should handle Chinese punctuation correctly', () => {
      const chineseText = '这是一个句子。这也是一个句子。这应该被截断的部分。';
      const result = smartTruncate(chineseText, 15);
      expect(result.length).toBeLessThanOrEqual(18);
      expect(result).toContain('。');
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle text with no punctuation in target range', () => {
      const noPunctuation = 'This text has no proper punctuation marks inside';
      const result = smartTruncate(noPunctuation, 10);
      expect(result.length).toBeLessThanOrEqual(13);
      expect(result).toContain('...');
    });

    it('should return text unchanged when exactly at max length', () => {
      const exactLength = 'This is ten';
      const result = smartTruncate(exactLength, exactLength.length);
      expect(result).toBe(exactLength);
    });

    it('should handle mixed language punctuation', () => {
      const mixedText = 'Some English. 一些中文。Some more.';
      const result = smartTruncate(mixedText, 20);
      expect(result.length).toBeLessThanOrEqual(23);
      expect(result).toContain('...');
    });
  });

  describe('generateSmartResponse - Custom Prompt Path', () => {
    it('should use custom prompt and return parsed response with NEXT action', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ thinking: 'ok', action: 'NEXT', response: 'Good answer' }),
      });
      const state = makeState();
      const result = await generateSmartResponse(
        state,
        'my answer',
        'What?',
        undefined,
        'custom {{userAnswer}}'
      );
      expect(result.response).toBe('Good answer');
      expect(result.action).toBe('NEXT');
      expect(result.shouldProceedToNext).toBe(true);
    });

    it('should return FOLLOWUP and track limit in custom prompt path', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({
          thinking: 'need more',
          action: 'FOLLOWUP',
          response: 'Tell me more?',
        }),
      });
      const state = makeState({ followupCount: 1 });
      const result = await generateSmartResponse(state, 'my answer', 'What?', 'custom');
      expect(result.action).toBe('FOLLOWUP');
      expect(result.shouldProceedToNext).toBe(false);
    });

    it('should force NEXT when followupCount >= maxFollowups in custom prompt path', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ thinking: 'need more', action: 'FOLLOWUP', response: 'More?' }),
      });
      const state = makeState({ followupCount: 5, maxFollowups: 3 });
      const result = await generateSmartResponse(state, 'a', 'q', undefined, 'custom');
      expect(result.action).toBe('NEXT');
      expect(result.shouldProceedToNext).toBe(true);
    });

    it('should fallback to raw text when custom prompt response is not valid JSON', async () => {
      mockChat.mockResolvedValue({ content: 'Some raw text without JSON' });
      const state = makeState();
      const result = await generateSmartResponse(state, 'a', 'q', undefined, 'custom');
      expect(result.response).toBe('Some raw text without JSON');
      expect(result.action).toBe('NEXT');
    });

    it('should fallback to FALLBACK_RESPONSE when custom prompt LLM call fails', async () => {
      mockChat.mockRejectedValue(new Error('LLM timeout'));
      const state = makeState();
      const result = await generateSmartResponse(state, 'a', 'q', undefined, 'custom');
      expect(result.response).toBe('感谢您的回答，我们继续下一个话题。');
      expect(result.action).toBe('NEXT');
    });
  });

  describe('generateSmartResponse - Default Prompt Path', () => {
    it('should use default prompt and return parsed response', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ thinking: 'ok', action: 'NEXT', response: 'Default path' }),
      });
      const result = await generateSmartResponse(makeState(), 'a', 'q');
      expect(result.response).toBe('Default path');
      expect(result.action).toBe('NEXT');
    });

    it('should fallback when default prompt response cannot be parsed', async () => {
      mockChat.mockResolvedValue({ content: 'unparseable' });
      const result = await generateSmartResponse(makeState(), 'a', 'q');
      expect(result.response).toBe('感谢您的回答，我们继续下一个话题。');
      expect(result.action).toBe('NEXT');
    });

    it('should force NEXT when followup limit exceeded in default path', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ thinking: 'more', action: 'FOLLOWUP', response: 'Follow up' }),
      });
      const state = makeState({ followupCount: 5, maxFollowups: 3 });
      const result = await generateSmartResponse(state, 'a', 'q');
      expect(result.action).toBe('NEXT');
      expect(result.shouldProceedToNext).toBe(true);
    });

    it('should handle LLM call failure in default path', async () => {
      mockChat.mockRejectedValue(new Error('Network error'));
      const result = await generateSmartResponse(makeState(), 'a', 'q');
      expect(result.response).toBe('感谢您的回答，我们继续下一个话题。');
      expect(result.action).toBe('NEXT');
    });

    it('should return END action', async () => {
      mockChat.mockResolvedValue({
        content: JSON.stringify({ thinking: 'done', action: 'END', response: 'Goodbye' }),
      });
      const result = await generateSmartResponse(makeState(), 'a', 'q');
      expect(result.action).toBe('END');
      expect(result.shouldEndInterview).toBe(true);
    });
  });
});
