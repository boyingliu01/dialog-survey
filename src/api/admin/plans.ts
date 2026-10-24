// @no-test-required: covered by tests/admin-plan-matcher.test.ts and tests/e2e/admin-*.e2e.test.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { adminAuth } from '../../middleware/admin-auth.js';
import { error, info } from '../../utils/logger.js';
import { htmlError } from './html.js';
import { type AdminRoutesDeps, createAdminGuard } from './shared.js';
import { buildInviteeNameMap, parseTemplateContent } from './view-models.js';

const API_PATH = '/admin/api';

/**
 * Plan management pages under `/admin/content/plans*`.
 *
 * These render the plan form and the two plan-detail variants (with and without
 * the analytics summary), plus the delete endpoint the tree view calls. The
 * template select is loaded here too because a plan form cannot render without
 * one — that dependency is what ties these routes together.
 */
export async function registerPlanPageRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesDeps
): Promise<void> {
  const { templateRepo, interviewPlanService, interviewRepo, analyticsService } = opts;
  const adminMutationGuard = createAdminGuard(fastify);

  // GET /admin/content/plans/new — HTMX fragment for new plan form
  fastify.get(
    '/admin/content/plans/new',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { templateId } = (request.query as Record<string, string | undefined>) || {};
      const templates = await templateRepo.findAllForSelect();
      return reply.view('admin/content/plan-form.njk', {
        templates,
        selectedTemplateId: templateId || null,
      });
    }
  );

  // GET /admin/content/plans/:id/edit — HTMX fragment for edit plan form
  fastify.get(
    '/admin/content/plans/:id/edit',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const plan = await interviewPlanService.findByIdWithTemplate(id);
      if (!plan) return reply.status(404).type('text/html').send('计划不存在');
      const templates = await templateRepo.findAllForSelect();
      return reply.view('admin/content/plan-form.njk', {
        templates,
        plan,
        selectedTemplateId: plan.templateId,
        isEdit: true,
      });
    }
  );

  // GET /admin/content/templates/:id — the template's detail (info) page.
  // It lives with the plan pages because the tree opens it from a plan row and
  // it renders the same counts the plan detail shows.
  fastify.get(
    '/admin/content/templates/:id',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const template = await templateRepo.findByIdWithCounts(id);
      if (!template) return reply.status(404).type('text/html').send('模板不存在');
      const { content: parsedContent, questions } = parseTemplateContent(template.content);
      const tpl = {
        ...template,
        _planCount: template._count.interviewPlans,
        _interviewCount: template._count.interviews,
      };
      return reply.view('admin/content/template-info.njk', {
        template: tpl,
        questions,
        invitationPrompt: parsedContent['invitationPrompt'] as string | undefined,
        closingMessage: parsedContent['closingMessage'] as string | undefined,
      });
    }
  );

  // GET /admin/content/plans/:id
  fastify.get(
    '/admin/content/plans/:id',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const plan = await interviewPlanService.findByIdWithInterviewsAndCounts(id);
      if (!plan) return reply.status(404).type('text/html').send('计划不存在');
      const completed = plan.interviews.filter((i) => i.status === 'COMPLETED');
      let planStats = null;
      try {
        planStats = await analyticsService.getPlanStats(id);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to compute plan stats';
        error('Failed to load plan stats for plan-detail render', { planId: id, error: errMsg });
      }
      const inviteeMap = buildInviteeNameMap(plan.inviteeData);
      return reply.view('admin/content/plan-detail.njk', {
        plan,
        template: plan.template,
        interviews: plan.interviews,
        totalInterviews: plan._count.interviews,
        completedCount: completed.length,
        completionRate:
          plan.sentCount > 0 ? Math.round((completed.length / plan.sentCount) * 100) : 0,
        planStats,
        inviteeMap,
      });
    }
  );

  // GET /admin/content/plans/:id/all-interviews
  fastify.get(
    '/admin/content/plans/:id/all-interviews',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const interviews = await interviewRepo.findByPlanId(id);
      const plan = await interviewPlanService.findByIdWithTemplate(id);
      if (!plan) return reply.status(404).type('text/html').send('计划不存在');
      const completed = interviews.filter((i) => i.status === 'COMPLETED');
      return reply.view('admin/content/plan-detail.njk', {
        plan: { ...plan, sentCount: 0 },
        template: plan.template,
        interviews,
        totalInterviews: interviews.length,
        completedCount: completed.length,
        completionRate: 0,
      });
    }
  );

  // DELETE /admin/api/plans/:id — with `?force=true` the interviews go too
  fastify.delete(
    `${API_PATH}/plans/:id`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { force?: string };
      try {
        const plan = await interviewPlanService.findByIdWithDeleteChecks(id);

        if (!plan) return reply.status(404).type('text/html').send('计划不存在');

        const hasInterviews = plan._count.interviews > 0;
        const hasBatchReports = plan._count.batchReports > 0;

        if (query.force === 'true') {
          const result = await interviewPlanService.deletePlanWithInterviews(id);
          return reply.send(
            `<div class="text-green-600">计划「${result.planName}」已删除，同时删除 ${result.interviewCount} 条访谈记录和 ${result.batchReportCount} 个批量报告</div>`
          );
        }

        if (hasInterviews || hasBatchReports) {
          const parts = [];
          if (hasInterviews) parts.push(`${plan._count.interviews} 个访谈记录`);
          if (hasBatchReports) parts.push(`${plan._count.batchReports} 个批量报告`);
          return reply
            .status(409)
            .send(
              `<div class="text-red-600" data-delete-warning="true" data-count-interviews="${plan._count.interviews}" data-count-reports="${plan._count.batchReports}">该计划关联了 ${parts.join('、')}，删除将一并删除这些数据</div>`
            );
        }

        await interviewPlanService.deletePlan(id);
        info('Admin plan deleted', { planId: id });
        return reply.send('<div class="text-green-600">计划已删除</div>');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to delete plan';
        error('Failed to delete admin plan', { error: errMsg, planId: id });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );
}
