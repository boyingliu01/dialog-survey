import { PlanStatus, type PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { adminAuth } from '../middleware/admin-auth.js';
import {
  InterviewNotFoundError,
  InterviewPlanService,
  InvalidMemberInputError,
  InvalidStateError,
  MemberConflictError,
  MemberNotFoundError,
  PlanNotFoundError,
} from '../services/interview-plan.service.js';
import { normalizePhone } from '../services/member-verification.service.js';

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
  opts: { interviewPlanService: InterviewPlanService; prisma: PrismaClient }
) {
  const planService = opts.interviewPlanService;

  fastify.post('/api/plans', async (request, _reply) => {
    const input = createPlanSchema.parse(request.body);

    const planId = await planService.createPlan({
      name: input.name,
      ...(input.description != null ? { description: input.description } : {}),
      templateId: input.templateId,
      ...(input.targetDate != null ? { targetDate: new Date(input.targetDate) } : {}),
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

  fastify.put('/api/plans/:id', async (request, _reply) => {
    const { id } = request.params as { id: string };
    const input = createPlanSchema.parse(request.body);
    await planService.updatePlan(id, {
      name: input.name,
      ...(input.description != null ? { description: input.description } : {}),
      ...(input.targetDate != null ? { targetDate: input.targetDate } : {}),
      ...(input.schedule != null ? { schedule: input.schedule } : {}),
    });
    return { id };
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

  fastify.post('/api/plans/:id/members', { preHandler: adminAuth }, async (request, reply) => {
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
  });

  fastify.delete(
    '/api/plans/:id/members/:interviewId',
    { preHandler: adminAuth },
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

  fastify.post('/api/plans/:id/remind', { preHandler: adminAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { interviewId } = remindSchema.parse(request.body ?? {});
    try {
      const result = await planService.sendReminder(id, interviewId);
      return result;
    } catch (e) {
      const { status, message } = mapServiceErrorToStatus(e);
      return reply.status(status).send({ error: message });
    }
  });

  const PHONE_ALIASES = new Set(['phone', '手机号', 'phonenumber', 'mobile']);
  const NAME_ALIASES = new Set(['name', '姓名', 'fullname']);

  interface CsvRow {
    phone: string;
    name: string | undefined;
  }

  interface ImportRowResult {
    rowIndex: number;
    phone: string;
    inputName: string | undefined;
    status: 'ok' | 'name_mismatch' | 'phone_not_found' | 'dingtalk_error' | 'duplicate_phone' | 'phone_invalid';
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
      if (seenPhones.has(phone)) continue;
      seenPhones.set(phone, true);
      result.push({
        phone,
        name: nameIdx >= 0 ? row[nameIdx]?.trim() || undefined : undefined,
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

  fastify.post(
    '/api/plans/:id/import-preview',
    { preHandler: adminAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const plan = await opts.prisma.interviewPlan.findUnique({ where: { id } });
        if (!plan) return reply.code(404).send({ error: 'Plan not found' });
        if (plan.status !== 'PENDING' && plan.status !== 'READY') {
          return reply.code(400).send({ error: '计划当前状态不允许导入成员' });
        }
      } catch {
        return reply.code(404).send({ error: 'Plan not found' });
      }

      const data = await request.file();
      if (!data) return reply.code(400).send({ error: '请上传 CSV 文件' });

      const buffer = await data.toBuffer();
      if (buffer.length === 0) return reply.code(400).send({ error: 'CSV 文件为空' });

      let rows: CsvRow[];
      try {
        const parsed = parseCsv(buffer);
        rows = parsed.rows;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '未知错误';
        return reply.code(400).send({ error: `CSV 解析失败：${message}` });
      }

      if (rows.length === 0) return reply.code(400).send({ error: 'CSV 中没有有效数据行' });
      if (rows.length > 2000) return reply.code(400).send({ error: '单次最多导入 2000 行' });

      const client = DingTalkClient.fromEnv();
      const results: ImportRowResult[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const base = { rowIndex: i + 2, phone: row.phone, inputName: row.name };
        try {
          const { userId, dingtalkName } = await verifyRow(client, row);
          if (row.name && dingtalkName && row.name !== dingtalkName) {
            results.push({
              ...base,
              status: 'name_mismatch',
              userId,
              dingtalkName,
              message: `姓名不匹配：输入 "${row.name}"，钉钉返回 "${dingtalkName}"`,
            });
          } else {
            results.push({
              ...base,
              status: 'ok',
              userId,
              dingtalkName,
              message: '验证通过',
            });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown';
          results.push({
            ...base,
            status: msg === 'phone_not_found' ? 'phone_not_found' : 'dingtalk_error',
            userId: undefined,
            dingtalkName: undefined,
            message: msg === 'phone_not_found' ? '该手机号未在钉钉通讯录中注册' : `钉钉 API 错误：${msg}`,
          });
        }
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
    { preHandler: adminAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const parsed = commitRowsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '请求格式错误：rows 数组格式不正确' });
      }
      const { rows } = parsed.data;

      if (rows.length === 0) return reply.code(400).send({ error: 'no rows to import' });

      const prisma = opts.prisma;

      const plan = await prisma.interviewPlan.findUnique({ where: { id } });
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });
      if (plan.status !== 'PENDING' && plan.status !== 'READY') {
        return reply.code(400).send({ error: '计划当前状态不允许导入成员' });
      }

      const userIds = rows.map((r) => r.userId);

      const crossPlanDups = await prisma.interview.findMany({
        where: {
          userId: { in: userIds },
          planId: { not: id },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
        select: { userId: true, planId: true },
      });
      if (crossPlanDups.length > 0) {
        const conflicts = crossPlanDups.map((d) => `userId=${d.userId} 在计划 ${d.planId} 中有未完成的访谈`);
        return reply.code(409).send({ error: `以下成员已有尚未完成的访谈：${conflicts.join('；')}` });
      }

      const existingInPlan = await prisma.interview.findMany({
        where: { planId: id, userId: { in: userIds } },
        select: { userId: true },
      });
      const existingUserIdSet = new Set(existingInPlan.map((e) => e.userId));
      const newRows = rows.filter((r) => !existingUserIdSet.has(r.userId));
      const skipped = rows.length - newRows.length;

      if (newRows.length === 0 && skipped > 0) {
        return { imported: 0, skipped, interviewIds: [] };
      }

      const templateId = plan.templateId;
      let interviewIds: string[];
      try {
        interviewIds = await prisma.$transaction(async (tx) => {
          const ids: string[] = [];
          for (const row of newRows) {
            const interview = await tx.interview.create({
              data: {
                userId: row.userId,
                templateId,
                planId: id,
                status: 'PENDING',
              },
            });
            ids.push(interview.id);
          }

          const existingInvitees = Array.isArray(plan.inviteeData)
            ? (plan.inviteeData as unknown as Array<{ userId: string; name: string }>)
            : [];
          const newInvitees = newRows.map((r) => ({
            userId: r.userId,
            name: r.dingtalkName || r.inputName || '',
          }));
          await tx.interviewPlan.update({
            where: { id },
            data: { inviteeData: [...existingInvitees, ...newInvitees] },
          });

          await tx.auditLog.create({
            data: {
              action: 'BATCH_IMPORT',
              entityType: 'InterviewPlan',
              entityId: id,
              details: JSON.stringify({ imported: newRows.length, skipped, totalRows: rows.length }),
            },
          });

          return ids;
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '未知错误';
        return reply.code(500).send({ error: `数据库写入失败：${message}` });
      }

      return { imported: newRows.length, skipped, interviewIds };
    }
  );
}
