import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifySignature } from '../integrations/dingtalk/middleware.js';
import { processStreamMessage } from '../services/stream-message.service.js';
import { error, info } from '../utils/logger.js';

// In-memory dedup cache for DingTalk message IDs (prevents replay attacks)
const seenMessageIds = new Set<string>();
const MAX_SEEN_IDS = 10_000;

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
  messageId?: string;
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

      if (body.messageId) {
        if (seenMessageIds.has(body.messageId)) {
          return reply.status(200).send({ result: 'duplicate' });
        }
        seenMessageIds.add(body.messageId);
        if (seenMessageIds.size > MAX_SEEN_IDS) {
          const firstId = seenMessageIds.values().next().value;
          if (firstId) seenMessageIds.delete(firstId);
        }
      }

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

      const streamMsg: import('../services/stream-message-utils.js').StreamMessage = {
        specVersion: '1.0',
        type: 'callback',
        data: JSON.stringify({
          userId: parsed.userId,
          content: parsed.content,
          isVoice: parsed.isVoice,
        }),
        headers: {
          topic: 'chat',
          messageId: body.messageId || '',
          time: String(Date.now()),
        },
      };

      processStreamMessage(streamMsg).catch((err) => {
        error('Webhook processStreamMessage failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return reply.status(200).send({ result: 'success' });
    }
  );
}
