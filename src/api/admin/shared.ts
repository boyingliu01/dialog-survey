// @no-test-required: covered by tests/admin-shell-csrf.test.ts and tests/e2e/admin-*.e2e.test.ts
import type { FastifyInstance } from 'fastify';
import { createAdminMutationGuard } from '../../middleware/admin-csrf.js';
import type { InterviewPlanRepository } from '../../repositories/interview-plan.repository.js';
import type { InterviewRepository } from '../../repositories/interview.repository.js';
import type { TemplateRepository } from '../../repositories/template.repository.js';
import type { AnalysisService } from '../../services/analysis.service.js';
import type { AnalyticsService } from '../../services/analytics.service.js';
import type { ExportService } from '../../services/export.service.js';
import type { InterviewPlanService } from '../../services/interview-plan.service.js';
import type { TemplateDimensionService } from '../../services/template-dimension.service.js';

/**
 * Dependencies the admin routes accept, injected by `server.ts` (and by the
 * test harnesses, which register the same entry point with stubs).
 *
 * The shape is defined once here so every admin module takes the same object;
 * a module only destructures the collaborators it actually uses at registration
 * time, which keeps a missing dependency visible as a TypeScript error instead
 * of a runtime `undefined` deep inside a handler.
 */
export interface AdminRoutesDeps {
  templateRepo: TemplateRepository;
  interviewPlanService: InterviewPlanService;
  interviewRepo: InterviewRepository;
  analysisService: AnalysisService;
  analyticsService: AnalyticsService;
  exportService?: ExportService;
  interviewPlanRepo: InterviewPlanRepository;
  templateDimensionService: TemplateDimensionService;
}

/**
 * Build the guard a mutating admin route uses as `preHandler`.
 *
 * Extracted so the split modules share one construction point: it needs the
 * instance-scoped `csrfProtection` decorator, so it cannot live in a plain
 * helper module and must be created per Fastify instance.
 */
export function createAdminGuard(fastify: FastifyInstance) {
  return createAdminMutationGuard(fastify.csrfProtection);
}
