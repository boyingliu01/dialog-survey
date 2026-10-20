import { parse } from 'csv-parse/sync';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { createAdminMutationGuard } from '../middleware/admin-csrf.js';
import type { InterviewPlanRepository } from '../repositories/interview-plan.repository.js';
import {
  InterviewNotFoundError,
  type InterviewPlanService,
  InvalidMemberInputError,
  InvalidStateError,
  MemberConflictError,
  MemberNotFoundError,
  PlanNotFoundError,
} from '../services/interview-plan.service.js';
import { normalizePhone } from '../services/member-verification.service.js';
import type { PlanStatus } from '../utils/prisma-client.js';

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  templateId: z.string().uuid(),
  targetDate: z.string().optional(),
  schedule: z.string().optional(),
});

const addMemberSchema = z
  .object({
    userId: z.string().min(1).optional(),
    phone: z
      .string()
      .regex(/^[\d\s+\-()]+$/, 'Invalid phone format')
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

const administrativePlanPostPattern =
  /^\/api\/plans\/[^/?]+\/(?:send|pause|resume|cancel|remind|members|import-(?:preview|commit)|interviews\/[^/?]+\/send)(?:\?.*)?$/;
const administrativePlanDeletePattern = /^\/api\/plans\/[^/?]+\/members\/[^/?]+(?:\?.*)?$/;

/**
 * Routes that mutate a plan administratively. Each entry pairs an HTTP method
 * with the URL pattern that, for that method only, designates a mutation.
 */
const ADMINISTRATIVE_PLAN_MUTATIONS: ReadonlyArray<{
  method: string;
  pattern: RegExp;
}> = [
  { method: 'POST', pattern: /^\/api\/plans(?:\?.*)?$/ },
  { method: 'PUT', pattern: /^\/api\/plans\/[^/?]+(?:\?.*)?$/ },
  { method: 'POST', pattern: administrativePlanPostPattern },
  { method: 'DELETE', pattern: administrativePlanDeletePattern },
];

export function isAdministrativePlanMutation(method: string, url: string): boolean {
  const matches = ADMINISTRATIVE_PLAN_MUTATIONS.filter((rule) => rule.method === method);
  return matches.some((rule) => rule.pattern.test(url));
}

function mapServiceErrorToStatus(err: unknown): { status: number; message: string } {
  if (err instanceof PlanNotFoundError) {
    return { status: 404, message: '访谈计划不存在或已被删除' };
  }
  if (err instanceof InterviewNotFoundError) {
    return { status: 404, message: '访谈记录不存在或已被删除' };
  }
  if (err instanceof MemberNotFoundError) {
    return { status: 404, message: '成员不存在或已被删除' };
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
  const message = err instanceof Error ? err.message : '服务异常，请稍后重试';
  return { status: 502, message };
}

export async function interviewPlanRoutes(
  fastify: FastifyInstance,
  opts: {
    interviewPlanService: InterviewPlanService;
    interviewPlanRepo: InterviewPlanRepository;
  }
) {
  const planService = opts.interviewPlanService;
  const adminMutationGuard = createAdminMutationGuard(fastify.csrfProtection);
  const browserPlanMutationGuard: preHandlerAsyncHookHandler = async function (request, reply) {
    if (request.user?.apiKeyId && request.user.role === 'admin') return;
    if (request.user?.apiKeyId) {
      await reply.code(401).send({ error: 'Admin API key required' });
      return;
    }
    await adminMutationGuard.call(this, request, reply);
  };

  fastify.post('/api/plans', { preHandler: browserPlanMutationGuard }, async (request, reply) => {
    let input: z.infer<typeof createPlanSchema>;
    try {
      input = createPlanSchema.parse(request.body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: e.issues });
      }
      throw e;
    }

    const planId = await planService.createPlan({
      name: input.name,
      ...(input.description != null ? { description: input.description } : {}),
      templateId: input.templateId,
      // An empty date input serializes as targetDate="" — treat it as unset.
      ...(input.targetDate != null && input.targetDate !== ''
        ? { targetDate: new Date(input.targetDate) }
        : {}),
      ...(input.schedule != null ? { schedule: input.schedule } : {}),
    });

    return { id: planId };
  });

  fastify.get('/api/plans', async (request) => {
    const { status, limit, offset } = request.query as {
      status?: PlanStatus;
      limit?: number;
      offset?: number;
    };
    return planService.listPlans({
      ...(status != null ? { status } : {}),
      ...(limit != null ? { limit } : {}),
      ...(offset != null ? { offset } : {}),
    });
  });

  fastify.get('/api/plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await planService.getPlan(id);
    if (!plan) {
      return reply.status(404).send({ error: 'Plan not found' });
    }
    return plan;
  });

  fastify.put(
    '/api/plans/:id',
    { preHandler: browserPlanMutationGuard },
    async (request, _reply) => {
      const { id } = request.params as { id: string };
      const input = createPlanSchema.parse(request.body);
      await planService.updatePlan(id, {
        name: input.name,
        ...(input.description != null ? { description: input.description } : {}),
        // An empty date input serializes as targetDate="" — treat it as unset.
        ...(input.targetDate != null && input.targetDate !== ''
          ? { targetDate: input.targetDate }
          : {}),
        ...(input.schedule != null ? { schedule: input.schedule } : {}),
      });
      return { id };
    }
  );

  /**
   * Register a `POST /api/plans/:id/<action>` endpoint that simply delegates to
   * one plan-service lifecycle call. These five endpoints differ only in the
   * method and the body they answer with, so collapsing them keeps the route
   * table readable and stops each new lifecycle verb from adding a branch to
   * `interviewPlanRoutes`.
   */
  function registerLifecyclePost(
    path: string,
    run: (id: string) => Promise<unknown>,
    body: Record<string, unknown>
  ): void {
    fastify.post(path, { preHandler: browserPlanMutationGuard }, async (request, _reply) => {
      const { id } = request.params as { id: string };
      await run(id);
      return body;
    });
  }

  registerLifecyclePost('/api/plans/:id/pause', (id) => planService.pausePlan(id), {
    status: 'paused',
  });
  registerLifecyclePost('/api/plans/:id/resume', (id) => planService.resumePlan(id), {
    status: 'running',
  });
  registerLifecyclePost('/api/plans/:id/cancel', (id) => planService.cancelPlan(id), {
    status: 'cancelled',
  });

  fastify.post(
    '/api/plans/:id/send',
    { preHandler: browserPlanMutationGuard },
    async (request, _reply) => {
      const { id } = request.params as { id: string };
      return planService.sendInvitations(id);
    }
  );

  fastify.post(
    '/api/plans/:id/interviews/:interviewId/send',
    { preHandler: browserPlanMutationGuard },
    async (request, _reply) => {
      const { id, interviewId } = request.params as { id: string; interviewId: string };
      return planService.resendToInterview(id, interviewId);
    }
  );

  fastify.post(
    '/api/plans/:id/members',
    { preHandler: browserPlanMutationGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const input = addMemberSchema.parse(request.body);
        const result = await planService.addMember(id, {
          ...(input.userId != null ? { userId: input.userId } : {}),
          ...(input.phone != null ? { phone: input.phone } : {}),
          ...(input.name != null ? { name: input.name } : {}),
        });
        return result;
      } catch (e) {
        if (e instanceof z.ZodError) {
          const messages = e.issues.map((issue) => issue.message).join('；');
          return reply.status(400).send({ error: `输入格式错误：${messages}` });
        }
        const { status, message } = mapServiceErrorToStatus(e);
        return reply.status(status).send({ error: message });
      }
    }
  );

  fastify.delete(
    '/api/plans/:id/members/:interviewId',
    { preHandler: browserPlanMutationGuard },
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

  fastify.post(
    '/api/plans/:id/remind',
    { preHandler: browserPlanMutationGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { interviewId } = remindSchema.parse(request.body ?? {});
      try {
        const result = await planService.sendReminder(id, interviewId);
        return result;
      } catch (e) {
        const { status, message } = mapServiceErrorToStatus(e);
        return reply.status(status).send({ error: message });
      }
    }
  );

  const PHONE_ALIASES = new Set(['phone', '手机号', 'phonenumber', 'mobile']);
  const NAME_ALIASES = new Set(['name', '姓名', 'fullname']);

  interface CsvRow {
    phone: string;
    name: string | undefined;
    isDuplicate: boolean;
  }

  interface ImportRowResult {
    rowIndex: number;
    phone: string;
    inputName: string | undefined;
    status:
      | 'ok'
      | 'name_mismatch'
      | 'phone_not_found'
      | 'dingtalk_error'
      | 'duplicate_phone'
      | 'phone_invalid';
    userId: string | undefined;
    dingtalkName: string | undefined;
    message: string;
  }

  function parseCsv(buffer: Buffer): { rows: CsvRow[]; dedupedPhones: Map<string, boolean> } {
    const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    const records: string[][] = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    if (records.length === 0) return { rows: [], dedupedPhones: new Map() };

    const header = records[0].map((h: string) => h.toLowerCase().trim());
    const phoneIdx = header.findIndex((h: string) => PHONE_ALIASES.has(h));
    const nameIdx = header.findIndex((h: string) => NAME_ALIASES.has(h));

    if (phoneIdx < 0) {
      throw new Error('CSV missing phone column. Expected header: phone or 手机号');
    }

    const seenPhones = new Map<string, boolean>();
    const result: CsvRow[] = [];
    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      const rawPhone = row[phoneIdx]?.trim();
      if (!rawPhone) continue;
      const phone = normalizePhone(rawPhone);
      const isDuplicate = seenPhones.has(phone);
      seenPhones.set(phone, true);
      result.push({
        phone,
        name: nameIdx >= 0 ? row[nameIdx]?.trim() || undefined : undefined,
        isDuplicate,
      });
    }
    return { rows: result, dedupedPhones: seenPhones };
  }

  async function verifyRow(
    client: DingTalkClient,
    row: CsvRow
  ): Promise<{ userId: string; dingtalkName: string }> {
    const lookup = await client.getUserIdByMobile(row.phone);
    if (!lookup.found) {
      throw new Error('phone_not_found');
    }
    const userInfo = await client.getUserByUserId(lookup.userId);
    return { userId: userInfo.userid, dingtalkName: userInfo.name || '' };
  }

  /**
   * Classify one CSV row into an import result. Extracted from the route handler
   * so the duplicate / found / mismatch / error precedence is readable in one
   * place instead of nested inside the request loop.
   */
  async function classifyImportRow(
    client: DingTalkClient,
    row: CsvRow,
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
    cache: Map<string, { userId: string; dingtalkName: string }>,
    rowNumber: number
  ): Promise<ImportRowResult> {
    if (row.isDuplicate) {
      const cached = cache.get(row.phone);
      if (!cached) {
        return {
          ...base,
          status: 'phone_not_found',
          userId: undefined,
          dingtalkName: undefined,
          message: '该手机号未在钉钉通讯录中注册',
        };
      }
      return {
        ...base,
        status: 'duplicate_phone',
        userId: cached.userId,
        dingtalkName: cached.dingtalkName,
        message: `手机号重复，与第 ${rowNumber} 行合并为同一人`,
      };
    }

    try {
      const { userId, dingtalkName } = await verifyRow(client, row);
      cache.set(row.phone, { userId, dingtalkName });
      if (row.name && dingtalkName && row.name !== dingtalkName) {
        return {
          ...base,
          status: 'name_mismatch',
          userId,
          dingtalkName,
          message: `姓名不匹配：输入 "${row.name}"，钉钉返回 "${dingtalkName}"`,
        };
      }
      return { ...base, status: 'ok', userId, dingtalkName, message: '验证通过' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      return {
        ...base,
        status: msg === 'phone_not_found' ? 'phone_not_found' : 'dingtalk_error',
        userId: undefined,
        dingtalkName: undefined,
        message:
          msg === 'phone_not_found' ? '该手机号未在钉钉通讯录中注册' : `钉钉 API 错误：${msg}`,
      };
    }
  }

  const MAX_IMPORT_ROWS = 2000;

  /**
   * Read and validate the uploaded CSV, returning either the rows or the HTTP
   * error to send. Kept out of the handler so the route reads as
   * "validate input → classify rows → summarize".
   */
  async function readImportRows(
    request: FastifyRequest
  ): Promise<{ rows: CsvRow[] } | { errorCode: number; error: string }> {
    const data = await request.file();
    if (!data) return { errorCode: 400, error: '请上传 CSV 文件' };

    const buffer = await data.toBuffer();
    if (buffer.length === 0) return { errorCode: 400, error: 'CSV 文件为空' };

    let rows: CsvRow[];
    try {
      rows = parseCsv(buffer).rows;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '未知错误';
      return { errorCode: 400, error: `CSV 解析失败：${message}` };
    }

    if (rows.length === 0) return { errorCode: 400, error: 'CSV 中没有有效数据行' };
    if (rows.length > MAX_IMPORT_ROWS) {
      return { errorCode: 400, error: `单次最多导入 ${MAX_IMPORT_ROWS} 行` };
    }
    return { rows };
  }

  /**
   * Reject the import when the plan is missing or in a status that forbids
   * member edits. Returns an HTTP error descriptor, or null when it may proceed.
   */
  async function rejectUnimportablePlan(
    planId: string
  ): Promise<{ errorCode: number; error: string } | null> {
    try {
      const plan = await opts.interviewPlanRepo.findById(planId);
      if (!plan) return { errorCode: 404, error: 'Plan not found' };
      if (plan.status !== 'PENDING' && plan.status !== 'READY') {
        return { errorCode: 400, error: '计划当前状态不允许导入成员' };
      }
      return null;
    } catch {
      return { errorCode: 404, error: 'Plan not found' };
    }
  }

  fastify.post(
    '/api/plans/:id/import-preview',
    { preHandler: browserPlanMutationGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const planError = await rejectUnimportablePlan(id);
      if (planError) return reply.code(planError.errorCode).send({ error: planError.error });

      const parsed = await readImportRows(request);
      if ('errorCode' in parsed) return reply.code(parsed.errorCode).send({ error: parsed.error });
      const rows = parsed.rows;

      const client = DingTalkClient.fromEnv();
      const results: ImportRowResult[] = [];
      const phoneResultCache = new Map<string, { userId: string; dingtalkName: string }>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const base = { rowIndex: i + 2, phone: row.phone, inputName: row.name };
        results.push(await classifyImportRow(client, row, base, phoneResultCache, i + 1));
      }

      const passed = results.filter((r) => r.status === 'ok').length;
      const failed = results.length - passed;
      return {
        totalRows: results.length,
        passed,
        failed,
        skipped: 0,
        summary: failed === 0 ? ('all_passed' as const) : ('has_errors' as const),
        results,
      };
    }
  );

  const commitRowsSchema = z.object({
    rows: z.array(
      z.object({
        rowIndex: z.number().int().min(1),
        phone: z.string().min(1),
        status: z.literal('ok'),
        userId: z.string().min(1),
        inputName: z.string().optional(),
        dingtalkName: z.string().optional(),
        message: z.string(),
      })
    ),
  });

  fastify.post(
    '/api/plans/:id/import-commit',
    { preHandler: browserPlanMutationGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = commitRowsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '请求格式错误：rows 数组格式不正确' });
      }
      const { rows } = parsed.data;

      if (rows.length === 0) return reply.code(400).send({ error: 'no rows to import' });

      const planService = opts.interviewPlanService;

      let importResult: { imported: number; skipped: number; interviewIds: string[] };
      try {
        importResult = await planService.importMembers(
          id,
          rows.map((r) => ({
            userId: r.userId,
            ...(r.inputName !== undefined ? { inputName: r.inputName } : {}),
            ...(r.dingtalkName !== undefined ? { dingtalkName: r.dingtalkName } : {}),
          }))
        );
      } catch (e) {
        if (e instanceof PlanNotFoundError) {
          return reply.code(404).send({ error: 'Plan not found' });
        }
        if (e instanceof InvalidStateError) {
          return reply.code(400).send({ error: e.message });
        }
        if (e instanceof MemberConflictError) {
          return reply.code(409).send({ error: e.message });
        }
        const message = e instanceof Error ? e.message : '未知错误';
        return reply.code(500).send({ error: `数据库写入失败：${message}` });
      }

      return {
        imported: importResult.imported,
        skipped: importResult.skipped,
        interviewIds: importResult.interviewIds,
      };
    }
  );
}
