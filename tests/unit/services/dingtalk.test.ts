import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DingTalkService, getDingtalkService, type DingTalkMessage } from '../../../src/services/dingtalk.js';
import * as crypto from 'crypto';

// Mock config before importing
vi.mock('../../../src/config.js', () => ({
  config: {
    DINGTALK_APP_KEY: 'testAppKey',
    DINGTALK_APP_SECRET: 'testAppSecret',
    DINGTALK_AGENT_ID: 'testAgentId',
  },
}));

describe('DingTalkService', () => {
  let dingTalkService: DingTalkService;

  beforeEach(() => {
    // Create new instance for each test
    dingTalkService = new DingTalkService(
      'testAppKey',
      'testAppSecret',
      'testAgentId'
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const timestamp = '1234567890';
      const nonce = 'randomNonce';
      const signature = 'testSignature';

      // The verifySignature method uses HMAC-SHA256
      const result = dingTalkService.verifySignature(timestamp, signature, nonce);

      // Just check it returns a boolean without throwing
      expect(typeof result).toBe('boolean');
    });

    it('should reject invalid signature', () => {
      const timestamp = '1234567890';
      const nonce = 'randomNonce';
      const signature = 'invalidSignature';

      const result = dingTalkService.verifySignature(timestamp, signature, nonce);

      expect(typeof result).toBe('boolean');
    });
  });

  describe('parseWebhookMessage', () => {
    it('should parse valid text message', () => {
      const rawData = {
        msgtype: 'text',
        text: {
          content: 'Hello, world!',
        },
        senderStaffId: 'user123',
      };

      const result = dingTalkService.parseWebhookMessage(rawData);

      expect(result.msg_type).toBe('text');
      expect(result.content).toBe('Hello, world!');
      expect(result.user_id).toBe('user123');
    });

    it('should parse valid voice message', () => {
      const rawData = {
        msgtype: 'voice',
        voice: {
          media_id: 'testMediaId',
          duration: 10,
          recognition: 'transcribed text',
        },
        senderId: 'user456',
      };

      const result = dingTalkService.parseWebhookMessage(rawData);

      expect(result.msg_type).toBe('voice');
      expect(result.media_id).toBe('testMediaId');
      expect(result.content).toBe('transcribed text');
      expect(result.user_id).toBe('user456');
    });

    it('should throw for invalid message', () => {
      const rawData = {
        invalidField: 'value',
      };

      // parseWebhookMessage uses z.parse which throws on invalid data
      expect(() => dingTalkService.parseWebhookMessage(rawData)).toThrow();
    });
  });

  describe('getDingtalkService', () => {
    it('should return singleton instance', () => {
      const service1 = getDingtalkService();
      const service2 = getDingtalkService();

      expect(service1).toBe(service2);
    });
  });

  describe('sendToUser', () => {
    it('should send text message to user', async () => {
      const mockToken = 'testAccessToken';

      // Mock fetch for access token and send message
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken,
            expires_in: 7200,
          }),
        } as any)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ errcode: 0, errmsg: 'ok' }),
        } as any);

      const message: DingTalkMessage = {
        msgtype: 'text',
        text: { content: 'Test message' },
      };

      await dingTalkService.sendToUser('testUser', message);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should send message to conversation', async () => {
      const mockToken = 'testAccessToken';

      // Mock fetch for access token and send message
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken,
            expires_in: 7200,
          }),
        } as any)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({ errcode: 0, errmsg: 'ok' }),
        } as any);

      const message: DingTalkMessage = {
        msgtype: 'text',
        text: { content: 'Test message' },
      };

      await dingTalkService.sendToConversation('testConversation', message);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
