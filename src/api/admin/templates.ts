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
export async function registerTemplateCrudRoutes(
  fastify: FastifyInstance,
  opts: AdminRoutesDeps
): Promise<void> {
  const { templateRepo, interviewRepo, interviewPlanService, templateDimensionService } = opts;
  const adminMutationGuard = createAdminGuard(fastify);

  /**
   * Explain why a template cannot be deleted, or null when it can.
   *
   * A template still referenced by interviews or plans would hit the FK
   * constraint, so the check runs first and reports the count to the operator.
   */
  const findDeletionBlocker = async (id: string): Promise<string | null> => {
    const usageStats = await templateRepo.getUsageStats(id);

    const i = usageStats.interviews;
    const totalInterviews = i.active + i.pending + i.waiting + i.completed + i.cancelled;
    if (totalInterviews > 0) {
      return `<div class="text-red-600">不能删除：该模板关联了 ${totalInterviews} 个访谈记录</div>`;
    }

    const p = usageStats.plans;
    const totalPlans = p.running + p.pending + p.ready + p.paused + p.completed;
    if (totalPlans > 0) {
      return `<div class="text-red-600">不能删除：该模板关联了 ${totalPlans} 个访谈计划</div>`;
    }

    return null;
  };

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

        // Save dimensions to the DB-level column if provided
        if (prepared.dimensions && prepared.dimensions.length > 0) {
          try {
            await templateDimensionService.updateTemplateDimensions(
              created.id,
              prepared.dimensions
            );
          } catch (e) {
            const dimErr = e instanceof Error ? e.message : 'Invalid dimensions';
            error('Template created but dimensions import failed', {
              templateId: created.id,
              error: dimErr,
            });
            // Non-fatal: template was created, just dimensions failed
          }
        }

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
        const rawBody = request.body as Record<string, unknown>;
        const content = buildContentFromForm(rawBody);
        const validationError = validateTemplateContent(content);
        if (validationError) return reply.status(422).send(htmlError(validationError));
        const input = createTemplateSchema.parse({
          name: rawBody['name'],
          description: rawBody['description'],
          content,
        });
        await templateRepo.create({
          name: input.name,
          ...(input.description != null ? { description: input.description } : {}),
          content: input.content as Record<string, unknown>,
        });
        info('Admin template created', { name: input.name });
        return reply.status(201).header('HX-Redirect', '/admin').send('');
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
    { preHandler: adminMutationGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const qp = request.query as Record<string, string | undefined>;
        const body = request.body as Record<string, unknown>;
        const versionRaw = (qp['version'] ?? body['version']) as string | number | undefined;
        const versionParsed = versionSchema.safeParse({ version: versionRaw });
        if (!versionParsed.success)
          return reply.status(422).send(htmlError('Version number is required'));
        const content = buildContentFromForm(body);
        const validationError = validateTemplateContent(content);
        if (validationError) return reply.status(422).send(htmlError(validationError));
        const input = updateTemplateSchema.parse({
          name: body['name'],
          description: body['description'],
          content,
        });
        await templateRepo.updateWithVersion(id, versionParsed.data.version, {
          name: input.name,
          ...(input.description != null ? { description: input.description } : {}),
          content: input.content as Record<string, unknown>,
        });
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
        const existing = await templateRepo.findById(id);
        if (!existing) return reply.status(404).send(htmlError('Template not found'));

        const blocking = await findDeletionBlocker(id);
        if (blocking) return reply.status(409).send(blocking);

        const verified = await templateRepo.deleteAndVerify(id);

        if (!verified) {
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
