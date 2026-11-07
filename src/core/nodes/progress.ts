/**
 * Progress marking for messages sent to the interviewee (issue #228).
 *
 * The interviewee could not tell how far along the interview was. `questionProgress`
 * existed, but it was injected only into the LLM prompt — the person answering never
 * saw it, so a 14-question interview felt open-ended. In the measured case the
 * interviewee asked twice whether the conversation would ever end, despite the opening
 * message promising "25-35 minutes", and two lost interviews died mid-way for the same
 * reason.
 *
 * Two rules follow from that, and both are enforced here rather than in the prompt:
 *
 * 1. The marker is composed by CODE, not by the model. #203 measured how unreliable a
 *    prompt-level requirement is on this stack (~40% compliance on a similar soft
 *    instruction), and progress has to appear on every single turn.
 * 2. It is a quiet LINE, not a prefix inside the sentence. A leading `[3/14]` injects
 *    machine noise at the exact point the model is trying to talk like a person, which
 *    fights the assistant's own "chat naturally" principle. A trailing line reads as a
 *    status footer and leaves the conversational text untouched.
 */

/** Shape of the footer: one integer per side, some separator, end of line. */
const PROGRESS_FOOTER = /^—\s*\d+\s*\/\s*\d+\s*$/;

/**
 * Zero-based question index plus total, rendered for a human.
 *
 * Returns null when the total is unusable (no template, empty question list), because
 * "3/0" or "1/undefined" is worse than no marker at all — it tells the interviewee the
 * system does not know what it is doing.
 */
export function formatProgress(currentQuestion: number, totalQuestions: number): string | null {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return null;
  if (!Number.isFinite(currentQuestion) || currentQuestion < 0) return null;
  // Clamped so a state left past the end by an early END cannot render "15/14".
  const shown = Math.min(currentQuestion + 1, totalQuestions);
  return `${shown}/${totalQuestions}`;
}

/**
 * Append the progress footer to a message, idempotently.
 *
 * Idempotent because some exits are reached twice (a coerced follow-up re-enters the
 * advance path); a duplicated footer would be visible noise. A message that already
 * ends with a footer is returned untouched.
 */
export function withProgressFooter(
  message: string,
  currentQuestion: number,
  total: number
): string {
  const progress = formatProgress(currentQuestion, total);
  if (!progress) return message;
  const trimmed = message.trimEnd();
  if (!trimmed) return message;
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
  if (PROGRESS_FOOTER.test(lastLine.trim())) return message;
  return `${trimmed}\n— ${progress}`;
}
