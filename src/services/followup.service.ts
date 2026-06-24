import type { InterviewState } from '../core/types/index.js';
import { DEFAULT_MODEL, OpenAICompatibleLLM } from '../integrations/llm/openai-compatible.js';
import { info, warn } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

export interface StructuredResponse {
  thinking: string;
  strategy: number;
  action: 'NEXT' | 'FOLLOWUP' | 'END';
  response: string;
}

export interface SmartResponseResult {
  response: string;
  action: 'NEXT' | 'FOLLOWUP' | 'END';
  shouldProceedToNext: boolean;
  shouldEndInterview: boolean;
}

export const FALLBACK_RESPONSE = '感谢您的回答，我们继续下一个话题。';

export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  let content = rawContent.trim();
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }
  try {
    const parsed = JSON.parse(content);
    if (!parsed.action || !parsed.response) return null;
    const validActions = ['NEXT', 'FOLLOWUP', 'END'];
    const action: 'NEXT' | 'FOLLOWUP' | 'END' = validActions.includes(parsed.action)
      ? parsed.action
      : 'NEXT';
    return {
      thinking: parsed.thinking || '',
      strategy: parsed.strategy || 1,
      action,
      response: parsed.response,
    };
  } catch {
    return null;
  }
}

export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const threshold = Math.floor(maxLength * 0.7);
  const searchStart = Math.min(threshold, maxLength - 10);
  const punctuations = ['。', '！', '？', '.', '!', '?'];
  let lastPunctuation = -1;
  for (const punct of punctuations) {
    const idx = text.lastIndexOf(punct, maxLength);
    if (idx > searchStart && idx > lastPunctuation) lastPunctuation = idx;
  }
  if (lastPunctuation > threshold) return `${text.slice(0, lastPunctuation + 1)}...`;
  return `${text.slice(0, maxLength - 3)}...`;
}

export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  customPrompt?: string,
  isLastQuestion?: boolean
): Promise<SmartResponseResult> {
  const llm = OpenAICompatibleLLM.fromEnv();

  const conversationHistory = state.messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
    .join('\n');

  const userName = state.userName || '受访者';
  const lastQuestionFlag = isLastQuestion
    ? '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n'
    : '';

  if (customPrompt) {
    const prompt = customPrompt
      .replace(/\{\{conversationHistory\}\}/g, conversationHistory)
      .replace(/\{\{currentQuestion\}\}/g, currentQuestion)
      .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
      .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
      .replace(/\{\{userAnswer\}\}/g, userAnswer)
      .replace(/\{\{userName\}\}/g, userName)
      .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);

    try {
      const response = await withRetry(() =>
        llm.chat({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: prompt }] })
      );
      const parsed = parseLLMResponse(response.content);
      if (!parsed) {
        warn('Failed to parse custom prompt result as JSON, using raw text');
        const shouldEnd = isLastQuestion === true;
        return {
          response: shouldEnd
            ? '感谢您的分享！访谈到此结束，祝您一切顺利！'
            : smartTruncate(response.content, 150),
          action: shouldEnd ? ('END' as const) : ('NEXT' as const),
          shouldProceedToNext: !shouldEnd,
          shouldEndInterview: shouldEnd,
        };
      }
      if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups)
        parsed.action = 'NEXT';
      return {
        response: smartTruncate(parsed.response, 150),
        action: parsed.action,
        shouldProceedToNext: parsed.action === 'NEXT',
        shouldEndInterview: parsed.action === 'END',
      };
    } catch {
      warn('Custom prompt LLM call failed');
      return {
        response: FALLBACK_RESPONSE,
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      };
    }
  }

  // Default system prompt
  const prompt = promptService.render('generateSmartResponse', {
    conversationHistory,
    currentQuestion,
    followupCount: String(state.followupCount),
    maxFollowups: String(state.maxFollowups),
    userAnswer,
    userName,
    lastQuestionFlag,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: prompt }] })
    );
    const parsed = parseLLMResponse(response.content);
    if (!parsed) {
      info('Failed to parse LLM response, using fallback');
      const shouldEnd = isLastQuestion === true;
      return {
        response: shouldEnd ? '感谢您的分享！访谈到此结束，祝您一切顺利！' : FALLBACK_RESPONSE,
        action: shouldEnd ? ('END' as const) : ('NEXT' as const),
        shouldProceedToNext: !shouldEnd,
        shouldEndInterview: shouldEnd,
      };
    }
    if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
      info('Followup limit exceeded, forcing NEXT');
      return {
        response: smartTruncate(parsed.response, 150),
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      };
    }
    return {
      response: smartTruncate(parsed.response, 150),
      action: parsed.action,
      shouldProceedToNext: parsed.action === 'NEXT',
      shouldEndInterview: parsed.action === 'END',
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    info('Smart response generation failed', { error: errMsg });
    const shouldEnd = isLastQuestion === true;
    return {
      response: shouldEnd ? '感谢您的分享！访谈到此结束，祝您一切顺利！' : FALLBACK_RESPONSE,
      action: shouldEnd ? ('END' as const) : ('NEXT' as const),
      shouldProceedToNext: !shouldEnd,
      shouldEndInterview: shouldEnd,
    };
  }
}
