import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/server.js';
import { getDingtalkService } from '../../../src/services/dingtalk.js';

// Mock dependencies
vi.mock('../../../src/services/dingtalk.js');

describe('Webhook API', () => {
  let server: FastifyInstance;
  const mockDingtalkService = {
    verifySignature: vi.fn(),
    parseWebhookMessage: vi.fn(),
  };

  beforeAll(async () => {
    (getDingtalkService as vi.Mock).mockReturnValue(mockDingtalkService);
    server = buildServer({
      skipPlugins: ['auth'],
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /api/webhook', () => {
    it('should verify webhook and return challenge', async () => {
      const challenge = 'test-challenge-123';
      const response = await server.inject({
        method: 'GET',
        url: `/api/webhook?signature=test-signature&timestamp=${Date.now().toString()}&nonce=test-nonce&challenge=${challenge}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.challenge).toEqual(challenge);
    });

    it('should verify signature and succeed', async () => {
      const timestamp = Date.now().toString();
      const signature = 'valid-signature';
      const nonce = 'test-nonce';

      mockDingtalkService.verifySignature.mockReturnValue(true);

      const response = await server.inject({
        method: 'GET',
        url: `/api/webhook?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toEqual(0);
      expect(body.msg).toEqual('success');
      expect(mockDingtalkService.verifySignature).toHaveBeenCalledWith(timestamp, signature, nonce);
    });
  });

  describe('POST /api/webhook', () => {
    it('should reject requests without signature', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/webhook',
        body: {
          msgtype: 'text',
          text: { content: 'test message' },
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.code).toEqual(403);
    });

    it('should reject invalid signature', async () => {
      const timestamp = Date.now().toString();
      const signature = 'invalid-signature';
      const nonce = 'test-nonce';

      mockDingtalkService.verifySignature.mockReturnValue(false);

      const response = await server.inject({
        method: 'POST',
        url: '/api/webhook',
        headers: {
          signature,
          timestamp,
          nonce,
        },
        body: {
          msgtype: 'text',
          text: { content: 'test message' },
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.code).toEqual(403);
    });

    it('should handle valid text message without session', async () => {
      const timestamp = Date.now().toString();
      const signature = 'valid-signature';
      const nonce = 'test-nonce';

      mockDingtalkService.verifySignature.mockReturnValue(true);
      mockDingtalkService.parseWebhookMessage.mockReturnValue({
        msg_type: 'text',
        user_id: 'test-user-id',
        content: '开始',
        conversation_id: 'test-conversation-id',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/webhook',
        headers: {
          signature,
          timestamp,
          nonce,
        },
        body: {
          msgtype: 'text',
          text: { content: '开始' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.code).toEqual(0);
      expect(body.msg).toEqual('success');
    });
  });
});
