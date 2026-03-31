import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDingtalkService } from '../services/dingtalk.js';
import { InterviewRepository } from '../repositories/interview.js';
import { MessageRepository } from '../repositories/message.js';
import { InterviewStatus, MessageRole } from '@prisma/client';
import { getTemplateService } from '../services/template.js';
import crypto from 'crypto';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  const dingtalkService = getDingtalkService();
  const templateService = getTemplateService();

  // Verify webhook URL
  const verifyWebhookQuerySchema = z.object({
    signature: z.string().optional(),
    timestamp: z.string().optional(),
    nonce: z.string().optional(),
    challenge: z.string().optional(),
  });

  fastify.get<{ Querystring: { signature?: string; timestamp?: string; nonce?: string; challenge?: string } }>(
    '/webhook',
    {
      schema: {
        querystring: verifyWebhookQuerySchema,
      },
    },
    async (request, reply) => {
      const { challenge, signature, timestamp, nonce } = request.query;

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
    },
  );

  // Handle incoming messages
  const webhookBodySchema = z.object({
    msgtype: z.string(),
    text: z.object({ content: z.string() }).optional(),
    content: z.object({ text: z.string() }).optional(),
    voice: z.object({
      media_id: z.string(),
      duration: z.number().optional(),
      recognition: z.string().optional(),
    }).optional(),
    session_id: z.string().optional(),
    conversation_id: z.string().optional(),
    senderStaffId: z.string().optional(),
    senderId: z.string().optional(),
  });

  fastify.post<{ Body: any }>(
    '/webhook',
    {
      schema: {
        body: webhookBodySchema,
      },
      preHandler: async (request, reply) => {
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
      },
    },
    async (request, reply) => {
      const messageData = dingtalkService.parseWebhookMessage(request.body);
      const { msg_type, user_id, content } = messageData;

      fastify.log.info('Received message from user=%s type=%s', user_id, msg_type);

      // Find or create interview session
      let sessionId = (request.body as any).session_id;

      if (!sessionId) {
        const activeInterviews = await InterviewRepository.findByUserId(user_id, InterviewStatus.IN_PROGRESS);
        if (activeInterviews.length > 0) {
          sessionId = activeInterviews[0].sessionId;
        }
      }

      // Create new interview if "开始" command received
      if (!sessionId && (content.trim() === '开始' || content.trim() === 'start' || content.trim() === '开始访谈')) {
        sessionId = `interview_${crypto.randomBytes(6).toString('hex')}`;
        fastify.log.info('Creating new interview session=%s user=%s', sessionId, user_id);

        const template = templateService.getTemplate('quality_survey') || templateService.listTemplates()[0];

        if (!template) {
          return reply.status(400).send({
            code: 400,
            msg: 'No templates available',
          });
        }

        const newInterview = await InterviewRepository.create({
          sessionId,
          userId: user_id,
          templateId: 'quality_survey',
          topic: '质量满意度调查',
        });

        await MessageRepository.create({
          interviewId: newInterview.id,
          role: MessageRole.USER,
          content,
          messageType: msg_type,
        });

        return {
          code: 0,
          msg: 'success',
          session_id: sessionId,
          message: '访谈已开始，请按提示回答问题。',
        };
      }

      // If no session and not a start command, prompt to start
      if (!sessionId) {
        return {
          code: 0,
          msg: 'success',
          message: '请回复"开始"启动访谈。',
        };
      }

      // Process message in existing session
      const interview = await InterviewRepository.findBySessionId(sessionId);
      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: 'Interview not found',
        });
      }

      // Store user message
      await MessageRepository.create({
        interviewId: interview.id,
        role: MessageRole.USER,
        content,
        messageType: msg_type,
      });

      // TODO: Call conversation engine to process message
      // For now, just echo back
      const responseMessage = `已收到您的消息: ${content}`;

      await MessageRepository.create({
        interviewId: interview.id,
        role: MessageRole.ASSISTANT,
        content: responseMessage,
        messageType: 'text',
      });

      return {
        code: 0,
        msg: 'success',
        session_id: sessionId,
        message: responseMessage,
      };
    },
  );
};

export default webhookRoutes;
