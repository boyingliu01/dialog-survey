import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../../src/server.js';
import { getDingtalkService } from '../../../src/services/dingtalk.js';
import { InterviewRepository } from '../../../src/repositories/interview.js';
import { MessageRepository } from '../../../src/repositories/message.js';
import { getTemplateService } from '../../../src/services/template.js';
import { getConversationEngine } from '../../../src/services/conversation/index.js';

// Mock dependencies
vi.mock('../../../src/services/dingtalk.js');
vi.mock('../../../src/repositories/interview.js');
vi.mock('../../../src/repositories/message.js');
vi.mock('../../../src/services/template.js');
vi.mock('../../../src/services/conversation/index.js');

describe('Webhook API', () => {
  let server: FastifyInstance;
  const mockDingtalkService = {
    verifySignature: vi.fn(),
    parseWebhookMessage: vi.fn(),
  };
  const mockTemplateService = {
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
  };
  const mockConversationEngine = {
    startInterview: vi.fn(),
    processMessage: vi.fn(),
  };

  beforeAll(async () => {
    (getDingtalkService as vi.Mock).mockReturnValue(mockDingtalkService);
    (getTemplateService as vi.Mock).mockReturnValue(mockTemplateService);
    (getConversationEngine as vi.Mock).mockReturnValue(mockConversationEngine);
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
      
      // Mock no active interviews
      vi.mocked(InterviewRepository.findByUserId).mockResolvedValue([]);
      
      // Mock template service
      mockTemplateService.getTemplate.mockReturnValue({
        id: 'quality_survey',
        name: 'Quality Survey',
        description: 'Test template',
        topics: [],
        questions: [],
      });
      
      // Mock conversation engine
      mockConversationEngine.startInterview.mockResolvedValue('Welcome to the interview!');
      
      // Mock interview creation
      vi.mocked(InterviewRepository.findBySessionId).mockResolvedValue({
        id: 1,
        sessionId: 'interview_test',
        userId: 'test-user-id',
        templateId: 'quality_survey',
        status: 'IN_PROGRESS',
        conversationHistory: [],
        extractedInfo: {},
        reportPath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      
      vi.mocked(MessageRepository.create).mockResolvedValue({} as any);

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