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
  if (needsLeadIn(text, nextQuestion)) return `${FORCED_NEXT_LEAD_IN}${text}`;
  return response;
}

/**
 * True when `text` is a question that opens without an acknowledgement.
 *
 * Three ways to be out of scope, each stated once: an empty reply, a reply with
 * no question mark (a wrap-up or a statement), and a reply that already carries a
 * real lead-in. The verbatim-next-question case is the exception -- no
 * acknowledgement could be credible there, so it always gets the neutral opener.
 */
function needsLeadIn(text: string, nextQuestion: string | undefined): boolean {
  const questionMark = text.search(/[?？]/);
  if (!text || questionMark === -1) return false;
  if (nextQuestion != null && text === nextQuestion.trim()) return true;
  return hasNoLeadIn(text.slice(0, questionMark));
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

/**
 * Model action wordings mapped onto the three actions the graph understands.
 *
 * END/FINISH/COMPLETE are three spellings of the same outcome; NEXT and FOLLOWUP
 * are their own. Anything else falls back to NEXT, so an unrecognised word
 * advances the interview rather than stalling it.
 */
const ACTION_ALIASES: Readonly<Record<string, 'NEXT' | 'FOLLOWUP' | 'END'>> = {
  NEXT: 'NEXT',
  FOLLOWUP: 'FOLLOWUP',
  END: 'END',
  FINISH: 'END',
  COMPLETE: 'END',
};

/** Strip the Markdown fence an LLM likes to wrap JSON in, then trim. */
function stripCodeFence(raw: string): string {
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

/** Read `strategy`, defaulting to 1 when the model omitted or zeroed it. */
function strategyOf(parsed: Record<string, unknown>): number {
  const strategy = parsed['strategy'];
  return typeof strategy === 'number' && strategy !== 0 ? strategy : 1;
}

/** True when `value` is a non-null object, i.e. an object we may read fields off. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * True when the payload carries what the graph needs.
 *
 * A bare `null` parses fine but is not an object, and reading a field off it
 * throws -- so it is rejected here rather than left to the field access. LLMs
 * really do answer with `null`, and this used to crash the turn. Both fields are
 * load-bearing: a missing action cannot drive the graph and a missing response
 * has nothing to say.
 */
function isUsablePayload(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  return Boolean(value['action']) && Boolean(value['response']);
}

/** Assemble the structured response, or null when the payload is unusable. */
function structuredFrom(parsed: unknown): StructuredResponse | null {
  if (!isUsablePayload(parsed)) return null;
  return {
    thinking: (parsed['thinking'] as string | undefined) ?? '',
    strategy: strategyOf(parsed),
    action: ACTION_ALIASES[String(parsed['action'])] ?? 'NEXT',
    response: parsed['response'] as string,
  };
}

export function parseLLMResponse(rawContent: string): StructuredResponse | null {
  try {
    return structuredFrom(JSON.parse(stripCodeFence(rawContent)));
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

/**
 * Messages rendered into the prompt.
 *
 * Issue #230: this used to be a fixed `slice(-6)` window, and the measured
 * consequence was a compliant interviewee repeating himself four times. In interview
 * `18811eb7` he said "我不是团队负责人，也不是质量接口人，我只是PQA" at 17:28 and again at
 * 17:29; by q9 (17:42) that clarification had slid out of the window, so the bot
 * asked about "您团队" and he had to correct it a fourth time. The window is a
 * memory eraser whose size has nothing to do with how much context the model can
 * take.
 *
 * The limit is a character budget rather than a turn count, because what matters is
 * prompt size. It is generous enough to hold a whole 14-question interview, so the
 * normal case is complete recall; it only trims on a pathologically long transcript,
 * where keeping the OLDEST messages and dropping the NEWEST would be worst of all.
 */
const HISTORY_CHAR_BUDGET = 24_000;

/**
 * Index of the first line to keep, given the rendered transcript.
 *
 * Trims from the front only when over budget: the most recent exchange is what the
 * model must reason about, while older material is what it tends to forget. Always
 * keeps at least the newest line, so an oversized single message still reaches the
 * model rather than rendering an empty history.
 */
function firstLineWithinBudget(lines: string[]): number {
  let total = lines.reduce((n, line) => n + line.length + 1, 0);
  let start = 0;
  while (total > HISTORY_CHAR_BUDGET && start < lines.length - 1) {
    total -= lines[start].length + 1;
    start += 1;
  }
  return start;
}

/** Render the conversation for the prompt, oldest first. */
function renderHistory(state: InterviewState): string {
  const rendered = state.messages.map(
    (m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content}`
  );
  return rendered.slice(firstLineWithinBudget(rendered)).join('\n');
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

/**
 * Call the LLM once and return both the raw text and the parsed payload.
 *
 * The raw text comes back even when parsing fails because the custom-prompt path
 * falls back to it: that template asked for the model's own words, so an answer
 * that is not JSON is still an answer.
 */
async function callAndParse(
  llm: OpenAICompatibleLLM,
  prompt: string
): Promise<{ raw: string; parsed: StructuredResponse | null }> {
  const response = await withRetry(() =>
    llm.chat({ messages: [{ role: 'user', content: prompt }] })
  );
  return { raw: response.content, parsed: parseLLMResponse(response.content) };
}

/**
 * Run one prompt through the LLM and turn the answer into a result.
 *
 * Both prompt paths (custom template and the default one) differ only in the
 * prompt text and in what gets logged when the answer is unusable, so the call,
 * the parse and the fallback live here once. `fallbackResponse` is a FUNCTION
 * because the two paths disagree about what an unparseable answer means: the
 * custom path hands the raw model text back, while the default path substitutes
 * a canned apology -- returning raw text there would send whatever the model
 * happened to say, unfiltered, straight to the interviewee.
 */
async function chatAndInterpret(
  llm: OpenAICompatibleLLM,
  prompt: string,
  fallbackResponse: (raw: string) => string,
  state: InterviewState,
  nextQuestion: string | undefined,
  onUnparseable: () => void
): Promise<SmartResponseResult> {
  const { raw, parsed } = await callAndParse(llm, prompt);
  if (!parsed) {
    onUnparseable();
    return nextResult(fallbackResponse(raw));
  }
  // Logged here rather than inside resultFromParsed so the diagnostic names the
  // cap explicitly; the cap itself is still applied in one place, for both paths.
  if (parsed.action === 'FOLLOWUP' && state.followupCount >= state.maxFollowups) {
    info('Followup limit exceeded, forcing NEXT');
  }
  return resultFromParsed(parsed, state.followupCount, state.maxFollowups, nextQuestion);
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
    try {
      return await chatAndInterpret(
        llm,
        renderCustomPrompt(customPrompt, vars),
        // The custom template asked for this model's own words, so an
        // unparseable answer is still an answer -- pass it through.
        (raw) => raw,
        state,
        nextQuestion,
        () => warn('Failed to parse custom prompt result as JSON, using raw text')
      );
    } catch {
      warn('Custom prompt LLM call failed');
      return nextResult(FALLBACK_RESPONSE);
    }
  }

  // Default system prompt
  const prompt = promptService.render('generateSmartResponse', { ...vars });

  try {
    return await chatAndInterpret(
      llm,
      prompt,
      () => FALLBACK_RESPONSE,
      state,
      nextQuestion,
      () => info('Failed to parse LLM response, using fallback')
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    info('Smart response generation failed', { error: errMsg });
    return nextResult(FALLBACK_RESPONSE);
  }
}
