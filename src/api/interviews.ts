import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { InterviewRepository } from '../repositories/interview.js';
import { InterviewStatus } from '@prisma/client';
import fs from 'fs';

const interviewsRoutes: FastifyPluginAsync = async (fastify) => {
  // Query params schema for list interviews
  const listInterviewsQuerySchema = z.object({
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  // Get all interviews with filtering and pagination
  fastify.get<{ Querystring: { status?: string; limit?: number; offset?: number } }>(
    '/interviews',
    {
      schema: {
        querystring: listInterviewsQuerySchema,
      },
    },
    async (request) => {
      const { status, limit, offset } = request.query;
      const enumStatus = status as any ? InterviewStatus[status as keyof typeof InterviewStatus] : undefined;

      const interviews = await InterviewRepository.findAll(enumStatus, limit || 20, offset || 0);

      const interviewSummaries = interviews.map((interview) => ({
        session_id: interview.sessionId,
        user_id: interview.userId,
        status: interview.status.toUpperCase(),
        topic: interview.topic,
        created_at: interview.createdAt.toISOString(),
        updated_at: interview.updatedAt.toISOString(),
      }));

      return {
        code: 0,
        msg: 'success',
        data: interviewSummaries,
      };
    },
  );

  // Get single interview
  const getInterviewParamsSchema = z.object({
    sessionId: z.string().min(1, 'Session ID is required'),
  });

  fastify.get<{ Params: { sessionId: string } }>(
    '/interviews/:sessionId',
    {
      schema: {
        params: getInterviewParamsSchema,
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const interview = await InterviewRepository.findBySessionId(sessionId);

      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: 'Interview not found',
        });
      }

      return {
        code: 0,
        msg: 'success',
        data: {
          session_id: interview.sessionId,
          user_id: interview.userId,
          status: interview.status.toUpperCase(),
          topic: interview.topic,
          conversation_history: interview.conversationHistory,
          extracted_info: interview.extractedInfo,
          report: interview.report,
          report_path: interview.reportPath,
          created_at: interview.createdAt.toISOString(),
          updated_at: interview.updatedAt.toISOString(),
        },
      };
    },
  );

  // End interview
  fastify.post<{ Params: { sessionId: string } }>(
    '/interviews/:sessionId/end',
    {
      schema: {
        params: getInterviewParamsSchema,
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const interview = await InterviewRepository.findBySessionId(sessionId);

      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: 'Interview not found',
        });
      }

      if (interview.status !== InterviewStatus.IN_PROGRESS) {
        return reply.status(400).send({
          code: 400,
          msg: 'Interview is already completed or cancelled',
        });
      }

      const updatedInterview = await InterviewRepository.update(interview.id, {
        status: InterviewStatus.COMPLETED,
      });

      return {
        code: 0,
        msg: 'success',
        data: {
          session_id: updatedInterview.sessionId,
          status: updatedInterview.status.toUpperCase(),
        },
      };
    },
  );

  // Get interview report
  fastify.get<{ Params: { sessionId: string } }>(
    '/interviews/:sessionId/report',
    {
      schema: {
        params: getInterviewParamsSchema,
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const interview = await InterviewRepository.findBySessionId(sessionId);

      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: 'Interview not found',
        });
      }

      if (!interview.reportPath || !fs.existsSync(interview.reportPath)) {
        return reply.status(404).send({
          code: 404,
          msg: 'Report not available',
        });
      }

      const content = fs.readFileSync(interview.reportPath, 'utf-8');

      return {
        code: 0,
        msg: 'success',
        data: {
          session_id: sessionId,
          report: content,
          report_path: interview.reportPath,
        },
      };
    },
  );

  // Get interview messages
  const getMessagesQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  });

  fastify.get<{ Params: { sessionId: string }; Querystring: { limit?: number; offset?: number } }>(
    '/interviews/:sessionId/messages',
    {
      schema: {
        params: getInterviewParamsSchema,
        querystring: getMessagesQuerySchema,
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      const { limit, offset } = request.query;

      const interview = await InterviewRepository.findBySessionId(sessionId);

      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: 'Interview not found',
        });
      }

      // Get messages directly from the interview
      const messages = interview.messages
        .slice(offset || 0, (offset || 0) + (limit || 50))
        .map((message: any) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          message_type: message.messageType,
          created_at: message.createdAt.toISOString(),
        }));

      return {
        code: 0,
        msg: 'success',
        data: messages,
      };
    },
  );
};

export default interviewsRoutes;
