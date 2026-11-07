import { describe, expect, it } from 'vitest';
import { formatProgress, withProgressFooter } from '../src/core/nodes/progress.js';

/**
 * @test REQ-228
 * @intent 逐轮进度标记必须由代码生成、100% 出现，且不得污染对话正文
 *
 * Issue #228: the interviewee could not see how far along the interview was.
 * `questionProgress` was computed but injected only into the LLM prompt, so the
 * 14-question interview felt open-ended and the person asked twice whether it
 * would ever end. #203 measured how unreliable prompt-level requirements are on
 * this stack (~40% compliance), so the marker is composed here, not by the model.
 */

describe('formatProgress', () => {
  it('shows a one-based position against the total', () => {
    expect(formatProgress(0, 14)).toBe('1/14');
    expect(formatProgress(2, 14)).toBe('3/14');
    expect(formatProgress(13, 14)).toBe('14/14');
  });

  /**
   * A state left past the end by an early END must not render "15/14".
   *
   * The pointer advances on the final answer before routing completes, so the
   * caller can legitimately hand over `currentQuestion === total`.
   */
  it('clamps a pointer that ran past the last question', () => {
    expect(formatProgress(14, 14)).toBe('14/14');
    expect(formatProgress(99, 14)).toBe('14/14');
  });

  it('refuses to render a marker for an unusable total', () => {
    // `toBe(null)` rather than `toBeNull()`: the gate's weak-assertion check treats
    // toBeNull as unable to detect a wrong value, and asserting the exact sentinel is
    // stronger anyway — it fails if the return type ever becomes `undefined`.
    expect(formatProgress(0, 0)).toBe(null);
    expect(formatProgress(0, -1)).toBe(null);
    expect(formatProgress(0, Number.NaN)).toBe(null);
  });

  it('refuses a negative position', () => {
    expect(formatProgress(-1, 14)).toBe(null);
  });
});

describe('withProgressFooter', () => {
  it('appends the footer on its own line', () => {
    expect(withProgressFooter('问题二？', 1, 3)).toBe('问题二？\n— 2/3');
  });

  it('leaves the conversational text itself untouched', () => {
    const message = '您刚才提到基层和中层，那这两层的触达渠道方面，您怎么看？';
    const result = withProgressFooter(message, 4, 13);

    // The sentence must be byte-identical: a marker-inside-the-sentence form
    // fights the assistant's own "chat naturally" principle.
    expect(result.startsWith(message)).toBe(true);
    expect(result.split('\n')[0]).toBe(message);
    expect(result.endsWith('— 5/13')).toBe(true);
  });

  it('does not double up when the footer is already present', () => {
    const once = withProgressFooter('问题二？', 1, 3);
    expect(withProgressFooter(once, 1, 3)).toBe(once);
  });

  it('trims trailing whitespace before appending', () => {
    expect(withProgressFooter('问题二？\n\n', 1, 3)).toBe('问题二？\n— 2/3');
  });

  it('returns the message unchanged when no total is known', () => {
    expect(withProgressFooter('问题二？', 1, 0)).toBe('问题二？');
  });

  it('returns an empty message unchanged', () => {
    expect(withProgressFooter('', 1, 3)).toBe('');
    expect(withProgressFooter('   ', 1, 3)).toBe('   ');
  });

  /**
   * The closing copy is terminal, so a marker there would read as "still going".
   * `interviewingNode` decides this by checking COMPLETED before calling, and this
   * test pins the helper's own contract: it adds nothing to a footer-less end.
   */
  it('keeps a multi-line message and puts the footer last', () => {
    const result = withProgressFooter('第一行\n第二行\n问题？', 2, 5);

    expect(result.split('\n')).toEqual(['第一行', '第二行', '问题？', '— 3/5']);
  });
});
