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

/** The neutral "move on" result used whenever the LLM answer is unusable. */
function nextResult(response: string): SmartResponseResult {
  return {
    // The unparseable-JSON path hands raw model text in here, so the same
    // one-question-per-turn rule applies as in `resultFromParsed`.
    response: stripExtraQuestions(response),
    action: 'NEXT',
    shouldProceedToNext: true,
    shouldEndInterview: false,
  };
}

/**
 * Convert a parsed LLM answer into a result, honouring the follow-up cap: a
 * FOLLOWUP past `maxFollowups` degrades to NEXT and is replaced by the forced
 * transition text.
 */
export function resultFromParsed(
  parsed: StructuredResponse,
  followupCount: number,
  maxFollowups: number,
  nextQuestion: string | undefined
): SmartResponseResult {
  const capped = parsed.action === 'FOLLOWUP' && followupCount >= maxFollowups;
  const response = capped ? buildForcedNextTransition(nextQuestion) : parsed.response;
  const action = capped ? 'NEXT' : parsed.action;
  return {
    // "One question per turn" is a hard rule, not a prompt suggestion. Both the
    // custom and the default prompt paths funnel through here, so enforcing it at
    // this single exit covers both — before, nothing called this helper and a
    // model that returned two questions had both sent to the interviewee.
    // Only a re-asked follow-up is left alone: it is one question by
    // construction, and trimming it risks cutting a summary mid-sentence.
    response: action === 'FOLLOWUP' ? response : stripExtraQuestions(response),
    action,
    shouldProceedToNext: action === 'NEXT',
    shouldEndInterview: action === 'END',
  };
}

/** Template variables shared by the custom and default prompt paths. */
interface PromptVars {
  conversationHistory: string;
  currentQuestion: string;
  questionProgress: string;
  followupCount: string;
  maxFollowups: string;
  userAnswer: string;
  userName: string;
  lastQuestionFlag: string;
  nextQuestionFlag: string;
}

/** Last 6 turns rendered for the prompt, oldest first. */
function renderHistory(state: InterviewState): string {
  return state.messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`)
    .join('\n');
}

function lastQuestionFlag(isLastQuestion: boolean | undefined): string {
  if (!isLastQuestion) return '';
  return '\n【注意】：这是最后一个问题。请回顾用户的分享，写一段温暖的告别语，总结他提到的核心观点和感受。不要提出新的问题。\n';
}

function nextQuestionFlag(
  isLastQuestion: boolean | undefined,
  nextQuestion: string | undefined
): string {
  if (isLastQuestion || !nextQuestion) return '';
  return `\n【下一问题】：${nextQuestion}\n（如果你决定NEXT，你的回复中必须直接说出下一问题的具体内容，不能说"我们继续下一题"这种空话）\n`;
}

function buildPromptVars(
  state: InterviewState,
  userAnswer: string,
  currentQuestion: string,
  nextQuestion: string | undefined,
  isLastQuestion: boolean | undefined,
  totalQuestions: number | undefined
): PromptVars {
  const progress = totalQuestions ? `${state.currentQuestion + 1}/${totalQuestions}` : '?';
  return {
    conversationHistory: renderHistory(state),
    currentQuestion,
    questionProgress: `第 ${progress} 个问题`,
    followupCount: String(state.followupCount),
    maxFollowups: String(state.maxFollowups),
    userAnswer,
    userName: state.userName || '受访者',
    lastQuestionFlag: lastQuestionFlag(isLastQuestion),
    nextQuestionFlag: nextQuestionFlag(isLastQuestion, nextQuestion),
  };
}

/** Escape `{{ }}` so user text cannot inject template placeholders. */
function escapePlaceholders(s: string): string {
  return s.replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}');
}

function renderCustomPrompt(template: string, vars: PromptVars): string {
  const replacements: Record<string, string> = {
    conversationHistory: escapePlaceholders(vars.conversationHistory),
    currentQuestion: escapePlaceholders(vars.currentQuestion),
    followupCount: vars.followupCount,
    maxFollowups: vars.maxFollowups,
    userAnswer: escapePlaceholders(vars.userAnswer),
    userName: escapePlaceholders(vars.userName),
    questionProgress: vars.questionProgress,
    lastQuestionFlag: vars.lastQuestionFlag,
    nextQuestionFlag: vars.nextQuestionFlag,
  };
  let prompt = template;
  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }
  return prompt;
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
  const vars = buildPromptVars(
    state,
    userAnswer,
    currentQuestion,
    nextQuestion,
    isLastQuestion,
    totalQuestions
  );

  if (customPrompt) {
    const prompt = renderCustomPrompt(customPrompt, vars);
    try {
      const response = await withRetry(() =>
        llm.chat({ messages: [{ role: 'user', content: prompt }] })
      );
      const parsed = parseLLMResponse(response.content);
      if (!parsed) {
        warn('Failed to parse custom prompt result as JSON, using raw text');
        return nextResult(response.content);
      }
      return resultFromParsed(parsed, state.followupCount, state.maxFollowups, nextQuestion);
    } catch {
      warn('Custom prompt LLM call failed');
      return nextResult(FALLBACK_RESPONSE);
    }
  }

  // Default system prompt
  const prompt = promptService.render('generateSmartResponse', { ...vars });

  try {
    const response = await withRetry(() =>
      llm.chat({ messages: [{ role: 'user', content: prompt }] })
    );
    const parsed = parseLLMResponse(response.content);
    if (!parsed) {
      info('Failed to parse LLM response, using fallback');
      return nextResult(FALLBACK_RESPONSE);
    }
    if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
      info('Followup limit exceeded, forcing NEXT');
    }
    return resultFromParsed(parsed, state.followupCount, state.maxFollowups, nextQuestion);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    info('Smart response generation failed', { error: errMsg });
    return nextResult(FALLBACK_RESPONSE);
  }
}
