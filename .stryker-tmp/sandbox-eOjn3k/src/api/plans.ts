// @ts-nocheck
import { PlanStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InterviewPlanService, type InviteeData } from '../services/interview-plan.service.js';

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  templateId: z.string().uuid(),
  targetDate: z.string().datetime().optional(),
  schedule: z.string().optional(),
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

export async function interviewPlanRoutes(fastify: FastifyInstance) {
  const planService = new InterviewPlanService();

  fastify.post('/api/plans', async (request, _reply) => {
    const input = createPlanSchema.parse(request.body);
    const planId = await planService.createPlan({
      ...input,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
    });
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
}
