import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

// Mock DingTalk service for demo purposes
class MockDingTalkService {
  private readonly appSecret: string;

  constructor(appSecret: string) {
    this.appSecret = appSecret;
  }

  verifySignature(timestamp: string, signature: string, nonce: string): boolean {
    const signString = `${timestamp}\n${nonce}`;
    const hmac = crypto.createHmac('sha256', this.appSecret);
    const calculatedSignature = hmac.update(signString).digest('base64');
    return calculatedSignature === signature;
  }

  parseWebhookMessage(body: any): { msg_type: string; user_id: string; content: string } {
    const msg_type = body.msgtype || 'text';
    const user_id = body.senderStaffId || body.senderId || '';
    let content = '';

    if (msg_type === 'text') {
      content = body.text?.content || body.content?.text || '';
    }

    return {
      msg_type,
      user_id,
      content,
    };
  }
}

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  const dingtalkService = new MockDingTalkService('test-secret');

  // Verify webhook URL
  fastify.get('/webhook', async (request, reply) => {
    const { challenge, signature, timestamp, nonce } = request.query as any;

    // For initial webhook verification, DingTalk sends a challenge
    if (challenge) {
      fastify.log.info('Webhook verification successful');
      return { challenge };
    }

    // Verify signature for regular callback
    if (signature && timestamp && nonce) {
      const isValid = dingtalkService.verifySignature(timestamp, signature, nonce);
      if (!isValid) {
        return reply.status(403).send({
          code: 403,
          msg: 'Invalid signature',
        });
      }
    }

    return { code: 0, msg: 'success' };
  });

  // Handle incoming messages
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers.signature as string;
    const timestamp = request.headers.timestamp as string;
    const nonce = request.headers.nonce as string;

    if (!signature || !timestamp || !nonce) {
      return reply.status(403).send({
        code: 403,
        msg: 'Missing signature headers',
      });
    }

    const isValid = dingtalkService.verifySignature(timestamp, signature, nonce);
    if (!isValid) {
      return reply.status(403).send({
        code: 403,
        msg: 'Invalid signature',
      });
    }

    const messageData = dingtalkService.parseWebhookMessage(request.body);
    const { user_id, content, msg_type } = messageData;

    fastify.log.info('Received message from user=%s type=%s', user_id, msg_type);

    return {
      code: 0,
      msg: 'success',
      message: 'Message received',
    };
  });
};

export default webhookRoutes;
