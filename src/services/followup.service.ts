import type { InterviewState } from '../core/types/index.js';
import { OpenAICompatibleLLM } from '../integrations/llm/openai-compatible.js';
import { info, warn } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { promptService } from './prompt.service.js';

/**
 * Lead-in used whenever a NEXT reply would otherwise reach the interviewee with
 * nothing acknowledging what they just said (issue #203).
 *
 * Deliberately topic-neutral: it never names the previous answer, because the
 * bot has no reliable way to know which words in a free-text answer are the key
 * ones. A keyword-overlap heuristic that guesses got replies rewritten for no
 * reason, which is worse than a plain acknowledgement.
 */
export const FORCED_NEXT_LEAD_IN = '感谢您刚才的分享。我们接着聊下一个问题：';

/**
 * The "one question per turn" hard limit. A reply is allowed at most this many
 * question marks — see `stripExtraQuestions`.
 */
export const MAX_QUESTION_MARKS = 1;

/**
 * Punctuation that closes a clause in front of the question. `,` / `，` are
 * deliberately excluded — a comma alone is checked separately (`好的，…`), while
 * these markers always end the preceding remark, so the reply already has a
 * lead-in.
 */
const SENTENCE_BREAKS = /[。！!；;：:\n—…~～]/g;

/**
 * Openers that carry no acknowledgement of the previous answer, when they stand
 * alone in front of the question and are followed by a comma. Kept short and
 * literal — anything richer ("明白了，您提到的…") is already a lead-in.
 */
const BARE_FILLER_PREFIX =
  /^(?:好的|好|嗯|嗯嗯|哦|噢|行|可以|明白了|明白|收到|了解了|了解|没问题|ok|okay)[,，]?$/i;

/** Offsets of every sentence break in `text`. */
function findSentenceBreaks(text: string): number[] {
  return Array.from(text.matchAll(SENTENCE_BREAKS), (m) => m.index ?? 0);
}

/**
 * True when the reply carries no acknowledgement in front of its question.
 *
 * `beforeQuestion` is the text up to the first question mark, so for a bare
 * question it IS the question's own wording ("平时有什么爱好吗"). The check
 * therefore asks whether anything *other* than that wording precedes the
 * question:
 *
 *   1. no punctuation at all — the whole text is the question;
 *   2. a bare filler followed by a comma ("好的，您平时…？").
 *
 * Anything else counts as a lead-in, including a filler joined by a dash
 * ("好的——…"): the dash makes it a continuation, and this check must never
 * rewrite a reply that has any opener.
 */
function hasNoLeadIn(beforeQuestion: string): boolean {
  const trimmed = beforeQuestion.trim();
  // Shape 1: nothing at all — the text is the question by itself.
  if (!trimmed) return true;
  // A sentence ended before the question: that sentence is the acknowledgement.
  if (findSentenceBreaks(trimmed).length > 0) return false;
  // Shape 2 (`好的，`): a bare filler closed by a comma, then the question.
  const comma = trimmed.search(/[,，]/);
  if (comma === -1) return true;
  return BARE_FILLER_PREFIX.test(trimmed.slice(0, comma).trim());
}

export function buildForcedNextTransition(nextQuestion?: string): string {
  if (!nextQuestion) {
    return '好的，关于这个话题我们已经聊得比较深入了。我们继续看下一个问题。';
  }
  // The question text comes from the template, where a stray second question
  // mark is possible. The "one question per turn" rule covers this copy too.
  return `好的，关于这个话题我们已经聊得比较深入了。那我们聊聊：${stripExtraQuestions(nextQuestion)}`;
}

/**
 * Add a neutral lead-in when a NEXT reply contains nothing but the question.
 *
 * `routeAction` rewrites the reply whenever the pointer has already advanced
 * past the question it names, but it has nothing good to offer for the far more
 * common "bare question" case: in the 12-question transcript 6 of 11 NEXT turns
 * repeated the next question verbatim with no acknowledgement at all. This is
 * the deterministic backstop for that shape.
 *
 * Conservative by design — false negatives are fine, false positives (rewriting
 * a reply that already has a lead-in) are not:
 *
 *   - the reply must carry a question mark, so a statement-only reply (a wrap-up
 *     or a closing) is left alone;
 *   - anything before the question other than a bare filler ("好的，") counts as
 *     a lead-in, so "感谢您的分享。那我们聊聊：…" is returned untouched;
 *   - when the reply *is* the next question repeated verbatim, no acknowledgement
 *     could possibly be credible (the bot would be answering a question it never
 *     asked), so only the neutral opener is added.
 *
 * No LLM call is involved: this runs on every turn.
 */
export function addContinuityLeadIn(response: string, nextQuestion?: string): string {
  const text = response.trim();
  if (!text) return response;

  const questionMark = text.search(/[?？]/);
  // No question (a wrap-up or a statement) — outside this rule's scope.
  if (questionMark === -1) return response;

  const isNextQuestionVerbatim = nextQuestion != null && text === nextQuestion.trim();
  if (!isNextQuestionVerbatim) {
    const beforeQuestion = text.slice(0, questionMark);
    if (!hasNoLeadIn(beforeQuestion)) return response;
  }

  return `${FORCED_NEXT_LEAD_IN}${text}`;
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
 *
 * The cut keeps a bracket that the first question mark opens — `「为什么？」` is
 * one question mark and its closer belongs to it — and never splits a character.
 */
export function stripExtraQuestions(response: string): string {
  const questionMarks = response.match(/[?？]/g);
  if (!questionMarks || questionMarks.length <= MAX_QUESTION_MARKS) {
    return response;
  }

  const firstQuestionMarkIndex = response.search(/[?？]/);
  if (firstQuestionMarkIndex === -1) {
    return response;
  }

  return response.substring(0, closingOffset(response, firstQuestionMarkIndex) + 1).trim();
}

/** Closing brackets whose opening character precedes the question they close. */
const CLOSERS = new Set(['」', '』', '”', '》', '）', '】']);

/**
 * Offset of the last character to keep when cutting at `questionMarkIndex`.
 *
 * A closing bracket directly after the question mark belongs to the question
 * that was just cut off at it, so it is kept rather than left dangling.
 */
function closingOffset(text: string, questionMarkIndex: number): number {
  let end = questionMarkIndex;
  while (end + 1 < text.length && CLOSERS.has(text[end + 1] ?? '')) {
    end += 1;
  }
  return end;
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
  // Issue #203: "先承接上一回答再抛下一题" was stated only as a soft principle and
  // measured ~40% compliance on a real 12-question interview (6 of 11 NEXT turns
  // had no acknowledgement at all). It is spelled out here as a two-step, ordered
  // requirement the model can self-check, next to the question it has to use.
  return `\n【下一问题】：${nextQuestion}
（如果你决定NEXT，必须按以下顺序写你的 response：
  第 1 步 承接：先用一句话点出用户刚才回答里的**关键词或具体内容**，表示你听懂了（例如"您刚才提到…"）。不要泛泛地说"感谢分享"。
  第 2 步 提问：再自然地引出并说出【下一问题】的具体内容，一次只问这一个问题。
  不允许：只把【下一问题】原样抛出来、没有任何承接；也不允许说"我们继续下一题"这种不带内容的空话。）
`;
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
