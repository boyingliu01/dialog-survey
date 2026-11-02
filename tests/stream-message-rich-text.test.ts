import { describe, expect, it } from 'vitest';
import { extractMessageContent, parseStreamMessage } from '../src/services/stream-message-utils.js';
import type { StreamMessage } from '../src/services/stream-message-utils.js';

function envelope(data: Record<string, unknown>): StreamMessage {
  return {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: {
      topic: '/v1.0/im/bot/messages/get',
      messageId: 'msg-1',
      time: '2024-01-01T00:00:00Z',
    },
    data: JSON.stringify(data),
  };
}

describe('parseStreamMessage content extraction', () => {
  it('keeps plain text answers unchanged', () => {
    const parsed = parseStreamMessage(
      envelope({ senderStaffId: 'u1', text: { content: '普通回答' } })
    );
    expect(parsed?.content).toBe('普通回答');
  });

  it('flattens richText segments sent as strings', () => {
    const data = {
      senderStaffId: 'u1',
      msgtype: 'richText',
      content: { richText: ['第一段，', '第二段。'] },
    };
    expect(parseStreamMessage(envelope(data))?.content).toBe('第一段，第二段。');
  });

  it('flattens richText segments sent as text objects and drops pictures', () => {
    const data = {
      senderStaffId: 'u1',
      msgtype: 'richText',
      content: {
        richText: [
          { text: '规范条款太细，' },
          { type: 'picture', downloadCode: 'x' },
          { text: '维护成本高。' },
        ],
      },
    };
    expect(parseStreamMessage(envelope(data))?.content).toBe('规范条款太细，维护成本高。');
  });

  it('never stringifies an object payload into [object Object]', () => {
    const data = {
      senderStaffId: 'u1',
      msgtype: 'richText',
      content: { richText: [{ text: 'ok' }] },
    };
    const content = parseStreamMessage(envelope(data))?.content ?? '';
    expect(content).toBe('ok');
    expect(content).not.toBe('[object Object]');
  });

  it('accepts a string content field', () => {
    expect(
      parseStreamMessage(envelope({ senderStaffId: 'u1', content: '来自 content 的文本' }))?.content
    ).toBe('来自 content 的文本');
  });

  it('falls back to markdown text', () => {
    const data = {
      senderStaffId: 'u1',
      msgtype: 'markdown',
      markdown: { title: 't', text: '### 标题\n正文' },
    };
    expect(parseStreamMessage(envelope(data))?.content).toBe('### 标题\n正文');
  });

  it('returns empty content for messages without readable text', () => {
    const data = {
      senderStaffId: 'u1',
      msgtype: 'picture',
      content: { downloadCode: 'abc', pictureDownloadCode: 'def' },
    };
    expect(parseStreamMessage(envelope(data))?.content).toBe('');
  });

  it('returns empty content when richText has no text segments', () => {
    expect(
      extractMessageContent({ senderStaffId: 'u1', content: { richText: [{ type: 'picture' }] } })
    ).toBe('');
  });
});
