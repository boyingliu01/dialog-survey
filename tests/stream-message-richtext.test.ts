import { describe, expect, it } from 'vitest';
import { parseStreamMessage } from '../src/services/stream-message-utils.js';
import type { StreamMessage } from '../src/services/stream-message-utils.js';

/**
 * Regression tests for issue #221 — a formatted (richText) reply arrived as
 * `{ msgtype: 'richText', content: { richText: [...] } }`, `parseStreamMessage`
 * took the object branch of `String(rawContent)` and produced the literal
 * `"[object Object]"`. That string is truthy and non-empty, so it passed every
 * downstream guard, was written to Message/Response as the user's answer, and
 * the interview advanced to the next question with the real answer discarded.
 *
 * The contract these tests pin: the parser returns the user's TEXT or `''`, and
 * never the string form of an object.
 */
function makeMessage(data: Record<string, unknown>, messageId = 'msg-rich'): StreamMessage {
  return {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: {
      topic: '/v1.0/im/bot/messages/get',
      messageId,
      time: '2026-11-02T09:50:03Z',
    },
    data: JSON.stringify(data),
  };
}

const SENDER = { senderStaffId: 'user-123', sessionWebhook: 'https://oapi.dingtalk.com/session' };

describe('parseStreamMessage — DingTalk rich text (issue #221)', () => {
  describe('richText content', () => {
    it('joins the text segments of a richText message', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: {
            richText: [{ text: '第一段回答' }, { text: '，第二段回答' }],
          },
        })
      );

      expect(parsed?.content).toBe('第一段回答，第二段回答');
    });

    it('drops picture/voice/file segments and keeps only the text', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: {
            richText: [
              { text: '这是文字' },
              { downloadCode: 'pic-code', type: 'picture' },
              { downloadCode: 'voice-code', type: 'voice' },
              { text: '结尾文字' },
            ],
          },
        })
      );

      expect(parsed?.content).toBe('这是文字结尾文字');
    });

    it('accepts a richText array of bare strings', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: { richText: ['纯字符串', '分段'] },
        })
      );

      expect(parsed?.content).toBe('纯字符串分段');
    });

    it('returns empty content for a richText payload of media segments only', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: { richText: [{ downloadCode: 'pic-code', type: 'picture' }] },
        })
      );

      expect(parsed?.content).toBe('');
      expect(parsed?.content).not.toContain('object');
    });

    it('treats a plain string richText value as the answer, not as nothing', () => {
      // DingTalk always sends an array here, but if a client sends the text
      // directly it IS the user's answer: dropping it would reproduce the very
      // "reply silently discarded" failure this issue is about.
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, msgtype: 'richText', content: { richText: '直接给的文本' } })
      );

      expect(parsed?.content).toBe('直接给的文本');
    });

    it('flattens a quoted block nested one level deeper', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: {
            richText: [
              { text: '引用：' },
              { richText: [{ text: '被引用的原文' }] },
              { content: ['尾巴'] },
            ],
          },
        })
      );

      expect(parsed?.content).toBe('引用：被引用的原文尾巴');
    });

    it('skips null segments and segments whose text is not a string', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: { richText: [null, { text: 42 }, { text: '保留' }] },
        })
      );

      expect(parsed?.content).toBe('保留');
    });
  });

  describe('non-text messages degrade to empty content', () => {
    it('returns empty content for a picture message', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'picture',
          content: { downloadCode: 'pic-code', pictureDownloadCode: 'x' },
        })
      );

      expect(parsed?.content).toBe('');
    });

    it('returns empty content for a voice message', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'voice',
          content: { downloadCode: 'voice-code', duration: 3000 },
        })
      );

      expect(parsed?.content).toBe('');
    });

    it('returns empty content for a file message', () => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, msgtype: 'file', content: { downloadCode: 'file-code' } })
      );

      expect(parsed?.content).toBe('');
    });

    it('returns empty content for an empty object body', () => {
      const parsed = parseStreamMessage(makeMessage({ ...SENDER, content: {} }));

      expect(parsed?.content).toBe('');
    });
  });

  describe('the "[object Object]" leak is impossible', () => {
    const objectBodies: Array<[string, unknown]> = [
      ['richText', { richText: [{ text: '真实回答' }] }],
      ['picture', { downloadCode: 'pic' }],
      ['unknown shape', { nested: { deep: true } }],
      ['array content', ['a', 'b']],
      ['number content', 12345],
      ['null content', null],
    ];

    for (const [label, content] of objectBodies) {
      it(`never stringifies ${label} content into a message body`, () => {
        const parsed = parseStreamMessage(makeMessage({ ...SENDER, msgtype: 'unknown', content }));

        expect(parsed).not.toBeNull();
        expect(parsed?.content ?? '').not.toBe('[object Object]');
        expect(parsed?.content ?? '').not.toContain('object Object');
        expect(parsed?.userId).toBe('user-123');
      });
    }

    it('falls back to markdown.text when the body is a markdown message', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'markdown',
          markdown: { title: '标题', text: '### 回答\n已完成培训' },
        })
      );

      expect(parsed?.content).toBe('### 回答\n已完成培训');
    });

    it('prefers text.content over content for a plain text message', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'text',
          text: { content: '纯文本' },
          content: { richText: [{ text: '不应使用' }] },
        })
      );

      expect(parsed?.content).toBe('纯文本');
    });

    it('ignores a non-string text.content and falls through to content', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'text',
          text: { content: { bogus: true } },
          content: { richText: [{ text: '回退内容' }] },
        })
      );

      expect(parsed?.content).toBe('回退内容');
    });

    it('ignores a non-string markdown.text', () => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, msgtype: 'markdown', markdown: { text: { bogus: true } } })
      );

      expect(parsed?.content).toBe('');
    });

    it('still keeps the metadata for a message with no usable text', () => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, msgtype: 'picture', content: { downloadCode: 'pic' } }, 'msg-9')
      );

      expect(parsed).toEqual({
        userId: 'user-123',
        content: '',
        sessionWebhook: 'https://oapi.dingtalk.com/session',
        messageId: 'msg-9',
      });
    });

    it('narrows a non-string senderStaffId to an empty id instead of leaking an object', () => {
      // Same failure mode as the content bug, on a different field: `obj || ''`
      // keeps the object, which then reaches the repository as a lookup key.
      const parsed = parseStreamMessage(
        makeMessage({
          senderStaffId: { staffId: 'user-123' },
          text: { content: '还有正文' },
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        })
      );

      expect(parsed?.userId).toBe('');
      expect(parsed?.content).toBe('还有正文');
    });

    it('narrows a non-string sessionWebhook to an empty webhook', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          senderStaffId: 'user-123',
          text: { content: '正文' },
          sessionWebhook: { url: 'https://oapi.dingtalk.com/session' },
        })
      );

      expect(parsed?.sessionWebhook).toBe('');
      expect(parsed?.content).toBe('正文');
    });
  });

  /**
   * The extraction ladder has four branches that each need their own input to be
   * exercised; mutation testing (Gate M) found the richText branches at
   * `text.content` and `content` surviving because every existing fixture went
   * through the plain-string path first. Each case below is chosen so that
   * removing its branch changes the result.
   */
  describe('extraction ladder branches', () => {
    it('reads richText segments nested under text.content', () => {
      // Some clients put the segments under `text` rather than top-level
      // `content`; without the textRich branch this returns '' and the reply is
      // lost — the exact failure issue #221 is about.
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          text: { content: { richText: [{ text: '挂在 text 下面的富文本' }] } },
        })
      );

      expect(parsed?.content).toBe('挂在 text 下面的富文本');
    });

    it('prefers a string text.content over anything under content', () => {
      // Pins the ORDER of the ladder: a plain text body must win over a
      // richText body if a client ever sends both.
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          text: { content: '纯文本正文' },
          content: { richText: [{ text: '不应被采用' }] },
        })
      );

      expect(parsed?.content).toBe('纯文本正文');
    });

    it('trims a whitespace-only richText body instead of accepting it', () => {
      // The `.trim()` on the richText branches is what stops a body of spaces
      // from counting as an answer; without it the empty-content guard upstream
      // never fires and a blank reply advances the interview.
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          msgtype: 'richText',
          content: { richText: [{ text: '   ' }, { text: '\n\t' }] },
        })
      );

      expect(parsed?.content).toBe('');
    });

    it('falls through to markdown when the richText body is empty', () => {
      const parsed = parseStreamMessage(
        makeMessage({
          ...SENDER,
          content: { richText: [] },
          markdown: { text: 'markdown 里的正文' },
        })
      );

      expect(parsed?.content).toBe('markdown 里的正文');
    });

    it('returns empty content for a payload with no recognised text field', () => {
      // readField must not throw on a primitive container and must yield ''.
      const parsed = parseStreamMessage(makeMessage({ ...SENDER, content: 42 }));

      expect(parsed?.content).toBe('');
      expect(parsed?.content).not.toContain('object');
    });

    it('returns empty content when content is an object with no text segments', () => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, content: { downloadCode: 'only-a-picture' } })
      );

      expect(parsed?.content).toBe('');
    });

    /**
     * `readField` guards every untyped JSON level. Its two early-exit conditions
     * are only observable through inputs that actually reach them, so each shape
     * below is a distinct case rather than a restatement of the same one.
     */
    it.each([
      ['null text', { text: null }],
      ['string text', { text: 'not-an-object' }],
      ['numeric text', { text: 7 }],
      ['array text', { text: [] }],
    ])('survives a %s field without stringifying it', (_label, payload) => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, ...payload, markdown: { text: '兜底正文' } })
      );

      // Every shape must fall through to markdown, never yield "[object Object]".
      expect(parsed?.content).toBe('兜底正文');
      expect(parsed?.content).not.toContain('[object');
    });

    it('survives a null top-level content field', () => {
      const parsed = parseStreamMessage(makeMessage({ ...SENDER, content: null }));

      expect(parsed?.content).toBe('');
    });
  });
});
