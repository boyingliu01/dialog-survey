import type { FastifyInstance } from 'fastify';
import { registerAnalyticsRoutes } from './admin/analytics.js';
import { registerPlanPageRoutes } from './admin/plans.js';
import { registerReportRoutes } from './admin/reports.js';
import type { AdminRoutesDeps } from './admin/shared.js';
import { registerTemplateCrudRoutes } from './admin/templates.js';

export type { AdminRoutesDeps };

/**
 * Backwards-compatible alias for the dependency object this entry point has
 * always taken. `server.ts` and the test harnesses pass it positionally, so the
 * name stays even though the interface now lives with the route modules.
 */
export type AdminTemplatesRoutesOptions = AdminRoutesDeps;

/**
 * The admin UI's route table, split by responsibility under `src/api/admin/`.
 *
 * This module is only the wiring: each `register*Routes` call owns one cohesive
 * group of endpoints and takes the full dependency object, so a module can be
 * moved or tested on its own without touching the others. The route paths
 * themselves are fixed — the HTMX fragments under `/admin/content/*` and the
 * shell pages under `/admin/*` are asserted by the E2E suites and referenced by
 * `src/views/**`, so this split must never renumber them.
 *
 * Issue #205: this file used to be a 1108-line module carrying all 28 handlers;
 * archlint flagged it as a GodModule and Stryker mutated it into 887 mutants,
 * which no incremental mutation run ever finished.
 */
export async function adminTemplatesRoutes(
  fastify: FastifyInstance,
  opts: AdminTemplatesRoutesOptions
): Promise<void> {
  await registerAnalyticsRoutes(fastify, opts);
  await registerTemplateCrudRoutes(fastify, opts);
  await registerPlanPageRoutes(fastify, opts);
  await registerReportRoutes(fastify, opts);
}
