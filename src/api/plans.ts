import { PlanStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/admin-auth.js';
import {
  InterviewNotFoundError,
  InterviewPlanService,
  InvalidMemberInputError,
  InvalidStateError,
  type InviteeData,
  MemberConflictError,
  MemberNotFoundError,
  PlanNotFoundError,
  parseInviteeText,
} from '../services/interview-plan.service.js';

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  templateId: z.string().uuid(),
  targetDate: z.string().optional(),
  schedule: z.string().optional(),
  invitees: z.string().optional(),
  publish: z.coerce.boolean().optional().default(false),
});

const importInviteesSchema = z.object({
  invitees: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      customFields: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

const addMemberSchema = z
  .object({
    userId: z.string().min(1).optional(),
    phone: z
      .string()
      .regex(/^1[3-9]\d{9}$/, 'Invalid phone format')
      .optional(),
    name: z.string().min(1).optional(),
  })
  .refine((data) => data.userId !== undefined || data.phone !== undefined, {
    message: 'Either userId or phone is required',
    path: ['userId', 'phone'],
  });

const remindSchema = z.object({
  interviewId: z.string().min(1).optional(),
});

function mapServiceErrorToStatus(err: unknown): { status: number; message: string } {
  if (err instanceof PlanNotFoundError || err instanceof InterviewNotFoundError) {
    return { status: 404, message: err.message };
  }
  if (err instanceof MemberNotFoundError) {
    return { status: 404, message: err.message };
  }
  if (err instanceof MemberConflictError) {
    return { status: 409, message: err.message };
  }
  if (err instanceof InvalidStateError) {
    return { status: 400, message: err.message };
  }
  if (err instanceof InvalidMemberInputError) {
    return { status: 400, message: err.message };
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return { status: 502, message };
}

export async function interviewPlanRoutes(fastify: FastifyInstance) {
  const planService = new InterviewPlanService();

  fastify.post('/api/plans', async (request, _reply) => {
    const input = createPlanSchema.parse(request.body);

    // Always create the plan first
    const planId = await planService.createPlan({
      name: input.name,
      description: input.description,
      templateId: input.templateId,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      schedule: input.schedule,
    });

    if (input.invitees) {
      const inviteeData = parseInviteeText(input.invitees);
      const importResult = await planService.importInvitees(planId, inviteeData);

      let sent = 0;
      let failed = 0;
      if (input.publish === true) {
        const sendResult = await planService.sendInvitations(planId);
        sent = sendResult.sent;
        failed = sendResult.failed;
      }

      return {
        id: planId,
        imported: importResult.success,
        sent,
        failed,
        errors: importResult.errors,
      };
    }

    return { id: planId };
  });

  fastify.get('/api/plans', async (request) => {
    const { status, limit, offset } = request.query as {
      status?: PlanStatus;
      limit?: number;
      offset?: number;
    };
    return planService.listPlans({ status, limit, offset });
  });

  fastify.get('/api/plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await planService.getPlan(id);
    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }
    return plan;
  });

  fastify.put('/api/plans/:id', async (request, _reply) => {
    const { id } = request.params as { id: string };
    const input = createPlanSchema.parse(request.body);
    await planService.updatePlan(id, {
      name: input.name,
      description: input.description,
      targetDate: input.targetDate,
      schedule: input.schedule,
      invitees: input.invitees,
    });
    return { id };
  });

  fastify.post('/api/plans/:id/invitees', async (request, _reply) => {
    const { id } = request.params as { id: string };
    const { invitees } = importInviteesSchema.parse(request.body);
    const result = await planService.importInvitees(id, invitees as InviteeData[]);
    return result;
  });

  fastify.post('/api/plans/:id/send', async (request, _reply) => {
    const { id } = request.params as { id: string };
    const result = await planService.sendInvitations(id);
    return result;
  });

  fastify.post('/api/plans/:id/interviews/:interviewId/send', async (request, _reply) => {
    const { id, interviewId } = request.params as { id: string; interviewId: string };
    const result = await planService.resendToInterview(id, interviewId);
    return result;
  });

  fastify.post('/api/plans/:id/pause', async (request, _reply) => {
    const { id } = request.params as { id: string };
    await planService.pausePlan(id);
    return { status: 'paused' };
  });

  fastify.post('/api/plans/:id/resume', async (request, _reply) => {
    const { id } = request.params as { id: string };
    await planService.resumePlan(id);
    return { status: 'running' };
  });

  fastify.post('/api/plans/:id/cancel', async (request, _reply) => {
    const { id } = request.params as { id: string };
    await planService.cancelPlan(id);
    return { status: 'cancelled' };
  });

  fastify.post('/api/plans/:id/members', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = addMemberSchema.parse(request.body);
    try {
      const result = await planService.addMember(id, {
        userId: input.userId,
        phone: input.phone,
        name: input.name,
      });
      return result;
    } catch (e) {
      const { status, message } = mapServiceErrorToStatus(e);
      return reply.status(status).send({ error: message });
    }
  });

  fastify.delete(
    '/api/plans/:id/members/:interviewId',
    { preHandler: adminAuth },
    async (request, reply) => {
      const { id, interviewId } = request.params as { id: string; interviewId: string };
      try {
        await planService.removeMember(id, interviewId);
        return { status: 'removed' };
      } catch (e) {
        const { status, message } = mapServiceErrorToStatus(e);
        return reply.status(status).send({ error: message });
      }
    }
  );

  fastify.post('/api/plans/:id/remind', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { interviewId } = remindSchema.parse(request.body ?? {});
    try {
      const result = await planService.sendReminder(id, interviewId);
      return result;
    } catch (e) {
      const { status, message } = mapServiceErrorToStatus(e);
      return reply.status(status).send({ error: message });
    }
  });
}
