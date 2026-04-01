import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDingtalkService } from "../services/dingtalk.js";
import { getConversationEngine } from "../services/conversation/index.js";
import { InterviewRepository } from "../repositories/interview.js";
import { MessageRepository } from "../repositories/message.js";
import {
  InterviewStatus,
  MessageRole,
} from "../generated/prisma/client/client.js";
import { getTemplateService, type Template } from "../services/template.js";
import type { InterviewTemplate } from "../core/types.js";
import * as crypto from "crypto";

/**
 * Convert Template from template service to InterviewTemplate for graph
 */
function toInterviewTemplate(
  template: Template | null | undefined,
): InterviewTemplate | null {
  if (!template) return null;
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    topics: template.topics.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      initial_question: t.initial_question,
    })),
    questions: (template.questions ?? []).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      follow_ups: q.follow_ups,
      condition: q.condition,
    })),
    domain_context: template.domain_context,
  };
}

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

  fastify.get<{
    Querystring: {
      signature?: string;
      timestamp?: string;
      nonce?: string;
      challenge?: string;
    };
  }>(
    "/webhook",
    {
      schema: {
        querystring: verifyWebhookQuerySchema,
      },
    },
    async (request, reply) => {
      const { challenge, signature, timestamp, nonce } = request.query;

      // For initial webhook verification, DingTalk sends a challenge
      if (challenge) {
        fastify.log.info("Webhook verification successful");
        return { challenge };
      }

      // Verify signature for regular callback
      if (signature && timestamp && nonce) {
        const isValid = dingtalkService.verifySignature(
          timestamp,
          signature,
          nonce,
        );
        if (!isValid) {
          return reply.status(403).send({
            code: 403,
            msg: "Invalid signature",
          });
        }
      }

      return { code: 0, msg: "success" };
    },
  );

  // Handle incoming messages
  const webhookBodySchema = z.object({
    msgtype: z.string(),
    text: z.object({ content: z.string() }).optional(),
    content: z.object({ text: z.string() }).optional(),
    voice: z
      .object({
        media_id: z.string(),
        duration: z.number().optional(),
        recognition: z.string().optional(),
      })
      .optional(),
    session_id: z.string().optional(),
    conversation_id: z.string().optional(),
    senderStaffId: z.string().optional(),
    senderId: z.string().optional(),
  });

  type WebhookBody = z.infer<typeof webhookBodySchema>;

  fastify.post<{ Body: WebhookBody }>(
    "/webhook",
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
            msg: "Missing signature headers",
          });
        }

        const isValid = dingtalkService.verifySignature(
          timestamp,
          signature,
          nonce,
        );
        if (!isValid) {
          return reply.status(403).send({
            code: 403,
            msg: "Invalid signature",
          });
        }
      },
    },
    async (request, reply) => {
      const messageData = dingtalkService.parseWebhookMessage(request.body);
      const { msg_type, user_id, content } = messageData;

      fastify.log.info(
        "Received message from user=%s type=%s",
        user_id,
        msg_type,
      );

      // Find or create interview session
      let sessionId = request.body.session_id;

      if (!sessionId) {
        const activeInterviews = await InterviewRepository.findByUserId(
          user_id,
          InterviewStatus.IN_PROGRESS,
        );
        if (activeInterviews.length > 0) {
          sessionId = activeInterviews[0].sessionId;
        }
      }

      // Create new interview if "开始" command received
      if (
        !sessionId &&
        (content.trim() === "开始" ||
          content.trim() === "start" ||
          content.trim() === "开始访谈")
      ) {
        sessionId = `interview_${crypto.randomBytes(6).toString("hex")}`;
        fastify.log.info(
          "Creating new interview session=%s user=%s",
          sessionId,
          user_id,
        );

        // Try to get the quality_survey template, or any available template
        let template = templateService.getTemplate("quality_survey");
        if (!template) {
          // Try to get any template by checking common template IDs
          for (const id of ["quality_survey", "customer_feedback", "default"]) {
            template = templateService.getTemplate(id);
            if (template) break;
          }
        }

        if (!template) {
          return reply.status(400).send({
            code: 400,
            msg: "No templates available",
          });
        }

        // Start interview through conversation engine
        try {
          const engine = getConversationEngine({
            useLlm: !!process.env.LLM_API_KEY,
            llmConfig: process.env.LLM_API_KEY
              ? {
                  apiKey: process.env.LLM_API_KEY,
                  model: process.env.LLM_MODEL,
                }
              : undefined,
          });

          const interviewTemplate = toInterviewTemplate(template);
          if (!interviewTemplate) {
            return reply.status(400).send({
              code: 400,
              msg: "Invalid template format",
            });
          }

          const greetingMessage = await engine.startInterview(
            sessionId,
            user_id,
            "quality_survey",
            interviewTemplate,
          );

          const interview =
            await InterviewRepository.findBySessionId(sessionId);
          if (!interview) {
            throw new Error("Failed to find created interview");
          }

          await MessageRepository.create({
            interviewId: interview.id,
            role: MessageRole.USER,
            content,
            messageType: msg_type,
          });

          return {
            code: 0,
            msg: "success",
            session_id: sessionId,
            message: greetingMessage,
          };
        } catch (error) {
          fastify.log.error("Failed to start interview: %s", error);
          return reply.status(500).send({
            code: 500,
            msg: "Failed to start interview",
          });
        }
      }

      // If no session and not a start command, prompt to start
      if (!sessionId) {
        return {
          code: 0,
          msg: "success",
          message: '请回复"开始"启动访谈。',
        };
      }

      // Process message in existing session
      const interview = await InterviewRepository.findBySessionId(sessionId);
      if (!interview) {
        return reply.status(404).send({
          code: 404,
          msg: "Interview not found",
        });
      }

      // Store user message
      await MessageRepository.create({
        interviewId: interview.id,
        role: MessageRole.USER,
        content,
        messageType: msg_type,
      });

      // Process message through conversation engine
      let template = templateService.getTemplate(interview.templateId);
      if (!template) {
        // Fallback to default templates
        for (const id of ["quality_survey", "customer_feedback", "default"]) {
          template = templateService.getTemplate(id);
          if (template) break;
        }
      }

      let responseMessage: string;

      if (template) {
        const interviewTemplate = toInterviewTemplate(template);
        if (!interviewTemplate) {
          responseMessage = `已收到您的消息: ${content}`;
        } else {
          try {
            const engine = getConversationEngine({
              useLlm: !!process.env.LLM_API_KEY,
              llmConfig: process.env.LLM_API_KEY
                ? {
                    apiKey: process.env.LLM_API_KEY,
                    model: process.env.LLM_MODEL,
                  }
                : undefined,
            });

            responseMessage = await engine.processMessage(
              sessionId,
              user_id,
              interview.templateId,
              interviewTemplate,
              content,
            );
          } catch (error) {
            fastify.log.error("Conversation engine error: %s", error);
            responseMessage = "处理您的消息时出现错误，请稍后重试。";
          }
        }
      } else {
        responseMessage = `已收到您的消息: ${content}`;
      }

      await MessageRepository.create({
        interviewId: interview.id,
        role: MessageRole.ASSISTANT,
        content: responseMessage,
        messageType: "text",
      });

      return {
        code: 0,
        msg: "success",
        session_id: sessionId,
        message: responseMessage,
      };
    },
  );
};

export default webhookRoutes;
