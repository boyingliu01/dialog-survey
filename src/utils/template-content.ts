/**
 * Template content helpers shared by the analysis, export and admin API layers.
 *
 * Template `content` is stored as a JSON string whose `questions` array holds the
 * ordered question texts. Callers need the same `q0`-style id → text mapping, so
 * it lives here rather than being re-implemented per layer.
 */

/**
 * Build a `q<i>` → question-text map from a template's raw `content` JSON.
 *
 * Returns an empty map for missing or unparsable content so a malformed template
 * degrades to showing raw question ids instead of failing the whole request.
 */
export function buildQuestionMap(contentJson: string | null | undefined): Record<string, string> {
  if (!contentJson) return {};
  try {
    const parsed = JSON.parse(contentJson) as { questions?: string[] };
    const questions = parsed.questions || [];
    const map: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      map[`q${i}`] = questions[i];
    }
    return map;
  } catch {
    return {};
  }
}
