// @no-test-required: covered by tests/admin-shell-csrf.test.ts and tests/e2e/admin-*.e2e.test.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { adminAuth } from '../../middleware/admin-auth.js';
import { error } from '../../utils/logger.js';
import { htmlEscape } from './html.js';
import type { AdminRoutesDeps } from './shared.js';

const BASE_PATH = '/admin';
const API_PATH = '/admin/api';

/**
 * The admin shell entry point, the plan-progress dashboard fragment and the
 * analytics surfaces (page + JSON data endpoint).
 *
 * These stand apart from the resource CRUD modules: none of them mutates
 * anything, and the analytics page is the only place that composes four
 * `analyticsService` reads plus the template/plan selects in one response.
 */
export async function registerAnalyticsRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesDeps
): Promise<void> {
  const { templateRepo, analyticsService, interviewPlanService } = opts;

  // GET /admin — Tree view main entry (new hierarchical UI)
  fastify.get(
    BASE_PATH,
    { preHandler: adminAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const templates = await templateRepo.findAllForAdminTree();
        const templatesWithPlans = templates.map((t) => ({
          ...t,
          _plans: t.interviewPlans.map((p) => ({
            ...p,
            _interviews: p.interviews,
            _interviewCount: p._count.interviews,
            _completedCount: p.interviews.filter((i) => i.status === 'COMPLETED').length,
          })),
          _planCount: t._count.interviewPlans,
          _interviewCount: t._count.interviews,
          interviewPlans: undefined,
        }));
        return reply.view('layouts/admin-tree.njk', {
          templates: templatesWithPlans,
          adminUser: _request.user ? _request.user['userId'] : undefined,
          csrfToken: reply.generateCsrf(),
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load admin tree';
        error('Failed to load admin tree', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  // GET /admin/content/dashboard — Plan Progress Dashboard (HTMX fragment)
  fastify.get(
    `${BASE_PATH}/content/dashboard`,
    { preHandler: adminAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const plans = await analyticsService.getDashboardPlanProgress();
        return reply.view('admin/content/dashboard.njk', {
          plans,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load dashboard';
        error('Failed to load dashboard', { error: errMsg });
        return reply.status(500).send(`<div class="text-red-600">${htmlEscape(errMsg)}</div>`);
      }
    }
  );

  // GET /admin/analytics - Analytics dashboard
  fastify.get(
    `${BASE_PATH}/analytics`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const [kpis, statusDistribution, planCompletionRates, weeklyTrend, templates, plans] =
          await Promise.all([
            analyticsService.getKPIs(),
            analyticsService.getStatusDistribution(),
            analyticsService.getPlanCompletionRates(),
            analyticsService.getWeeklyTrend(),
            templateRepo.findAllForSelect(),
            interviewPlanService.findAllForSelect(),
          ]);
        return reply.view('analytics/index.njk', {
          kpis,
          statusDistribution,
          planCompletionRates,
          weeklyTrend,
          templates,
          plans,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load analytics';
        error('Failed to load analytics', { error: errMsg });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  // GET /admin/api/analytics/data - Analytics data API
  fastify.get(
    `${API_PATH}/analytics/data`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const [kpis, statusDistribution, planCompletionRates, weeklyTrend] = await Promise.all([
          analyticsService.getKPIs(),
          analyticsService.getStatusDistribution(),
          analyticsService.getPlanCompletionRates(),
          analyticsService.getWeeklyTrend(),
        ]);
        return reply.send({
          success: true,
          data: { kpis, statusDistribution, planCompletionRates, weeklyTrend },
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to fetch analytics data';
        error('Failed to fetch analytics data', { error: errMsg });
        return reply.status(500).send({ success: false, error: errMsg });
      }
    }
  );
}
