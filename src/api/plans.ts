import { parse } from 'csv-parse/sync';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { DingTalkClient } from '../integrations/dingtalk/client.js';
import { createAdminMutationGuard } from '../middleware/admin-csrf.js';
import type { InterviewPlanRepository } from '../repositories/interview-plan.repository.js';
import type { AddMemberInput } from '../services/interview-plan-members.service.js';
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
import { warn } from '../utils/logger.js';
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

/**
 * Error class -> HTTP status, plus whether the class's own message is safe to show.
 *
 * The rows carry a fixed message where the class name must not leak internals (a
 * missing plan says "not found" rather than echoing back the id), and `null` where
 * the thrown message IS the useful thing to say (a validation conflict reads
 * differently from a state conflict).
 */
const PLAN_ERROR_STATUS: ReadonlyArray<{
  errorClass: new (...args: never[]) => Error;
  status: number;
  message: string | null;
}> = [
  { errorClass: PlanNotFoundError, status: 404, message: '访谈计划不存在或已被删除' },
  { errorClass: InterviewNotFoundError, status: 404, message: '访谈记录不存在或已被删除' },
  { errorClass: MemberNotFoundError, status: 404, message: '成员不存在或已被删除' },
  { errorClass: MemberConflictError, status: 409, message: null },
  { errorClass: InvalidStateError, status: 400, message: null },
  { errorClass: InvalidMemberInputError, status: 400, message: null },
];

/**
 * How to answer a service-layer error.
 *
 * Anything unrecognised becomes 502 rather than 500: these errors come from a
 * service boundary, so an unclassified throw almost always means a dependency
 * failed, and "bad gateway" tells the operator where to look.
 */
function mapServiceErrorToStatus(err: unknown): { status: number; message: string } {
  const row = PLAN_ERROR_STATUS.find(({ errorClass }) => err instanceof errorClass);
  if (row) return { status: row.status, message: row.message ?? ownMessage(err) };
  return { status: 502, message: ownMessage(err) };
}

/** The thrown error's message, or a generic fallback for a non-Error throw. */
function ownMessage(err: unknown): string {
  return err instanceof Error ? err.message : '服务异常，请稍后重试';
}

/** True when the caller authenticated with an admin API key. */
function isAdminApiKey(request: { user?: { apiKeyId?: string; role?: string } }): boolean {
  return Boolean(request.user?.apiKeyId) && request.user?.role === 'admin';
}

const commitRowsSchema = z.object({
  rows: z.array(
    z.object({
      rowIndex: z.number().int().min(1),
      // Optional since #219: a userId-only row has no phone number.
      phone: z.string().min(1).optional(),
      // Mirrors IMPORTABLE_STATUSES -- a non-importable status is rejected here
      // rather than trusted from the client.
      status: z.enum(['ok', 'name_differs']),
      userId: z.string().min(1),
      inputName: z.string().optional(),
      dingtalkName: z.string().optional(),
      message: z.string(),
    })
  ),
});

/** The optional plan fields shared by the create and update endpoints. */
interface EditablePlanFields {
  description?: string | undefined;
  targetDate?: string | undefined;
  schedule?: string | undefined;
}

/**
 * An EMPTY targetDate means the field was cleared, not set to the epoch.
 *
 * A browser serialises an empty date input as `''`; passing that on would either
 * become an Invalid Date or overwrite the column with garbage, so it is dropped and
 * the existing value survives.
 */
function hasTargetDate(input: EditablePlanFields): input is EditablePlanFields & {
  targetDate: string;
} {
  return input.targetDate != null && input.targetDate !== '';
}

/**
 * The optional fields for `createPlan`, which takes a real Date.
 *
 * Separate from `planUpdateFields` because the two services disagree on the type --
 * create takes a Date, update takes the raw string and converts it itself.
 */
function createPlanFields(input: EditablePlanFields): {
  description?: string;
  targetDate?: Date;
  schedule?: string;
} {
  return {
    ...(input.description != null ? { description: input.description } : {}),
    ...(hasTargetDate(input) ? { targetDate: new Date(input.targetDate) } : {}),
    ...(input.schedule != null ? { schedule: input.schedule } : {}),
  };
}

/** The optional fields for `updatePlan`, which accepts the raw date string. */
function planUpdateFields(input: EditablePlanFields): {
  description?: string;
  targetDate?: string;
  schedule?: string;
} {
  return {
    ...(input.description != null ? { description: input.description } : {}),
    ...(hasTargetDate(input) ? { targetDate: input.targetDate } : {}),
    ...(input.schedule != null ? { schedule: input.schedule } : {}),
  };
}

/**
 * The uploaded CSV's bytes and declared MIME type.
 *
 * Both rejections are 400 with their own message: no file at all is a different
 * mistake from an empty one, and an operator chasing "file empty" for a request that
 * never attached anything wastes the same twenty minutes either way.
 */
async function readUploadedCsv(
  request: FastifyRequest
): Promise<{ buffer: Buffer; mimetype: string } | { errorCode: number; error: string }> {
  const data = await request.file();
  if (!data) return { errorCode: 400, error: '请上传 CSV 文件' };
  const buffer = await data.toBuffer();
  if (buffer.length === 0) return { errorCode: 400, error: 'CSV 文件为空' };
  return { buffer, mimetype: data.mimetype };
}

/**
 * The optional member fields for `addMember`.
 *
 * Built key-by-key so an ABSENT field stays absent. Passing `undefined` explicitly
 * would make "no phone given" indistinguishable from "phone cleared", and the
 * service treats those differently.
 */
function memberInput(input: {
  userId?: string | null | undefined;
  phone?: string | null | undefined;
  name?: string | null | undefined;
}): AddMemberInput {
  return {
    ...(input.userId != null ? { userId: input.userId } : {}),
    ...(input.phone != null ? { phone: input.phone } : {}),
    ...(input.name != null ? { name: input.name } : {}),
  };
}

/**
 * How a failed userId-mode name lookup degrades.
 *
 * DingTalk answers 60121/60111 for "user not found"; only that is fatal, because it
 * means the userId itself is wrong. Quota, permission and network failures downgrade
 * the row to "unverified" instead of blocking the import (DR-002).
 *
 * The warning is the ONLY signal that name validation is broken -- without it a
 * quota exhaustion would silently stop every name check on the deployment.
 */
function userNameLookupFailure(userId: string, err: unknown): UserNameCheck {
  const msg = err instanceof Error ? err.message : 'unknown';
  if (isNotFoundMessage(msg)) return { kind: 'not_found' };
  warn('DingTalk name check failed; importing on userId without name validation', {
    userId,
    reason: msg,
  });
  return { kind: 'unverified', reason: msg };
}

/** Every verdict a member-import row can carry. */
type ImportStatus =
  | 'ok'
  | 'name_mismatch'
  | 'name_differs'
  | 'phone_not_found'
  | 'user_not_found'
  | 'dingtalk_error'
  | 'duplicate_phone'
  | 'duplicate_member'
  | 'phone_invalid'
  | 'missing_identifier';

/** One row's classification result, as the preview endpoint returns it. */
interface ImportRowResult {
  rowIndex: number;
  phone: string | undefined;
  inputName: string | undefined;
  status: ImportStatus;
  userId: string | undefined;
  dingtalkName: string | undefined;
  message: string;
}

/**
 * The verdict for a phone-mode row that DingTalk confirmed.
 *
 * A mismatch is a HARD failure here, unlike userId mode: the lookup returned the
 * authoritative name, so there is something concrete to disagree with. Only a row
 * that carried no name at all is accepted without a comparison.
 */
function phoneRowVerdict(
  base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
  inputName: string | undefined,
  verified: { userId: string; dingtalkName: string }
): ImportRowResult {
  const { userId, dingtalkName } = verified;
  if (inputName && dingtalkName && inputName !== dingtalkName) {
    return {
      ...base,
      status: 'name_mismatch',
      userId,
      dingtalkName,
      message: `姓名不匹配：输入 "${inputName}"，钉钉返回 "${dingtalkName}"`,
    };
  }
  return { ...base, status: 'ok', userId, dingtalkName, message: '验证通过' };
}

/** A commit row exactly as the import endpoint's schema accepts it. */
type CommitRow = z.infer<typeof commitRowsSchema>['rows'][number];

/**
 * The validated rows, or the message to answer with.
 *
 * Both rejections are 400 but they mean different things, so they get different
 * text: a malformed body is the caller's request being wrong, while an EMPTY row
 * list is a well-formed request with nothing in it. Collapsing them to one message
 * sends the caller looking for a syntax error that is not there.
 */
function commitRowsFrom(body: unknown): CommitRow[] | { problem: string } {
  const parsed = commitRowsSchema.safeParse(body);
  if (!parsed.success) return { problem: '请求格式错误：rows 数组格式不正确' };
  if (parsed.data.rows.length === 0) return { problem: 'no rows to import' };
  return parsed.data.rows;
}

/**
 * One import row.
 *
 * Optional fields are spread conditionally rather than passed as `undefined` so the
 * downstream "was a name supplied?" checks see an ABSENT key, not a present-but-
 * empty one -- which is the difference between "validate the name" and "no name
 * given, skip validation".
 */
function toImportMember(row: CommitRow): {
  userId: string;
  inputName?: string;
  dingtalkName?: string;
} {
  return {
    userId: row.userId,
    ...(row.inputName !== undefined ? { inputName: row.inputName } : {}),
    ...(row.dingtalkName !== undefined ? { dingtalkName: row.dingtalkName } : {}),
  };
}

/**
 * How to answer a failed member import.
 *
 * An unclassified throw is reported as 500 with the dependency's own message: this
 * write is the step that actually persists the import, so "database write failed"
 * is the accurate description and the message is what the operator needs.
 */
function importFailure(err: unknown): { status: number; error: string } {
  if (err instanceof PlanNotFoundError) return { status: 404, error: 'Plan not found' };
  if (err instanceof InvalidStateError) return { status: 400, error: err.message };
  if (err instanceof MemberConflictError) return { status: 409, error: err.message };
  const message = err instanceof Error ? err.message : '未知错误';
  return { status: 500, error: `数据库写入失败：${message}` };
}

/** The outcome of validating a supplied name against DingTalk's. */
type UserNameCheck =
  | { kind: 'verified'; dingtalkName: string }
  | { kind: 'differs'; dingtalkName: string }
  | { kind: 'unverified'; reason: string }
  | { kind: 'not_found' };

/**
 * The API's "user not found" signal.
 *
 * DingTalk answers 60121/60111 for a missing user. Only this class of failure is
 * fatal for a userId-mode row; quota, permission and network failures downgrade the
 * row instead, so the two must not be conflated.
 */
function isNotFoundMessage(msg: string): boolean {
  return /60121|60111|user not found|no such user/i.test(msg);
}

/**
 * Compare a supplied name against the one DingTalk returned.
 *
 * A successful lookup that carries NO name must not be reported as verified --
 * that would claim a comparison that never happened. It degrades to "unverified",
 * which is a warning the operator can act on rather than a silent pass.
 */
function compareUserName(inputName: string, dingtalkName: string): UserNameCheck {
  if (!dingtalkName) return { kind: 'unverified', reason: '钉钉未返回姓名，无法校验' };
  if (inputName !== dingtalkName) return { kind: 'differs', dingtalkName };
  return { kind: 'verified', dingtalkName };
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
    if (isAdminApiKey(request)) return;
    if (request.user?.apiKeyId) {
      await reply.code(401).send({ error: 'Admin API key required' });
      return;
    }
    await adminMutationGuard.call(this, request, reply);
  };

  fastify.post('/api/plans', { preHandler: browserPlanMutationGuard }, async (request, reply) => {
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const planId = await planService.createPlan({
      name: parsed.data.name,
      templateId: parsed.data.templateId,
      ...createPlanFields(parsed.data),
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
      const parsed = createPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        return { error: 'Invalid input', details: parsed.error.issues };
      }
      await planService.updatePlan(id, {
        name: parsed.data.name,
        ...planUpdateFields(parsed.data),
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
      const parsed = addMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        const messages = parsed.error.issues.map((issue) => issue.message).join('；');
        return reply.status(400).send({ error: `输入格式错误：${messages}` });
      }
      try {
        return await planService.addMember(id, memberInput(parsed.data));
      } catch (e) {
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
  // Issue #219: enterprise contact-list exports carry a userId and a name but
  // no phone number, so the import must accept userId as a first-class
  // identifier. Same alias style as PHONE_ALIASES / NAME_ALIASES.
  const USERID_ALIASES = new Set(['userid', '用户id', '钉钉id', 'user_id', 'dingtalkid']);

  /**
   * How a row identifies the person. `userId` rows are imported on the strength
   * of the supplied userId alone (matching `addMember`, which skips DingTalk
   * entirely); only `phone` rows go through the mobile lookup.
   */
  type ImportMode = 'phone' | 'userId' | 'none';

  interface CsvRow {
    phone: string | undefined;
    userId: string | undefined;
    name: string | undefined;
    mode: ImportMode;
    isDuplicate: boolean;
  }

  /**
   * The single source of truth for "may this row be written to the plan".
   * Preview counts and the commit schema both derive from it, so a client
   * cannot claim importability the server did not grant (issue #219 R2).
   */
  const IMPORTABLE_STATUSES: ReadonlySet<ImportStatus> = new Set<ImportStatus>([
    'ok',
    'name_differs',
  ]);

  function isImportableStatus(status: ImportStatus): boolean {
    return IMPORTABLE_STATUSES.has(status);
  }

  /** Lower-cased header cells, so alias matching is case-insensitive. */
  function headerIndex(header: string[], aliases: ReadonlySet<string>): number {
    return header.findIndex((h: string) => aliases.has(normalizeHeaderCell(h)));
  }

  /**
   * Normalise a header/key so `钉钉 ID`, `钉钉ID` and `dingtalk_id` all match the
   * same alias. The admin UI labels this field "钉钉 ID", which is exactly the
   * spelling an export is likely to carry.
   */
  function normalizeHeaderCell(cell: string): string {
    return cell.toLowerCase().replace(/[\s_-]/g, '');
  }

  function columnValue(row: string[], index: number): string | undefined {
    if (index < 0) return undefined;
    return row[index]?.trim() || undefined;
  }

  /**
   * Turn one raw input row into the row model. A row carrying a userId wins
   * over a phone number; a row carrying neither is kept (mode `none`) so the
   * preview can tell the admin *which* rows are unusable instead of silently
   * dropping them (the pre-#219 behaviour that made pure-userId lists vanish).
   */
  function buildCsvRow(fields: {
    phone: string | undefined;
    userId: string | undefined;
    name: string | undefined;
  }): CsvRow {
    const mode: ImportMode = fields.userId ? 'userId' : fields.phone ? 'phone' : 'none';
    return {
      phone: fields.phone,
      userId: fields.userId,
      name: fields.name,
      mode,
      isDuplicate: false,
    };
  }

  /** Mark repeated identifiers so the preview can merge them (first one wins). */
  function markDuplicates(rows: CsvRow[]): CsvRow[] {
    const seen = new Set<string>();
    return rows.map((row) => {
      const key = row.userId ?? row.phone;
      if (key === undefined) return { ...row, isDuplicate: false };
      const isDuplicate = seen.has(key);
      seen.add(key);
      return { ...row, isDuplicate };
    });
  }

  /**
   * Read one value out of a JSON object, fresh each call: the first key present
   * wins, so callers pass their aliases in priority order. Keys are matched
   * case-insensitively, like CSV headers, because the alias sets are lowercase.
   */
  /** Normalise a JSON record's keys once, so each row costs one pass. */
  function normalizeJsonKeys(record: Record<string, unknown>): Map<string, unknown> {
    const lowered = new Map<string, unknown>();
    for (const [key, value] of Object.entries(record)) {
      lowered.set(normalizeHeaderCell(key), value);
    }
    return lowered;
  }

  function readJsonField(
    lowered: ReadonlyMap<string, unknown>,
    aliases: ReadonlySet<string>
  ): string | undefined {
    for (const alias of aliases) {
      const value = lowered.get(alias);
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }

  function normalizePhoneOrUndefined(raw: string | undefined): string | undefined {
    return raw === undefined ? undefined : normalizePhone(raw);
  }

  function asJsonRecord(item: unknown): Record<string, unknown> {
    return item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
  }

  /** Decide whether the upload is JSON rather than CSV. */
  function isJsonPayload(content: string, mimetype?: string): boolean {
    if (mimetype !== undefined && /json/i.test(mimetype)) return true;
    const head = content.trimStart();
    return head.startsWith('[') || head.startsWith('{');
  }

  /**
   * Parse a JSON array of `{userId, name}` (or `{phone, name}`) objects into the
   * shared row model. Unknown-shaped elements become `mode: 'none'` rows rather
   * than failing the upload — they are reported per row, like a blank CSV cell.
   */
  function parseJsonRows(content: string): CsvRow[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown';
      throw new Error(`JSON 解析失败：${message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('JSON 必须为数组：[{"userId": "...", "name": "..."}]');
    }

    const rows = parsed.map((item: unknown) => {
      const lowered = normalizeJsonKeys(asJsonRecord(item));
      const phone = normalizePhoneOrUndefined(readJsonField(lowered, PHONE_ALIASES));
      return buildCsvRow({
        phone,
        userId: readJsonField(lowered, USERID_ALIASES),
        name: readJsonField(lowered, NAME_ALIASES),
      });
    });
    return markDuplicates(rows);
  }

  /** Locate the identifier column indices, or throw when neither is present. */
  function requireIdentifierColumns(header: string[]): {
    phoneIdx: number;
    userIdIdx: number;
    nameIdx: number;
  } {
    const phoneIdx = headerIndex(header, PHONE_ALIASES);
    const userIdIdx = headerIndex(header, USERID_ALIASES);
    if (phoneIdx < 0 && userIdIdx < 0) {
      throw new Error('CSV 必须包含手机号或 userId 列之一');
    }
    return { phoneIdx, userIdIdx, nameIdx: headerIndex(header, NAME_ALIASES) };
  }

  /** Map one CSV record (header already resolved) into the row model. */
  function csvRecordToRow(
    row: string[],
    columns: { phoneIdx: number; userIdIdx: number; nameIdx: number }
  ): CsvRow {
    return buildCsvRow({
      phone: normalizePhoneOrUndefined(columnValue(row, columns.phoneIdx)),
      userId: columnValue(row, columns.userIdIdx),
      name: columnValue(row, columns.nameIdx),
    });
  }

  function parseCsv(buffer: Buffer, mimetype?: string): CsvRow[] {
    const content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    if (isJsonPayload(content, mimetype)) return parseJsonRows(content);

    const records: string[][] = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    if (records.length === 0) return [];

    const header = records[0].map((h: string) => normalizeHeaderCell(h));
    const columns = requireIdentifierColumns(header);
    return markDuplicates(records.slice(1).map((row) => csvRecordToRow(row, columns)));
  }

  async function verifyRow(
    client: DingTalkClient,
    row: CsvRow & { phone: string }
  ): Promise<{ userId: string; dingtalkName: string }> {
    const lookup = await client.getUserIdByMobile(row.phone);
    if (!lookup.found) {
      throw new Error('phone_not_found');
    }
    // getUserIdByMobile already resolves the name (issue #199), so the extra
    // user/get round-trip this used to make is no longer needed.
    return { userId: lookup.userId, dingtalkName: lookup.name.trim() };
  }

  /** Outcome of the userId-mode name check — never throws, by design. */
  /**
   * Look the supplied userId up so the name can be *validated*. The userId is
   * already authoritative (issue #219 / DR-001, DR-002), so a lookup failure
   * must not fail the row — it only downgrades the row to "name unverified".
   * The one failure that does block is an explicit "no such user", because that
   * means the userId itself is wrong.
   */
  async function checkUserName(
    client: DingTalkClient,
    userId: string,
    inputName: string | undefined
  ): Promise<UserNameCheck> {
    if (!inputName) return { kind: 'unverified', reason: '未填写姓名，跳过校验' };
    try {
      const dingtalkName = (await client.getUserByUserId(userId)).name?.trim() ?? '';
      return compareUserName(inputName, dingtalkName);
    } catch (e: unknown) {
      return userNameLookupFailure(userId, e);
    }
  }

  /**
   * Map a userId-mode name check onto the row verdict. Pure, so the mapping —
   * which is the part that encodes DR-001 and DR-002 — is easy to read.
   */
  function userIdVerdict(
    check: UserNameCheck,
    inputName: string | undefined
  ): { status: ImportStatus; dingtalkName: string | undefined; message: string } {
    switch (check.kind) {
      case 'not_found':
        return {
          status: 'user_not_found',
          dingtalkName: undefined,
          message: '该 userId 在钉钉通讯录中不存在',
        };
      case 'differs':
        return {
          status: 'name_differs',
          dingtalkName: check.dingtalkName,
          message: `姓名与钉钉不一致：输入 "${inputName}"，钉钉返回 "${check.dingtalkName}"（仅提示，将按 userId 导入）`,
        };
      case 'unverified':
        return {
          status: 'ok',
          dingtalkName: undefined,
          message: `按 userId 导入（姓名未校验：${check.reason}）`,
        };
      default:
        return { status: 'ok', dingtalkName: check.dingtalkName, message: '验证通过' };
    }
  }

  /**
   * Classify a userId-mode row. The userId is authoritative (issue #219), so
   * the lookup only ever adjusts the verdict — it never gated the import.
   */
  async function classifyUserIdRow(
    client: DingTalkClient,
    row: CsvRow,
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
    rowNumber: number
  ): Promise<ImportRowResult> {
    const userId = row.userId as string;
    if (row.isDuplicate) {
      return {
        ...base,
        status: 'duplicate_member',
        userId,
        dingtalkName: undefined,
        message: `userId 重复，与第 ${rowNumber} 行合并为同一人`,
      };
    }
    return {
      ...base,
      userId,
      ...userIdVerdict(await checkUserName(client, userId, row.name), row.name),
    };
  }

  /** The row verdict for a phone that DingTalk does not know. */
  function phoneNotFound(
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>
  ): ImportRowResult {
    return {
      ...base,
      status: 'phone_not_found',
      userId: undefined,
      dingtalkName: undefined,
      message: '该手机号未在钉钉通讯录中注册',
    };
  }

  /** Resolve a first-seen phone through DingTalk and compare the name. */
  async function verifyPhoneRow(
    client: DingTalkClient,
    row: CsvRow,
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
    cache: Map<string, { userId: string; dingtalkName: string }>
  ): Promise<ImportRowResult> {
    const phone = row.phone as string;
    try {
      const verified = await verifyRow(client, { ...row, phone });
      cache.set(phone, verified);
      return phoneRowVerdict(base, row.name, verified);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown';
      if (msg === 'phone_not_found') return phoneNotFound(base);
      return {
        ...base,
        status: 'dingtalk_error',
        userId: undefined,
        dingtalkName: undefined,
        message: `钉钉 API 错误：${msg}`,
      };
    }
  }

  /**
   * Classify a phone-mode row: the mobile number is the identifier, so the row
   * is only usable once DingTalk confirms the number belongs to a real user.
   * A name mismatch is a hard failure here (unlike userId mode), because the
   * lookup did return the authoritative name to compare against.
   */
  async function classifyPhoneRow(
    client: DingTalkClient,
    row: CsvRow,
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
    cache: Map<string, { userId: string; dingtalkName: string }>,
    rowNumber: number
  ): Promise<ImportRowResult> {
    if (!row.isDuplicate) return verifyPhoneRow(client, row, base, cache);

    const phone = row.phone as string;
    const cached = cache.get(phone);
    if (!cached) return phoneNotFound(base);
    return {
      ...base,
      status: 'duplicate_phone',
      userId: cached.userId,
      dingtalkName: cached.dingtalkName,
      message: `手机号重复，与第 ${rowNumber} 行合并为同一人`,
    };
  }

  /**
   * Classify one row into an import result. Extracted from the route handler
   * so the duplicate / found / mismatch / error precedence is readable in one
   * place instead of nested inside the request loop. Dispatches on the row's
   * identifier mode; each mode's rules live in their own function.
   */
  async function classifyImportRow(
    client: DingTalkClient,
    row: CsvRow,
    base: Omit<ImportRowResult, 'status' | 'userId' | 'dingtalkName' | 'message'>,
    cache: Map<string, { userId: string; dingtalkName: string }>,
    rowNumber: number
  ): Promise<ImportRowResult> {
    if (row.mode === 'none') {
      return {
        ...base,
        status: 'missing_identifier',
        userId: undefined,
        dingtalkName: undefined,
        message: '缺少手机号与 userId',
      };
    }
    if (row.mode === 'userId') {
      return classifyUserIdRow(client, row, base, rowNumber);
    }
    return classifyPhoneRow(client, row, base, cache, rowNumber);
  }

  const MAX_IMPORT_ROWS = 2000;

  /**
   * Read and validate the uploaded file, returning either the rows or the HTTP
   * error to send. Kept out of the handler so the route reads as
   * "validate input → classify rows → summarize".
   */
  type ImportRowsError = { errorCode: number; error: string };

  /** The row-level checks, split out so each reason reads on its own line. */
  function validateImportRows(rows: CsvRow[]): ImportRowsError | null {
    if (rows.length === 0) return { errorCode: 400, error: 'CSV 中没有有效数据行' };
    if (rows.every((row) => row.mode === 'none')) {
      return { errorCode: 400, error: '没有可导入的数据行：所有行都缺少手机号与 userId' };
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return { errorCode: 400, error: `单次最多导入 ${MAX_IMPORT_ROWS} 行` };
    }
    return null;
  }

  async function readImportRows(
    request: FastifyRequest
  ): Promise<{ rows: CsvRow[] } | ImportRowsError> {
    const upload = await readUploadedCsv(request);
    if ('errorCode' in upload) return upload;

    let rows: CsvRow[];
    try {
      rows = parseCsv(upload.buffer, upload.mimetype);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '未知错误';
      return { errorCode: 400, error: `CSV 解析失败：${message}` };
    }

    return validateImportRows(rows) ?? { rows };
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

      // Issue #219: passed counts everything that may be imported — including
      // `name_differs` warnings — so the preview total and the commit filter
      // can never disagree. `warnings` is a subset of `passed`, and
      // passed + failed === totalRows always holds.
      const passed = results.filter((r) => isImportableStatus(r.status)).length;
      // Derived from the same `isImportableStatus` predicate as `passed`, so
      // "warnings ⊆ passed" holds structurally: if `name_differs` ever left
      // IMPORTABLE_STATUSES, warnings would drop to 0 rather than silently
      // exceeding the importable count.
      const warnings = results.filter(
        (r) => r.status === 'name_differs' && isImportableStatus(r.status)
      ).length;
      const failed = results.length - passed;
      return {
        totalRows: results.length,
        passed,
        failed,
        warnings,
        skipped: 0,
        summary: failed === 0 ? ('all_passed' as const) : ('has_errors' as const),
        results,
      };
    }
  );

  fastify.post(
    '/api/plans/:id/import-commit',
    { preHandler: browserPlanMutationGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const rows = commitRowsFrom(request.body);
      if (typeof rows === 'object' && 'problem' in rows) {
        return reply.code(400).send({ error: rows.problem });
      }

      const planService = opts.interviewPlanService;
      let importResult: { imported: number; skipped: number; interviewIds: string[] };
      try {
        importResult = await planService.importMembers(id, rows.map(toImportMember));
      } catch (e) {
        const failure = importFailure(e);
        return reply.code(failure.status).send({ error: failure.error });
      }

      return {
        imported: importResult.imported,
        skipped: importResult.skipped,
        interviewIds: importResult.interviewIds,
      };
    }
  );
}
