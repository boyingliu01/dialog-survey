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
const FORCED_NEXT_TRANSITION = '好的，关于这个话题我们已经聊得比较深入了。我们继续看下一个问题。';

export async function polishFirstQuestion(rawText: string): Promise<string> {
  const llm = OpenAICompatibleLLM.fromEnv();
  try {
    const prompt = `你是一位温暖、专业的访谈主持人。请将下面这段访谈问题改写得更自然、口语化、像朋友聊天一样：

原始问题：
${rawText}

要求：
- 保持原意和关键信息点
- 自然、温暖，不要机械生硬
- 一句话即可，不要展开`;

    const response = await withRetry(() =>
      llm.chat({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: prompt }] })
    );
    const refined = response.content.trim();
    if (!refined || refined === rawText) return rawText;
    return refined;
  } catch {
    return rawText;
  }
}

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
  isLastQuestion?: boolean,
  totalQuestions?: number
): Promise<SmartResponseResult> {
  const llm = OpenAICompatibleLLM.fromEnv();

  const conversationHistory = state.messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
    .join('\n');

  const userName = state.userName || '受访者';
  const questionProgress = totalQuestions
    ? `第 ${state.currentQuestion + 1}/${totalQuestions} 个问题`
    : '第 ? 个问题';
  const lastQuestionFlag = isLastQuestion
    ? '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n'
    : '';

  if (customPrompt) {
    const escaped = (s: string) => s.replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}');
    const prompt = customPrompt
      .replace(/\{\{conversationHistory\}\}/g, escaped(conversationHistory))
      .replace(/\{\{currentQuestion\}\}/g, escaped(currentQuestion))
      .replace(/\{\{followupCount\}\}/g, String(state.followupCount))
      .replace(/\{\{maxFollowups\}\}/g, String(state.maxFollowups))
      .replace(/\{\{userAnswer\}\}/g, escaped(userAnswer))
      .replace(/\{\{userName\}\}/g, escaped(userName))
      .replace(/\{\{questionProgress\}\}/g, questionProgress)
      .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag);

    try {
      const response = await withRetry(() =>
        llm.chat({ model: DEFAULT_MODEL, messages: [{ role: 'user', content: prompt }] })
      );
      const parsed = parseLLMResponse(response.content);
      if (!parsed) {
        warn('Failed to parse custom prompt result as JSON, using raw text');
        return {
          response: smartTruncate(response.content, 150),
          action: 'NEXT',
          shouldProceedToNext: true,
          shouldEndInterview: false,
        };
      }
      if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
        parsed.action = 'NEXT';
        parsed.response = FORCED_NEXT_TRANSITION;
      }
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
    questionProgress,
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
      return {
        response: FALLBACK_RESPONSE,
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      };
    }
    if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
      info('Followup limit exceeded, forcing NEXT');
      return {
        response: FORCED_NEXT_TRANSITION,
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
    return {
      response: FALLBACK_RESPONSE,
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    };
  }
}
