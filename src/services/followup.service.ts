import { VolcengineLLM, DEFAULT_MODEL } from '../integrations/llm/volcengine.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';
import { info } from '../utils/logger.js';
import type { InterviewState } from '../core/types/index.js';

export interface StructuredResponse {
  thinking: string;
  strategy: number;
  action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY';
  response: string;
}

export interface SmartResponseResult {
  response: string;
  action: 'NEXT' | 'FOLLOWUP' | 'END' | 'STAY';
  shouldProceedToNext: boolean;
  shouldEndInterview: boolean;
}

export const FALLBACK_RESPONSE = '感谢您的回答，我们继续下一个话题。';

/**
 * Parse LLM JSON response, handling markdown code block wrapping
 */
export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  let content = rawContent.trim();

  // Strip markdown code block if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(content);

    // Validate required fields
    if (!parsed.action || !parsed.response) {
      return null;
    }

    // Validate and normalize action
    const validActions = ['NEXT', 'FOLLOWUP', 'END', 'STAY'];
    const action = validActions.includes(parsed.action) ? parsed.action : 'STAY';

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

/**
 * Truncate text at sentence boundary, preserving readability
 */
export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Try to find sentence boundary at 70% threshold
  const threshold = Math.floor(maxLength * 0.7);
  const searchStart = Math.min(threshold, maxLength - 10);

  // Look for sentence-ending punctuation
  const punctuations = ['。', '！', '？', '.', '!', '?'];
  let lastPunctuation = -1;

  for (const punct of punctuations) {
    const idx = text.lastIndexOf(punct, maxLength);
    if (idx > searchStart && idx > lastPunctuation) {
      lastPunctuation = idx;
    }
  }

  if (lastPunctuation > threshold) {
    return `${text.slice(0, lastPunctuation + 1)}...`;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Generate smart response with intent understanding + strategy selection
 * Single LLM call replacing the old 3-step process
 */
export async function generateSmartResponse(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string
): Promise<SmartResponseResult> {
  const llm = VolcengineLLM.fromEnv();

  // Build conversation history from messages
  const conversationHistory = state.messages
    .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
    .join('\n');

  const prompt = promptService.render('generateSmartResponse', {
    conversationHistory,
    currentQuestion,
    followupCount: String(state.followupCount),
    maxFollowups: String(state.maxFollowups),
    userAnswer,
  });

  try {
    const response = await withRetry(() =>
      llm.chat({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
      })
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

    // Force NEXT if followup limit exceeded and LLM suggested FOLLOWUP
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
    return {
      response: FALLBACK_RESPONSE,
      action: 'NEXT',
      shouldProceedToNext: true,
      shouldEndInterview: false,
    };
  }
}
