import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySignature } from '../integrations/dingtalk/middleware.js';
import { error, info } from '../utils/logger.js';

interface DingTalkMessage {
  msgtype: 'text' | 'markdown' | 'voice' | 'image' | 'link' | 'actionCard' | 'feedCard';
  text?: { content: string };
  markdown?: { title: string; text: string };
  voice?: { media_id: string };
  image?: { media_id: string };
  link?: { messageUrl: string; picUrl: string; title: string; text: string };
  senderId?: string;
  timestamp?: number;
  signature?: string;
  event?: { msgtype: string };
}

function parseDingTalkMessage(body: DingTalkMessage): {
  userId: string;
  content: string;
  messageType: string;
  isVoice: boolean;
} | null {
  try {
    const messageType = body.msgtype;
    let content = '';
    let isVoice = false;

    if (messageType === 'text' && body.text) {
      content = body.text.content;
    } else if (messageType === 'voice' && body.voice) {
      content = body.voice.media_id;
      isVoice = true;
    } else if (body.event?.msgtype) {
      return null;
    }

    return {
      userId: body.senderId || 'unknown',
      content: content.trim(),
      messageType,
      isVoice,
    };
  } catch (e) {
    error('Failed to parse DingTalk message', {
      error: e instanceof Error ? e.message : 'Unknown',
    });
    return null;
  }
}

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: DingTalkMessage;
  }>(
    '/webhook',
    {
      preHandler: async (
        request: FastifyRequest<{ Body: DingTalkMessage }>,
        reply: FastifyReply
      ) => {
        const { timestamp, signature } = request.query as {
          timestamp?: string;
          signature?: string;
        };
        const secret = process.env.DINGTALK_SECRET;

        if (!timestamp || !signature || !secret) {
          return reply.status(401).send({ error: 'Missing parameters' });
        }

        const timestampNum = Number.parseInt(timestamp, 10);
        if (!verifySignature(timestampNum, secret, signature)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      },
    },
    async (request: FastifyRequest<{ Body: DingTalkMessage }>, reply: FastifyReply) => {
      const body = request.body;
      info('Received DingTalk webhook', {
        msgtype: body.msgtype,
        senderId: body.senderId,
      });

      const parsed = parseDingTalkMessage(body);
      if (!parsed) {
        return reply.status(200).send({ result: 'ignored' });
      }

      info('Message parsed', {
        userId: parsed.userId,
        contentLength: parsed.content.length,
        messageType: parsed.messageType,
        isVoice: parsed.isVoice,
      });

      return reply.status(200).send({ result: 'success' });
    }
  );
}

