// @no-test-required: covered by tests/admin-templates-import.test.ts, tests/admin-error-branches.test.ts and tests/e2e/admin-*.e2e.test.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminAuth } from '../../middleware/admin-auth.js';
import { error, info } from '../../utils/logger.js';
import { htmlError } from './html.js';
import { type AdminRoutesDeps, createAdminGuard } from './shared.js';
import {
  buildContentFromForm,
  createTemplateSchema,
  mapUpdateError,
  prepareTemplateImport,
  updateTemplateSchema,
  validateTemplateContent,
  versionSchema,
} from './template-form.js';
import { parseTemplateContent } from './view-models.js';

const API_PATH = '/admin/api';

/**
 * Template CRUD: the JSON/form endpoints under `/admin/api/templates` plus the
 * two HTMX fragment pages that render the create and edit forms.
 *
 * Kept separate from the plan and report routes because these handlers all
 * write through `templateRepo`; the read-only detail page and the plan pages
 * that merely *display* a template belong with their own resource.
 */

/**
 * Persist imported dimensions, treating failure as non-fatal.
 *
 * The template itself is already committed at this point, so throwing here would
 * report a 500 for an import that actually succeeded -- and the admin would
 * resubmit, creating a duplicate. The failure is logged instead: the template
 * exists but is missing its dimensions, which is repairable by editing.
 */
async function saveImportedDimensions(
  service: AdminRoutesDeps['templateDimensionService'],
  templateId: string,
  dimensions: Array<{ id: string; label: string; keywords?: string[] }> | undefined
): Promise<void> {
  if (!dimensions || dimensions.length === 0) return;
  try {
    await service.updateTemplateDimensions(templateId, dimensions);
  } catch (e) {
    error('Template created but dimensions import failed', {
      templateId,
      error: e instanceof Error ? e.message : 'Invalid dimensions',
    });
  }
}

/** Statuses counted as "this template is in use" for interviews. */
const INTERVIEW_USAGE_STATUSES = [
  'active',
  'pending',
  'waiting',
  'completed',
  'cancelled',
] as const;

/** Statuses counted for plans. */
const PLAN_USAGE_STATUSES = ['running', 'pending', 'ready', 'paused', 'completed'] as const;

/** One deletion-blocking rule: count a group of statuses and name it. */
interface DeletionBlockerRule {
  readonly label: string;
  readonly statuses: readonly string[];
}

/**
 * The rules that make a template undeletable, in reporting order.
 *
 * Interviews first, then plans: an interview is the more specific evidence that
 * deleting would orphan real conversation data, so it is the more useful message.
 */
const DELETION_BLOCKER_RULES: readonly DeletionBlockerRule[] = [
  { label: '访谈记录', statuses: INTERVIEW_USAGE_STATUSES },
  { label: '访谈计划', statuses: PLAN_USAGE_STATUSES },
];

/**
 * The first reason this template cannot be deleted, or null when it can.
 *
 * Every status is summed, including `cancelled` and `completed`: a soft-deleted
 * interview still holds the user's answers, and the foreign key would break
 * whether or not its status reads as active.
 */
function firstDeletionBlocker(usageStats: {
  interviews: Record<string, number>;
  plans: Record<string, number>;
}): string | null {
  for (const [group, rule] of [
    [usageStats.interviews, DELETION_BLOCKER_RULES[0]],
    [usageStats.plans, DELETION_BLOCKER_RULES[1]],
  ] as const) {
    const total = rule.statuses.reduce((sum, status) => sum + (group[status] ?? 0), 0);
    if (total > 0) {
      return `<div class="text-red-600">不能删除：该模板关联了 ${total} 个${rule.label}</div>`;
    }
  }
  return null;
}

/** A template write, normalised and ready for the repository. */
interface PreparedWrite {
  input: {
    name: string;
    description?: string;
    content: Record<string, unknown>;
  };
}

/**
 * Normalise a create/update body into repository input, or explain the problem.
 *
 * The two handlers differ only in which schema they validate against and what
 * they then call, so the shared part lives here: pick the content shape, run the
 * content rules, then let the schema coerce the rest. `description` is spread in
 * conditionally so an absent one stays absent rather than becoming `undefined`,
 * which `exactOptionalPropertyTypes` and Prisma both treat differently from a
 * missing key.
 */
function prepareWrite(
  rawBody: Record<string, unknown>,
  mode: 'create' | 'update'
): PreparedWrite | { error: string } {
  const content = buildContentFromForm(rawBody);
  const contentError = validateTemplateContent(content);
  if (contentError) return { error: contentError };

  const schema = mode === 'create' ? createTemplateSchema : updateTemplateSchema;
  const parsed = schema.parse({
    name: rawBody['name'],
    description: rawBody['description'],
    content,
  });

  const input: PreparedWrite['input'] = {
    name: parsed.name,
    content: parsed.content as Record<string, unknown>,
  };
  if (parsed.description != null) input.description = parsed.description;
  return { input };
}

/**
 * The optimistic-lock version, from the query string or the body.
 *
 * Returns undefined rather than throwing so the caller can answer 422 with the
 * message the edit form expects; `versionSchema` exists to coerce a string from
 * a form field into the integer the column stores.
 */
function readVersion(request: FastifyRequest): number | undefined {
  const qp = request.query as Record<string, string | undefined>;
  const body = request.body as Record<string, unknown>;
  const parsed = versionSchema.safeParse({ version: qp['version'] ?? body['version'] });
  return parsed.success ? parsed.data.version : undefined;
}

/** The status and body for a failed create. */
function createFailure(e: unknown): { status: number; body: string } {
  if (e instanceof z.ZodError) {
    return { status: 422, body: htmlError(e.issues[0]?.message ?? 'Validation failed') };
  }
  const errMsg = e instanceof Error ? e.message : 'Failed to create template';
  error('Failed to create admin template', { error: errMsg });
  return { status: 500, body: htmlError(errMsg) };
}

/** Why a template cannot be deleted, and the status to report it with. */
interface DeletionRefusal {
  status: number;
  body: string;
} /**
 * Check everything that must hold before deleting a template, and delete it.
 *
 * Three distinct refusals, in order: it must exist, nothing may reference it, and
 * the delete must actually take effect. The last is checked AFTER the delete
 * because a repository that silently no-ops would otherwise report success for a
 * row that is still there -- a data-integrity failure the operator must see, not a
 * 404 that reads as "already gone".
 */
async function deletionRefusal(
  id: string,
  repo: AdminRoutesDeps['templateRepo']
): Promise<DeletionRefusal | null> {
  const existing = await repo.findById(id);
  if (!existing) return { status: 404, body: htmlError('Template not found') };

  const blocking = firstDeletionBlocker(await repo.getUsageStats(id));
  if (blocking) return { status: 409, body: blocking };

  const verified = await repo.deleteAndVerify(id);
  if (verified) return null;

  error('Database delete failed: record still exists after delete call', { templateId: id });
  return { status: 500, body: htmlError('数据库删除失败，记录仍然存在') };
}

export async function registerTemplateCrudRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesDeps
): Promise<void> {
  const { templateRepo, interviewRepo, interviewPlanService, templateDimensionService } = opts;
  const adminMutationGuard = createAdminGuard(fastify);

  // GET /admin/content/templates/new
  fastify.get(
    '/admin/content/templates/new',
    { preHandler: adminAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('admin/content/template-new.njk', {});
    }
  );

  // GET /admin/content/templates/import — HTMX fragment for JSON import form
  fastify.get(
    '/admin/content/templates/import',
    { preHandler: adminAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.view('admin/content/template-import.njk', {});
    }
  );

  // POST /admin/api/templates/import — create a template from a pasted JSON document
  fastify.post(
    `${API_PATH}/templates/import`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, unknown>;
        const prepared = prepareTemplateImport(body['json'] as string | undefined);
        if ('error' in prepared) return reply.status(422).send(htmlError(prepared.error));

        const created = await templateRepo.create(prepared.input);
        await saveImportedDimensions(templateDimensionService, created.id, prepared.dimensions);

        info('Admin template imported', { name: prepared.input.name });
        return reply.status(201).header('HX-Redirect', '/admin').send('');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to import template';
        error('Failed to import admin template', { error: errMsg });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );

  // GET /admin/content/templates/:id/edit
  fastify.get(
    '/admin/content/templates/:id/edit',
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const template = await templateRepo.findById(id);
        if (!template)
          return reply.status(404).view('error.njk', { message: 'Template not found' });
        const { content: parsedContent, questions } = parseTemplateContent(template.content);
        return reply.view('admin/content/template-edit.njk', {
          isEdit: true,
          template: { ...template, ...parsedContent },
          existingQuestions: questions.map((q, i) => ({ text: q, order: i, uid: `uid_${i}` })),
          action: 'edit',
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load template';
        error('Failed to load admin template edit form', { error: errMsg, templateId: id });
        return reply.status(500).view('error.njk', { message: errMsg });
      }
    }
  );

  // POST /admin/api/templates/:id/publish — Change template status to PUBLISHED
  fastify.post(
    `${API_PATH}/templates/:id/publish`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const existing = await templateRepo.findById(id);
        if (!existing) return reply.status(404).send(htmlError('模板不存在'));
        if (existing.status === 'PUBLISHED') return reply.send(htmlError('模板已发布'));
        await templateRepo.publish(id);
        info('Admin template published', { templateId: id });
        return reply
          .header('HX-Get', `/admin/content/templates/${id}`)
          .header('HX-Target', '#main-content')
          .send('<div class="text-green-600 text-sm mb-2">已发布</div>');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to publish template';
        error('Failed to publish admin template', { error: errMsg, templateId: id });
        return reply.status(500).send(htmlError(errMsg));
      }
    }
  );

  fastify.post(
    `${API_PATH}/templates`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const prepared = prepareWrite(request.body as Record<string, unknown>, 'create');
        if ('error' in prepared) return reply.status(422).send(htmlError(prepared.error));
        await templateRepo.create(prepared.input);
        info('Admin template created', { name: prepared.input.name });
        return reply.status(201).header('HX-Redirect', '/admin').send('');
      } catch (e) {
        const failure = createFailure(e);
        return reply.status(failure.status).send(failure.body);
      }
    }
  );

  fastify.put(
    `${API_PATH}/templates/:id`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const version = readVersion(request);
        if (version === undefined) {
          return reply.status(422).send(htmlError('Version number is required'));
        }
        const prepared = prepareWrite(request.body as Record<string, unknown>, 'update');
        if ('error' in prepared) return reply.status(422).send(htmlError(prepared.error));
        await templateRepo.updateWithVersion(id, version, prepared.input);
        info('Admin template updated', { templateId: id });
        return reply
          .status(200)
          .send('<div class="text-green-600 font-medium">✓ 保存成功，正在返回...</div>');
      } catch (e) {
        const failure = mapUpdateError(e);
        if (failure.status === 500) {
          error('Failed to update admin template', { error: failure.body, templateId: id });
        }
        return reply.status(failure.status).send(failure.body);
      }
    }
  );

  fastify.delete(
    `${API_PATH}/templates/:id`,
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const refusal = await deletionRefusal(id, templateRepo);
        if (refusal) return reply.status(refusal.status).send(refusal.body);

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

  // GET /admin/api/templates — the paginated table body the tree view swaps in
  fastify.get(
    `${API_PATH}/templates`,
    { preHandler: adminAuth },
    async (_r: FastifyRequest, reply: FastifyReply) => {
      try {
        const qp = (_r.query as Record<string, string | undefined>)['page'];
        const page = qp ? Math.max(1, Number.parseInt(qp, 10)) : 1;
        const result = await templateRepo.findAllPaginated(page, 20);
        const rows = result.items.map(
          (t) =>
            `<tr><td>${escapeCell(t.id)}</td><td>${escapeCell(t.name)}</td><td>${t.status}</td><td>v${t.version}</td></tr>`
        );
        return reply.type('text/html').send(rows.join('\n'));
      } catch (e) {
        return reply.status(500).send(htmlError(e instanceof Error ? e.message : 'Failed'));
      }
    }
  );

  // GET /admin/api/templates/:id/stats - Usage statistics JSON
  fastify.get(
    `${API_PATH}/templates/:id/stats`,
    { preHandler: adminAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const interviewStats = await interviewRepo.countByStatusForTemplate(id);
        const planStats = await interviewPlanService.countByStatusForTemplate(id);
        return reply.send({
          interviews: interviewStats.counts,
          plans: planStats.counts,
          totalInterviews: interviewStats.total,
          totalPlans: planStats.total,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed';
        return reply.status(500).send({ error: errMsg });
      }
    }
  );
}

/** Escape the two template cells that interpolate stored (operator-editable) text. */
function escapeCell(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
