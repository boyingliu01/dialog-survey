import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

const DINGTALK_SECRET = 'test-secret-for-webhook';

function genSig(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
}

function webhookUrl(): string {
  const timestamp = String(Date.now());
  const signature = genSig(Number.parseInt(timestamp, 10), DINGTALK_SECRET);
  return `/webhook?timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`;
}

describe('POST /webhook', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DINGTALK_SECRET = DINGTALK_SECRET;
    app = Fastify({ logger: false });
    const { webhookRoutes } = await import('../src/api/webhook.js');
    await app.register(webhookRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env.DINGTALK_SECRET = '';
  });

  it('should return 401 when timestamp is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: { msgtype: 'text', text: { content: 'hello' } },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Missing parameters');
  });

  it('should return 401 when signature is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook?timestamp=12345',
      payload: { msgtype: 'text', text: { content: 'hello' } },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Missing parameters');
  });

  it('should return 401 when signature is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhook?timestamp=12345&signature=invalid',
      payload: { msgtype: 'text', text: { content: 'hello' } },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Invalid signature');
  });

  it('should return 200 with result "success" for valid text message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl(),
      payload: {
        msgtype: 'text',
        text: { content: 'Hello from DingTalk' },
        senderId: 'user123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('success');
  });

  it('should return 200 with result "ignored" for event messages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl(),
      payload: {
        msgtype: 'text',
        event: { msgtype: 'event_callback' },
        senderId: 'user123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('ignored');
  });

  it('should return 200 for voice message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl(),
      payload: {
        msgtype: 'voice',
        voice: { media_id: 'media_001' },
        senderId: 'user456',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('success');
  });

  it('should return 200 for unknown message type with no event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl(),
      payload: {
        msgtype: 'link',
        link: { messageUrl: 'https://example.com', picUrl: '', title: 'Link', text: 'text' },
        senderId: 'user789',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('success');
  });

  it('should return 200 with result "success" when text content is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl(),
      payload: {
        msgtype: 'text',
        text: { content: '' },
        senderId: 'user-empty',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('success');
  });
});
