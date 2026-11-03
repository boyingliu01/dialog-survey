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

    it('returns empty content when richText is not an array', () => {
      const parsed = parseStreamMessage(
        makeMessage({ ...SENDER, msgtype: 'richText', content: { richText: 'not-an-array' } })
      );

      expect(parsed?.content).toBe('');
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
  });
});
