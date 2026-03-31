import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DingTalkService } from '../../../src/services/dingtalk';
import { DingTalkMessage } from '../../../src/services/dingtalk/types';

describe('DingTalkService', () => {
  const mockConfig = {
    appKey: 'testAppKey',
    appSecret: 'testAppSecret',
    agentId: 'testAgentId',
    token: 'testToken',
    aesKey: 'testAesKey',
  };

  let dingTalkService: DingTalkService;

  beforeEach(() => {
    // Reset singleton instance
    // @ts-expect-error Accessing private static property
    DingTalkService.instance = null;
    dingTalkService = DingTalkService.getInstance(mockConfig);
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const timestamp = '1234567890';
      const nonce = 'randomNonce';
      const encrypt = 'testEncrypt';

      // Calculate expected signature
      const data = [mockConfig.token!, timestamp, nonce, encrypt].sort().join('');
      const expectedSignature = require('crypto')
        .createHash('sha1')
        .update(data)
        .digest('hex');

      const result = dingTalkService.verifySignature(expectedSignature, timestamp, nonce, encrypt);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = '1234567890';
      const nonce = 'randomNonce';
      const encrypt = 'testEncrypt';

      const result = dingTalkService.verifySignature('invalidSignature', timestamp, nonce, encrypt);

      expect(result).toBe(false);
    });

    it('should return false when token is not configured', () => {
      // @ts-expect-error Accessing private property
      dingTalkService['config'] = { ...mockConfig, token: undefined };

      const result = dingTalkService.verifySignature('anySignature', '1234567890', 'randomNonce', 'testEncrypt');

      expect(result).toBe(false);
    });
  });

  describe('parseMessage', () => {
    it('should parse valid text message', () => {
      const rawData = {
        msgtype: 'text',
        text: {
          content: 'Hello, world!',
        },
      };

      const result = dingTalkService.parseMessage(rawData);

      expect(result).not.toBeNull();
      expect(result?.msgtype).toBe('text');
      expect(result?.text?.content).toBe('Hello, world!');
    });

    it('should parse valid voice message', () => {
      const rawData = {
        msgtype: 'voice',
        voice: {
          media_id: 'testMediaId',
          duration: 10,
        },
      };

      const result = dingTalkService.parseMessage(rawData);

      expect(result).not.toBeNull();
      expect(result?.msgtype).toBe('voice');
      expect(result?.voice?.media_id).toBe('testMediaId');
      expect(result?.voice?.duration).toBe(10);
    });

    it('should return null for invalid message', () => {
      const rawData = {
        invalidField: 'value',
      };

      const result = dingTalkService.parseMessage(rawData);

      expect(result).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should cache access token', async () => {
      const mockToken = 'testAccessToken';
      const mockExpiresIn = 7200; // 2 hours

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: 'ok',
          access_token: mockToken,
          expires_in: mockExpiresIn,
        }),
      } as Response);

      // First call should make API request
      const token1 = await dingTalkService.getAccessToken();
      expect(token1).toBe(mockToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should return cached token
      const token2 = await dingTalkService.getAccessToken();
      expect(token2).toBe(mockToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when expired', async () => {
      const mockToken1 = 'testAccessToken1';
      const mockToken2 = 'testAccessToken2';
      const mockExpiresIn = 1; // 1 second

      // Mock fetch
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken1,
            expires_in: mockExpiresIn,
          }),
        } as Response)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken2,
            expires_in: mockExpiresIn,
          }),
        } as Response);

      // First call should get new token
      const token1 = await dingTalkService.getAccessToken();
      expect(token1).toBe(mockToken1);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Fast forward time beyond expiration
      vi.useFakeTimers();
      vi.advanceTimersByTime((mockExpiresIn * 1000) + 1000);

      // Second call should refresh token
      const token2 = await dingTalkService.getAccessToken();
      expect(token2).toBe(mockToken2);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('sendMessage', () => {
    it('should send text message to user', async () => {
      const mockToken = 'testAccessToken';
      const mockResponse = { errcode: 0, errmsg: 'ok' };

      // Mock fetch for access token
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken,
            expires_in: 7200,
          }),
        } as Response)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue(mockResponse),
        } as Response);

      const message: DingTalkMessage = {
        msgtype: 'text',
        text: { content: 'Test message' },
      };

      const result = await dingTalkService.sendToUser('testUser', message);

      expect(result).toEqual(mockResponse);
    });

    it('should send message to conversation', async () => {
      const mockToken = 'testAccessToken';
      const mockResponse = { errcode: 0, errmsg: 'ok' };

      // Mock fetch for access token
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            errcode: 0,
            errmsg: 'ok',
            access_token: mockToken,
            expires_in: 7200,
          }),
        } as Response)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue(mockResponse),
        } as Response);

      const message: DingTalkMessage = {
        msgtype: 'text',
        text: { content: 'Test message' },
      };

      const result = await dingTalkService.sendToConversation('testConversation', message);

      expect(result).toEqual(mockResponse);
    });
  });
});
