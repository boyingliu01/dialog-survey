/**
 * Recognising a "start" signal that is not an answer (issue #231).
 *
 * Templates end their invitation with "准备好了直接回复任意消息，我们就开始", so the
 * system explicitly invites a message that must NOT be recorded as an answer. In the
 * measured 14-question interview the interviewee sent "现在可以开始", got the greeting,
 * then sent "开始" and "开始" again; all three were written to `Response` as answers.
 * Two of the 14 slots were consumed by non-answers, and the data recorded for q0 is
 * literally the word "开始".
 *
 * The classification is deliberately NARROW. A false positive is worse than a miss:
 * treating a real answer as a start signal would discard what the interviewee said,
 * while a missed signal only costs one slot with the current prompt's behaviour. So
 * `isStartSignal` accepts a message only when it is short AND consists purely of
 * start vocabulary — never a sentence that merely opens with "开始".
 */

/**
 * Signal phrases, longest-first so the alternation cannot match a prefix of a
 * longer phrase. Written without global state because the regex is reused.
 */
const SIGNAL_PHRASES = [
  '现在可以开始了',
  '现在可以开始',
  '可以开始了',
  '可以开始',
  '开始访谈',
  '开始吧',
  '开始了',
  '开始',
  '好的开始',
  '这就开始',
  '我准备好了',
  '准备好了',
  '随时可以',
].join('|');

/**
 * Filler a person types around a one-word command ("好的，开始", "嗯 可以开始了").
 *
 * Kept separate from the signal phrases so the alternation stays readable, and so
 * the leading filler is optional — a bare "开始" must still match.
 */
const FILLER = '[\\s，,。.、!！~～]*';
const LEADING_FILLER = '(?:好的|好|嗯|嗯嗯|那|那就)';

/** A whole message that is only a signal phrase, optionally with filler/punctuation. */
const SIGNAL_ONLY = new RegExp(
  `^${FILLER}(?:${LEADING_FILLER})?${FILLER}(?:${SIGNAL_PHRASES})${FILLER}$`,
  'u'
);

/**
 * Strip the padding an interviewee types around a one-word message.
 *
 * Only whitespace and punctuation are removed, so "开始" and "开始。" classify the
 * same way while "开始我的工作汇报" keeps its middle and is correctly rejected.
 */
function normalize(text: string): string {
  return text.trim();
}

/**
 * True when the message is a bare start signal rather than an answer.
 *
 * Length is capped before any regex work: a signal is a short utterance, and
 * without the cap a 200-character paragraph beginning with "可以开始了，我们那个项目
 * 其实..." would have to be fully pattern-matched to be correctly rejected. The
 * bound is checked first so pathological input never reaches the alternation.
 */
export function isStartSignal(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  // Generous but bounded: the longest accepted phrase plus punctuation fits well
  // inside this, and no genuine answer is this short AND purely signal words.
  if (normalized.length > 12) return false;
  return SIGNAL_ONLY.test(normalized);
}

/** The acknowledgement sent when a start signal is recognised. */
export const START_SIGNAL_REPLY = '好的，我们这就开始～';
