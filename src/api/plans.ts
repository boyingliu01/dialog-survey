import { PlanStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InterviewPlanService, parseInviteeText, type InviteeData } from '../services/interview-plan.service.js';

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

const addMemberSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
});

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

  fastify.post('/api/plans/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, name } = addMemberSchema.parse(request.body);
    try {
      const result = await planService.addMember(id, userId, name);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add member';
      const status = message.includes('not found') ? 404 : 409;
      return reply.status(status).send({ error: message });
    }
  });

  fastify.delete('/api/plans/:id/members/:interviewId', async (request, reply) => {
    const { id, interviewId } = request.params as { id: string; interviewId: string };
    try {
      await planService.removeMember(id, interviewId);
      return { status: 'removed' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to remove member';
      const status = message.includes('not found') ? 404 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  fastify.post('/api/plans/:id/remind', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { interviewId } = (request.body ?? {}) as { interviewId?: string };
    try {
      const result = await planService.sendReminder(id, interviewId);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to send reminder';
      const status = message.includes('not found') ? 404 : 400;
      return reply.status(status).send({ error: message });
    }
  });
}
