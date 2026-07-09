import type { InterviewState } from '../core/types/index.js';
import { OpenAICompatibleLLM } from '../integrations/llm/openai-compatible.js';
import { info, warn } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

function buildForcedNextTransition(nextQuestion?: string): string {
  if (!nextQuestion) {
    return '好的，关于这个话题我们已经聊得比较深入了。我们继续看下一个问题。';
  }
  return `好的，关于这个话题我们已经聊得比较深入了。那我们聊聊：${nextQuestion}`;
}

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

/**
 * Strip extra questions from LLM response to enforce "one question per turn" rule.
 * If the response contains multiple question marks, keep only the first question.
 */
export function stripExtraQuestions(response: string): string {
  const questionMarks = response.match(/[?？]/g);
  if (!questionMarks || questionMarks.length <= 1) {
    return response;
  }

  const firstQuestionMarkIndex = response.search(/[?？]/);
  if (firstQuestionMarkIndex === -1) {
    return response;
  }

  return response.substring(0, firstQuestionMarkIndex + 1).trim();
}

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
      llm.chat({ messages: [{ role: 'user', content: prompt }] })
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
    const endActions = ['END', 'FINISH', 'COMPLETE'];
    const validActions = ['NEXT', 'FOLLOWUP', 'END', 'FINISH', 'COMPLETE'];
    let action: 'NEXT' | 'FOLLOWUP' | 'END';
    if (validActions.includes(parsed.action)) {
      action = endActions.includes(parsed.action) ? 'END' : parsed.action;
    } else {
      action = 'NEXT';
    }
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

export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  nextQuestion?: string,
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

  const nextQuestionFlag =
    !isLastQuestion && nextQuestion
      ? `\n【下一问题】：${nextQuestion}\n（如果你决定NEXT，你的回复中必须直接说出下一问题的具体内容，不能说"我们继续下一题"这种空话）\n`
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
      .replace(/\{\{lastQuestionFlag\}\}/g, lastQuestionFlag)
      .replace(/\{\{nextQuestionFlag\}\}/g, nextQuestionFlag);

    try {
      const response = await withRetry(() =>
        llm.chat({ messages: [{ role: 'user', content: prompt }] })
      );
      const parsed = parseLLMResponse(response.content);
      if (!parsed) {
        warn('Failed to parse custom prompt result as JSON, using raw text');
        return {
          response: response.content,
          action: 'NEXT',
          shouldProceedToNext: true,
          shouldEndInterview: false,
        };
      }
      if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
        parsed.action = 'NEXT';
        parsed.response = buildForcedNextTransition(nextQuestion);
      }
      return {
        response: stripExtraQuestions(parsed.response),
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
    nextQuestionFlag,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({ messages: [{ role: 'user', content: prompt }] })
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
        response: buildForcedNextTransition(nextQuestion),
        action: 'NEXT',
        shouldProceedToNext: true,
        shouldEndInterview: false,
      };
    }
    return {
      response: stripExtraQuestions(parsed.response),
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
