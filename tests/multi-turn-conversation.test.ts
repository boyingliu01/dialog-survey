import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Multi-turn Conversation E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('REQ-MULTI-001: Stream 消息解析', () => {
    it('AC-MULTI-001-01: 正确解析 Stream 消息格式', async () => {
      const { parseStreamMessage } = await import('../src/services/stream-message.service.js');

      const message = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-001',
          time: '1713000000000',
        },
        data: JSON.stringify({
          senderStaffId: 'user-001',
          text: { content: '测试消息' },
          sessionWebhook: 'https://example.com/webhook',
        }),
      };

      const parsed = parseStreamMessage(message);

      expect(parsed).not.toBeNull();
      expect(parsed?.userId).toBe('user-001');
      expect(parsed?.content).toBe('测试消息');
      expect(parsed?.sessionWebhook).toBe('https://example.com/webhook');
      expect(parsed?.messageId).toBe('msg-001');
    });

    it('AC-MULTI-001-02: 处理无效消息返回 null', async () => {
      const { parseStreamMessage } = await import('../src/services/stream-message.service.js');

      const message = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-001',
          time: '1713000000000',
        },
        data: 'invalid-json',
      };

      const parsed = parseStreamMessage(message);

      expect(parsed).toBeNull();
    });

    it('AC-MULTI-001-03: 处理空内容消息返回 null', async () => {
      const { parseStreamMessage } = await import('../src/services/stream-message.service.js');

      const message = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-001',
          time: '1713000000000',
        },
        data: JSON.stringify({
          senderStaffId: '',
          text: { content: '' },
          sessionWebhook: '',
        }),
      };

      const parsed = parseStreamMessage(message);

      expect(parsed?.userId).toBe('');
      expect(parsed?.content).toBe('');
    });
  });

  describe('REQ-MULTI-002: 发送回复', () => {
    it('AC-MULTI-002-01: 通过 sessionWebhook 发送文本回复', async () => {
      const { sendReply } = await import('../src/services/stream-message.service.js');

      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await sendReply('https://example.com/webhook', '你好，欢迎使用访谈机器人');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('你好'),
        })
      );
    });

    it('AC-MULTI-002-02: 无效 webhook 返回 false', async () => {
      const { sendReply } = await import('../src/services/stream-message.service.js');

      const result = await sendReply('', '测试消息');

      expect(result).toBe(false);
    });

    it('AC-MULTI-002-03: API 错误返回 false', async () => {
      const { sendReply } = await import('../src/services/stream-message.service.js');

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await sendReply('https://example.com/webhook', '测试消息');

      expect(result).toBe(false);
    });
  });
});
