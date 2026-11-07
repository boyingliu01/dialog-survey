import { describe, expect, it } from 'vitest';
import { START_SIGNAL_REPLY, isStartSignal } from '../src/services/start-signal.js';

/**
 * @test REQ-231
 * @intent 启动信号词不得被当作题目答案写入 Response（#231）
 *
 * Measured case: after the greeting, the interviewee sent "开始", a role
 * clarification, then "开始" again. q0 was stored as the literal string "开始" and
 * q1 as the clarification, so two of 14 slots carried no data.
 *
 * The asymmetry matters: a MISSED signal costs one slot, while a FALSE POSITIVE
 * throws away a real answer. Every negative case below is therefore as important
 * as the positive ones.
 */

describe('isStartSignal', () => {
  describe('recognises bare start signals', () => {
    it.each([
      ['开始', 'the exact text that consumed q0'],
      ['现在可以开始', 'the first message of the measured interview'],
      ['可以开始了', ''],
      ['开始吧', ''],
      ['开始了', ''],
      ['好的，开始', 'with punctuation'],
      ['开始。', 'trailing full stop'],
      ['  开始  ', 'surrounding whitespace'],
      ['开始！', 'exclamation'],
      ['我准备好了', ''],
      ['准备好了', ''],
      ['开始访谈', ''],
    ])('treats %s as a start signal (%s)', (text) => {
      expect(isStartSignal(text)).toBe(true);
    });
  });

  describe('does not swallow real answers', () => {
    it.each([
      ['开始我的工作汇报吧，上季度主要是做质量度量', 'a sentence that merely opens with 开始'],
      ['我们团队从去年开始做持续集成', 'mid-sentence vocabulary'],
      ['我还没有准备好，能先说说这次访谈的目的吗', 'a genuine question'],
      ['基层和中层', 'a short but real answer'],
      [
        '我不是团队负责人，也不是质量接口人，我只是PQA',
        'the clarification that was misfiled as q1',
      ],
      ['不太记得了', 'a short real answer'],
      ['', 'empty'],
      ['   ', 'whitespace only'],
      ['好的', 'a bare acknowledgement is not a start command'],
    ])('rejects %s (%s)', (text) => {
      expect(isStartSignal(text)).toBe(false);
    });
  });

  /**
   * The length cap is a guard against pathological input reaching the alternation,
   * so it has to be asserted directly rather than only through the examples above.
   */
  it('rejects anything longer than the signal bound', () => {
    const longSignal = '开始'.repeat(10);

    expect(isStartSignal(longSignal)).toBe(false);
  });

  it('is not confused by regex metacharacters in the input', () => {
    expect(isStartSignal('开.*始')).toBe(false);
    expect(isStartSignal('(开始)')).toBe(false);
  });

  it('exposes an acknowledgement reply for the caller to send', () => {
    expect(START_SIGNAL_REPLY).toContain('开始');
  });
});
