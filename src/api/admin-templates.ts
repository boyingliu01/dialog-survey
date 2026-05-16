import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../middleware/admin-auth.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { error, info } from '../utils/logger.js';

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.object({}).passthrough(),
});
const updateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.object({}).passthrough(),
});
const versionSchema = z.object({ version: z.coerce.number().int().positive() });

function buildContentFromForm(body: Record<string, unknown>): Record<string, unknown> {
  // If body already has a content object (JSON POST), use it directly
  if (body.content && typeof body.content === 'object' && !Array.isArray(body.content)) {
    return body.content as Record<string, unknown>;
  }

  const content: Record<string, unknown> = {
    invitationPrompt: String(body.invitationPrompt || ''),
    questions: [],
  };

  if (body.closingMessage) content.closingMessage = body.closingMessage;
  if (body.llmPromptTemplate) content.llmPromptTemplate = body.llmPromptTemplate;

  // Extract questions from body.questions[*][text] (form data format)
  const questionsObj = body.questions as Record<string, { text: string }> | undefined;
  if (questionsObj && typeof questionsObj === 'object') {
    const questions: string[] = [];
    for (const key of Object.keys(questionsObj).sort()) {
      const q = questionsObj[key];
      if (q && typeof q === 'object' && typeof q.text === 'string') {
        const trimmed = q.text.trim();
        if (trimmed) questions.push(trimmed);
      }
    }
    content.questions = questions;
  }

  return content;
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function htmlError(message: string): string {
  return `<div class="text-red-600">${htmlEscape(message)}</div>`;
}
function fmtDate(d: Date | null | undefined): string {
  return d?.toLocaleString('zh-CN') ?? '-';
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export async function adminTemplatesRoutes(fastify: FastifyInstance) {
  const templateRepo = new TemplateRepository();
  const prisma = new PrismaClient();
  const BASE_PATH = '/admin';
  const API_PATH = '/admin/api';

  fastify.get(
    `${BASE_PATH}/templates`,
    { preHandler: adminAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pageParam = (_request.query as Record<string, string | undefined>).page;
        const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10)) : 1;
        const limit = 20;
        const result = await templateRepo.findAllPaginated(page, limit);
        const templates = await Promise.all(
          result.items.map(async (t) => ({
            ...t,
            usageStats: await templateRepo.getUsageStats(t.id),
          }))
        );
        return reply.view('templates/index.njk', {
          adminApiKey: ADMIN_API_KEY,
          templates,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
          },
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load templates';
        error('Failed to load admin templates list', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  fastify.get(
    `${BASE_PATH}/templates/new`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      return reply.view('templates/form.njk', {
        adminApiKey: ADMIN_API_KEY,
        isEdit: false,
        template: null,
        existingQuestions: [],
        action: 'create',
      });
    }
  );

  fastify.get(
    `${BASE_PATH}/templates/:id/edit`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const template = await templateRepo.findById(id);
        if (!template)
          return reply.status(404).view('error.njk', { message: 'Template not found' });
        let parsedContent: Record<string, unknown>;
        try {
          parsedContent = JSON.parse(template.content) as Record<string, unknown>;
        } catch {
          parsedContent = {};
        }
        const questions = (parsedContent.questions as string[]) || [];
        return reply.view('templates/form.njk', {
          adminApiKey: ADMIN_API_KEY,
          isEdit: true,
          template: { ...template, ...parsedContent },
          existingQuestions: questions.map((q, i) => ({ text: q, order: i })),
          action: 'edit',
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load template';
        error('Failed to load admin template edit form', { error: errMsg, templateId: id });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  fastify.post(
    `${API_PATH}/templates`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rawBody = request.body as Record<string, unknown>;
        const content = buildContentFromForm(rawBody);
        const input = createTemplateSchema.parse({
          name: rawBody.name,
          description: rawBody.description,
          content,
        });
        await templateRepo.create({
          name: input.name,
          description: input.description,
          content: input.content as Record<string, unknown>,
        });
        info('Admin template created', { name: input.name });
        return reply.status(201).header('HX-Redirect', '/admin/templates');
      } catch (e) {
        if (e instanceof z.ZodError)
          return reply.status(422).send(htmlError(e.issues[0]?.message ?? 'Validation failed'));
        const errMsg = e instanceof Error ? e.message : 'Failed to create template';
        error('Failed to create admin template', { error: errMsg });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );

  fastify.put(
    `${API_PATH}/templates/:id`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const qp = request.query as Record<string, string | undefined>;
        const body = request.body as Record<string, unknown>;
        const versionRaw = (qp.version ?? body.version) as string | number | undefined;
        const versionParsed = versionSchema.safeParse({ version: versionRaw });
        if (!versionParsed.success)
          return reply.status(422).send(htmlError('Version number is required'));
        const content = buildContentFromForm(body);
        const input = updateTemplateSchema.parse({
          name: body.name,
          description: body.description,
          content,
        });
        await templateRepo.updateWithVersion(id, versionParsed.data.version, {
          name: input.name,
          description: input.description,
          content: input.content as Record<string, unknown>,
        });
        info('Admin template updated', { templateId: id });
        return reply.status(200).header('HX-Redirect', '/admin/templates');
      } catch (e) {
        if (e instanceof z.ZodError)
          return reply.status(422).send(htmlError(e.issues[0]?.message ?? 'Validation failed'));
        if (
          e instanceof Error &&
          (e.message.toLowerCase().includes('record') ||
            (e as unknown as { code?: string }).code === 'P2025')
        ) {
          return reply
            .status(409)
            .send('<div class="text-red-600">模板已被他人修改，请刷新后重试</div>');
        }
        if (e instanceof Error && e.message.includes('find'))
          return reply.status(404).send(htmlError('Template not found'));
        const errMsg = e instanceof Error ? e.message : 'Failed to update template';
        error('Failed to update admin template', { error: errMsg, templateId: id });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );

  fastify.delete(
    `${API_PATH}/templates/:id`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const existing = await templateRepo.findById(id);
        if (!existing) return reply.status(404).send(htmlError('Template not found'));
        const usageStats = await templateRepo.getUsageStats(id);

        // Check Interview FK constraint
        const totalInterviews =
          usageStats.interviews.active +
          usageStats.interviews.pending +
          usageStats.interviews.waiting +
          usageStats.interviews.completed +
          usageStats.interviews.cancelled;

        if (totalInterviews > 0) {
          return reply
            .status(409)
            .send(
              `<div class="text-red-600">不能删除：该模板关联了 ${totalInterviews} 个访谈记录</div>`
            );
        }

        // Check InterviewPlan FK constraint
        const totalPlans =
          (usageStats.plans?.running ?? 0) +
          (usageStats.plans?.pending ?? 0) +
          (usageStats.plans?.ready ?? 0) +
          (usageStats.plans?.paused ?? 0) +
          (usageStats.plans?.completed ?? 0);

        if (totalPlans > 0) {
          return reply
            .status(409)
            .send(
              `<div class="text-red-600">不能删除：该模板关联了 ${totalPlans} 个访谈计划</div>`
            );
        }

        // Bypass repository to avoid stale Prisma instance issues
        await prisma.template.delete({ where: { id } });
        const verify = await prisma.template.findUnique({ where: { id } });

        if (verify) {
          error('Database delete failed: record still exists after delete call', {
            templateId: id,
          });
          return reply.status(500).send(htmlError('数据库删除失败，记录仍然存在'));
        }

        info('Admin template deleted and verified', { templateId: id });
        return reply.send(`
          <div class="text-green-600">模板已删除</div>
          <script>
            // Clear the modal container to close it
            setTimeout(() => {
              const modalContainer = document.getElementById('delete-modal-container');
              if (modalContainer) {
                modalContainer.innerHTML = '';
              }
              // Refresh page to update the tables since row removal is complex with outerHTML 
              location.reload();
            }, 500);
          </script>
        `);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to delete template';
        error('Failed to delete admin template', { error: errMsg, templateId: id });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );

  fastify.get(
    `${API_PATH}/templates/:id/usage`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await templateRepo.getUsageStats((request.params as { id: string }).id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed';
        return reply.status(500).send({ error: errMsg });
      }
    }
  );

  fastify.get(
    `${API_PATH}/templates`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const qp = (_r.query as Record<string, string | undefined>).page;
        const page = qp ? Math.max(1, Number.parseInt(qp, 10)) : 1;
        const result = await templateRepo.findAllPaginated(page, 20);
        const rows = result.items
          .map(
            (t) =>
              `<tr><td>${htmlEscape(t.id)}</td><td>${htmlEscape(t.name)}</td><td>${t.status}</td><td>v${t.version}</td></tr>`
          )
          .join('\n');
        return reply.type('text/html').send(rows);
      } catch (e) {
        return reply.status(500).send(htmlError(e instanceof Error ? e.message : 'Failed'));
      }
    }
  );

  fastify.get(
    `${BASE_PATH}/plans`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const plans = await prisma.interviewPlan.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            template: { select: { id: true, name: true } },
            _count: { select: { interviews: true } },
          },
        });
        return reply.view('plans/index.njk', {
          adminApiKey: ADMIN_API_KEY,
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            templateName: p.template?.name ?? '-',
            interviewCount: p._count.interviews,
            createdAtFormatted: fmtDate(p.createdAt),
          })),
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load plans';
        error('Failed to load admin plans', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  fastify.get(
    `${BASE_PATH}/reports`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const reports = await prisma.analysisReport.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { interview: { select: { id: true, userId: true, status: true } } },
        });
        return reply.view('reports/index.njk', {
          adminApiKey: ADMIN_API_KEY,
          reports: reports.map((r) => ({
            interviewId: r.interviewId,
            userId: r.interview?.userId ?? '-',
            status: r.interview?.status ?? '-',
            sentiment: r.sentiment ?? '',
            createdAtFormatted: fmtDate(r.createdAt),
          })),
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load reports';
        error('Failed to load admin reports', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  fastify.get(
    `${BASE_PATH}/reports/:interviewId`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { interviewId } = request.params as { interviewId: string };
      try {
        const report = await prisma.analysisReport.findFirst({
          where: { interviewId },
          orderBy: { createdAt: 'desc' },
        });
        const interview = await prisma.interview.findUnique({
          where: { id: interviewId },
          select: { id: true, userId: true, status: true, createdAt: true },
        });
        if (!interview)
          return reply.status(404).view('error.njk', { message: 'Interview not found' });
        return reply.view('reports/detail.njk', {
          adminApiKey: ADMIN_API_KEY,
          interview: { ...interview, createdAtFormatted: fmtDate(interview.createdAt) },
          report: report
            ? { ...report, createdAtFormatted: fmtDate((report as { createdAt?: Date }).createdAt) }
            : null,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load report';
        error('Failed to load report detail', { error: errMsg, interviewId });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );
}
