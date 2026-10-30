import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { InterviewPlanRepository } from '../src/repositories/interview-plan.repository.js';
import type { PrismaClient } from '../src/utils/prisma-client.js';
import { registerTestAdminAuth } from './helpers/admin-auth.js';
import { getSharedTestPrisma } from './helpers/create-test-prisma.js';

// Mock DingTalk client — phone lookup returns controlled results without real API calls.
// The userIds are file-unique: every test file shares one database and runs in
// parallel, and import-commit rejects a userId that has a live interview in any
// other plan — a shared id would make these assertions depend on other files.
const MockDingTalkClient = class {
  static fromEnv() {
    return new MockDingTalkClient();
  }
  // Mirrors the real client since issue #199: getUserIdByMobile resolves the
  // name itself (via user/get) instead of returning ''. A mock that returns ''
  // here no longer describes the client the import path actually talks to.
  async getUserIdByMobile(phone: string) {
    if (phone === '13800138000')
      return { found: true, userId: 'batch-user-zhangsan', name: '张三' };
    if (phone === '13900139000') return { found: true, userId: 'batch-user-lisi', name: '李四' };
    return { found: false };
  }
  async getUserByUserId(userId: string) {
    if (userId === 'batch-user-zhangsan')
      return { userid: 'batch-user-zhangsan', name: '张三', mobile: '13800138000' };
    if (userId === 'batch-user-lisi')
      return { userid: 'batch-user-lisi', name: '李四', mobile: '13900139000' };
    // Issue #219: a userId-mode row is imported on the userId alone, so the name
    // lookup is only a check. "user not found" is the one lookup failure that
    // invalidates the row; quota/permission/network failures downgrade it.
    if (userId === 'batch-user-quota')
      throw new Error('DingTalk user/get failed: SENSITIVE_PARAM_CUMULATIVE_EXCEEDED');
    // Real message shape from src/integrations/dingtalk/client.ts:
    //   DingTalk user/get failed: <errmsg> (errcode: <n>)
    if (userId === 'batch-user-err60121')
      throw new Error('DingTalk user/get failed: user not found (errcode: 60121)');
    if (userId === 'batch-user-err60111')
      throw new Error('DingTalk user/get failed: 用户不存在 (errcode: 60111)');
    if (userId === 'batch-user-err90018')
      throw new Error('DingTalk user/get failed: 请求过于频繁 (errcode: 90018)');
    throw new Error('DingTalk user/get failed: user not found');
  }
};

vi.mock('../src/integrations/dingtalk/client.js', () => ({
  DingTalkClient: MockDingTalkClient,
}));

vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
  messageSender: {
    sendTextMessage: vi
      .fn()
      .mockResolvedValue({ taskId: 'mock-task', successCount: 1, failedUserIds: [] }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await getSharedTestPrisma();
});

describe('Batch Import — userId mode (issue #219)', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
    const { interviewPlanRoutes } = await import('../src/api/plans.js');
    const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
    fastify = Fastify({ logger: false });
    await registerTestAdminAuth(fastify, 'test-admin-key');
    await fastify.register((await import('@fastify/multipart')).default, {
      limits: { fileSize: 1 * 1024 * 1024, parts: 1 },
    });
    await interviewPlanRoutes(fastify, {
      interviewPlanService: new InterviewPlanService(prisma),
      interviewPlanRepo: new InterviewPlanRepository(prisma),
    });
    await fastify.ready();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (fastify) await fastify.close();
  });

  /** Create a throwaway plan plus its cleanup callback. */
  async function createPlan(
    name: string
  ): Promise<{ planId: string; cleanup: () => Promise<void> }> {
    const template = await prisma.template.create({
      data: { name: `${name} Template`, content: '{}', status: 'DRAFT' },
    });
    const createRes = await fastify.inject({
      method: 'POST',
      url: '/api/plans',
      payload: { name, templateId: template.id },
    });
    const planId = JSON.parse(createRes.body).id as string;
    return {
      planId,
      cleanup: async () => {
        await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
        await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        await prisma.template.delete({ where: { id: template.id } }).catch(() => {});
      },
    };
  }

  /** The subset of the preview response these tests assert on. */
  interface PreviewRow {
    status: string;
    userId?: string;
    dingtalkName?: string;
    message?: string;
    phone?: string;
  }
  interface PreviewBody {
    totalRows?: number;
    passed?: number;
    failed?: number;
    warnings?: number;
    summary?: string;
    results?: PreviewRow[];
    error?: string;
  }

  async function preview(
    planId: string,
    content: string,
    filename = 'list.csv',
    type = 'text/csv'
  ): Promise<{ statusCode: number; body: PreviewBody }> {
    const formData = new FormData();
    formData.append('file', new Blob([content], { type }), filename);
    const res = await fastify.inject({
      method: 'POST',
      url: `/api/plans/${planId}/import-preview`,
      headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
      body: formData,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) as PreviewBody };
  }

  describe('CSV parsing (REQ-USERID-001)', () => {
    /**
     * @test REQ-USERID-001
     * @intent a userId+姓名 CSV with no phone column is importable
     * @covers AC-USERID-001-01
     */
    it('AC-USERID-001-01 accepts a userId,姓名 CSV with no phone column', async () => {
      const { planId, cleanup } = await createPlan('UserId Only');
      try {
        const { statusCode, body } = await preview(
          planId,
          'userId,姓名\nbatch-user-zhangsan,张三\nbatch-user-lisi,李四'
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(body.totalRows).toBe(2);
        expect(body.passed).toBe(2);
        expect(results[0].status).toBe('ok');
        expect(results[0].userId).toBe('batch-user-zhangsan');
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-001
     * @intent a row with a blank phone but a userId is kept, not dropped
     * @covers AC-USERID-001-02
     */
    it('AC-USERID-001-02 keeps a row whose phone is blank but userId is present', async () => {
      const { planId, cleanup } = await createPlan('Phone Blank UserId');
      try {
        const { statusCode, body } = await preview(
          planId,
          '手机号,姓名,userId\n,batch-name-placeholder,batch-user-zhangsan'
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        // Previously this row was skipped and the whole request answered 400.
        expect(body.totalRows).toBe(1);
        expect(results[0].userId).toBe('batch-user-zhangsan');
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-001
     * @intent a CSV with neither phone nor userId column is rejected
     * @covers AC-USERID-001-03
     */
    it('AC-USERID-001-03 rejects a CSV with neither phone nor userId column', async () => {
      const { planId, cleanup } = await createPlan('No Identifier Column');
      try {
        const { statusCode, body } = await preview(planId, 'name,age\n张三,30');
        expect(statusCode).toBe(400);
        expect(String(body.error)).toContain('必须包含手机号或 userId 列之一');
      } finally {
        await cleanup();
      }
    });

    it('names the real cause when the file has headers but no usable rows', async () => {
      const { planId, cleanup } = await createPlan('All Rows Missing');
      try {
        // Both identifier columns exist, so this is not a header problem — the
        // error must say the rows are empty rather than blaming the columns.
        const { statusCode, body } = await preview(planId, 'userid,phone,name\n,,\n,,');
        expect(statusCode).toBe(400);
        expect(String(body.error)).toContain('所有行都缺少手机号与 userId');
      } finally {
        await cleanup();
      }
    });

    it('reports partially unusable rows per-row instead of failing the file', async () => {
      const { planId, cleanup } = await createPlan('Partial Missing');
      try {
        const { statusCode, body } = await preview(
          planId,
          '手机号,姓名,userId\n,batch-name-placeholder,batch-user-zhangsan\n张五,52,'
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(body.totalRows).toBe(2);
        expect(results[1].status).toBe('missing_identifier');
        expect(body.failed).toBe(1);
      } finally {
        await cleanup();
      }
    });

    it('accepts the 用户id alias', async () => {
      const { planId, cleanup } = await createPlan('Alias Header');
      try {
        const { statusCode, body } = await preview(planId, '用户id,姓名\nbatch-user-zhangsan,张三');
        expect(statusCode).toBe(200);
        expect((body.results ?? [])[0].userId).toBe('batch-user-zhangsan');
      } finally {
        await cleanup();
      }
    });

    // The admin UI itself labels this field "钉钉 ID" (with a space), so an
    // export built from that label is the most likely header in practice.
    // Header matching strips whitespace/underscore/hyphen to cover every form.
    it.each([['钉钉 ID'], ['钉钉ID'], ['钉钉_id'], ['DingTalk ID'], ['UserId']])(
      'accepts the %s header spelling',
      async (header) => {
        const { planId, cleanup } = await createPlan(`Header ${header}`);
        try {
          const { statusCode, body } = await preview(
            planId,
            `${header},姓名
batch-user-zhangsan,张三`
          );
          expect(statusCode).toBe(200);
          expect((body.results ?? [])[0].userId).toBe('batch-user-zhangsan');
        } finally {
          await cleanup();
        }
      }
    );
  });

  describe('name validation by mode (REQ-USERID-002)', () => {
    /**
     * @test REQ-USERID-002
     * @intent a differing name warns but stays importable
     * @covers AC-USERID-002-01
     */
    it('AC-USERID-002-01 flags a differing name but keeps the row importable', async () => {
      const { planId, cleanup } = await createPlan('Name Differs');
      try {
        const { statusCode, body } = await preview(planId, 'userId,姓名\nbatch-user-zhangsan,王五');
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('name_differs');
        expect(results[0].dingtalkName).toBe('张三');
        // DR-001: a warning, not a failure — still counted as importable.
        expect(body.passed).toBe(1);
        expect(body.warnings).toBe(1);
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-002
     * @intent a quota failure degrades to unverified name and still imports
     * @covers AC-USERID-002-02
     */
    it('AC-USERID-002-02 downgrades a quota failure to name-unverified and still imports', async () => {
      const { planId, cleanup } = await createPlan('Quota Degrade');
      try {
        const { statusCode, body } = await preview(planId, 'userId,姓名\nbatch-user-quota,赵六');
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('ok');
        expect(String(results[0].message)).toContain('姓名未校验');
        expect(body.passed).toBe(1);
      } finally {
        await cleanup();
      }
    });

    // The real client throws `DingTalk user/get failed: <errmsg> (errcode: N)`.
    // Pinning the errcode form guards the not-found vs downgrade split against a
    // message-wording change on DingTalk's side.
    it.each([
      ['batch-user-err60121', 'user_not_found'],
      ['batch-user-err60111', 'user_not_found'],
      // 90018 is rate limiting, not "no such user": the row must still import.
      ['batch-user-err90018', 'ok'],
    ])('classifies %s as %s using the real errcode message shape', async (userId, expected) => {
      const { planId, cleanup } = await createPlan(`Errcode ${userId}`);
      try {
        const { statusCode, body } = await preview(
          planId,
          `userId,姓名
${userId},张三`
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe(expected);
      } finally {
        await cleanup();
      }
    });

    it('warns once when a name check degrades, so quota exhaustion is visible', async () => {
      const { warn } = await import('../src/utils/logger.js');
      const warnMock = vi.mocked(warn);
      warnMock.mockClear();
      const { planId, cleanup } = await createPlan('Warn On Degrade');
      try {
        const { statusCode, body } = await preview(planId, 'userId,姓名\nbatch-user-quota,赵六');
        expect(statusCode).toBe(200);
        expect((body.results ?? [])[0].status).toBe('ok');
        // DR-002 imports anyway, so this log is the only trace of the failure.
        expect(warnMock).toHaveBeenCalledTimes(1);
        expect(String(warnMock.mock.calls[0]?.[1]?.['userId'])).toBe('batch-user-quota');
      } finally {
        await cleanup();
      }
    });

    it('does not warn for a plain successful lookup', async () => {
      const { warn } = await import('../src/utils/logger.js');
      const warnMock = vi.mocked(warn);
      warnMock.mockClear();
      const { planId, cleanup } = await createPlan('No Warn');
      try {
        await preview(planId, 'userId,姓名\nbatch-user-zhangsan,张三');
        expect(warnMock).not.toHaveBeenCalled();
      } finally {
        await cleanup();
      }
    });

    it('marks an unknown userId as user_not_found and not importable', async () => {
      const { planId, cleanup } = await createPlan('Unknown User');
      try {
        const { statusCode, body } = await preview(planId, 'userId,姓名\nnobody-here,张三');
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('user_not_found');
        expect(body.failed).toBe(1);
      } finally {
        await cleanup();
      }
    });

    it('skips the lookup entirely when no name was supplied', async () => {
      const { planId, cleanup } = await createPlan('No Name Given');
      try {
        const { statusCode, body } = await preview(planId, 'userId\nbatch-user-zhangsan');
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('ok');
        expect(String(results[0].message)).toContain('未填写姓名');
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-002
     * @intent phone-mode name mismatch stays a hard failure
     * @covers AC-USERID-002-03
     */
    it('AC-USERID-002-03 keeps phone-mode name mismatches a hard failure', async () => {
      const { planId, cleanup } = await createPlan('Phone Name Mismatch');
      try {
        const { statusCode, body } = await preview(planId, 'phone,name\n13800138000,NotZhangSan');
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('name_mismatch');
        expect(body.failed).toBe(1);
      } finally {
        await cleanup();
      }
    });

    it('reports a repeated userId as duplicate_member, not duplicate_phone', async () => {
      const { planId, cleanup } = await createPlan('Duplicate UserId');
      try {
        const { statusCode, body } = await preview(
          planId,
          'userId,姓名\nbatch-user-zhangsan,张三\nbatch-user-zhangsan,张三'
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[1].status).toBe('duplicate_member');
        expect(body.passed).toBe(1);
      } finally {
        await cleanup();
      }
    });
  });

  describe('preview counts stay self-consistent (REQ-USERID-003)', () => {
    /**
     * @test REQ-USERID-003
     * @intent warnings stays within passed and passed+failed equals totalRows
     * @covers AC-USERID-003-01
     */
    it('AC-USERID-003-01 keeps warnings within passed and passed + failed === totalRows', async () => {
      const { planId, cleanup } = await createPlan('Count Invariants');
      try {
        const { statusCode, body } = await preview(
          planId,
          [
            'userId,姓名',
            'batch-user-zhangsan,张三',
            'batch-user-lisi,错名字',
            'nobody-here,张三',
          ].join('\n')
        );
        expect(statusCode).toBe(200);
        const passed = body.passed as number;
        const failed = body.failed as number;
        const warnings = body.warnings as number;
        const totalRows = body.totalRows as number;
        expect(passed).toBe(2);
        expect(failed).toBe(1);
        expect(warnings).toBe(1);
        expect(warnings).toBeLessThanOrEqual(passed);
        expect(passed + failed).toBe(totalRows);
        expect(body.summary).toBe('has_errors');
      } finally {
        await cleanup();
      }
    });
  });

  describe('commit contract (REQ-USERID-004)', () => {
    /**
     * @test REQ-USERID-004
     * @intent a userId-only row commits with no phone field
     * @covers AC-USERID-004-01
     */
    it('AC-USERID-004-01 imports a userId-only row with no phone field', async () => {
      const { planId, cleanup } = await createPlan('Commit No Phone');
      try {
        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                status: 'ok',
                userId: 'batch-user-zhangsan',
                dingtalkName: '张三',
                message: '验证通过',
              },
            ],
          },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).imported).toBe(1);
        const interviews = await prisma.interview.findMany({ where: { planId } });
        expect(interviews.length).toBe(1);
        expect(interviews[0].userId).toBe('batch-user-zhangsan');
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-004
     * @intent the legacy row shape carrying a phone still commits
     * @covers AC-USERID-004-02
     */
    it('AC-USERID-004-02 still accepts the pre-#219 row shape that carries a phone', async () => {
      const { planId, cleanup } = await createPlan('Commit Legacy Shape');
      try {
        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                phone: '13800138000',
                status: 'ok',
                userId: 'batch-user-zhangsan',
                dingtalkName: '张三',
                message: '验证通过',
              },
            ],
          },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).imported).toBe(1);
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-004
     * @intent a name_differs row commits
     * @covers AC-USERID-004-03
     */
    it('AC-USERID-004-03 imports a name_differs row', async () => {
      const { planId, cleanup } = await createPlan('Commit Name Differs');
      try {
        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                status: 'name_differs',
                userId: 'batch-user-lisi',
                dingtalkName: '李四',
                inputName: '错名字',
                message: '姓名与钉钉不一致（仅提示）',
              },
            ],
          },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).imported).toBe(1);
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-004
     * @intent a non-importable status is rejected at commit
     * @covers AC-USERID-003-02
     */
    it('AC-USERID-003-02 still rejects a non-importable status', async () => {
      const { planId, cleanup } = await createPlan('Commit Rejects');
      try {
        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                status: 'name_mismatch',
                userId: 'batch-user-zhangsan',
                message: 'err',
              },
            ],
          },
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await cleanup();
      }
    });
  });

  describe('JSON import (REQ-USERID-005)', () => {
    /**
     * @test REQ-USERID-005
     * @intent a JSON array of userId+name imports and commits
     * @covers AC-USERID-005-01
     */
    it('AC-USERID-005-01 imports [{userId,name}] and commits it', async () => {
      const { planId, cleanup } = await createPlan('Json Array');
      try {
        const { statusCode, body } = await preview(
          planId,
          JSON.stringify([
            { userId: 'batch-user-zhangsan', name: '张三' },
            { userId: 'batch-user-lisi', name: '李四' },
          ]),
          'list.json',
          'application/json'
        );
        expect(statusCode).toBe(200);
        expect(body.totalRows).toBe(2);
        expect(body.passed).toBe(2);
        const results = body.results ?? [];
        expect(results[0].userId).toBe('batch-user-zhangsan');
        expect(results[1].userId).toBe('batch-user-lisi');

        const commit = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows: body.results },
        });
        expect(commit.statusCode).toBe(200);
        expect(JSON.parse(commit.body).imported).toBe(2);
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-005
     * @intent malformed and non-array JSON are rejected with 400
     * @covers AC-USERID-005-02
     */
    it('AC-USERID-005-02 rejects malformed JSON and non-array JSON', async () => {
      const { planId, cleanup } = await createPlan('Json Bad');
      try {
        const broken = await preview(planId, '[{"userId": ', 'list.json', 'application/json');
        expect(broken.statusCode).toBe(400);
        expect(String(broken.body.error)).toContain('JSON 解析失败');

        const notArray = await preview(
          planId,
          JSON.stringify({ userId: 'batch-user-zhangsan' }),
          'list.json',
          'application/json'
        );
        expect(notArray.statusCode).toBe(400);
        expect(String(notArray.body.error)).toContain('必须为数组');
      } finally {
        await cleanup();
      }
    });

    /**
     * @test REQ-USERID-005
     * @intent elements missing fields become per-row errors, not a 400
     * @covers AC-USERID-005-03
     */
    it('AC-USERID-005-03 treats elements missing fields as per-row errors, not a 400', async () => {
      const { planId, cleanup } = await createPlan('Json Mixed');
      try {
        const { statusCode, body } = await preview(
          planId,
          JSON.stringify([{ userId: 'batch-user-zhangsan', name: '张三' }, { name: '张五' }, null]),
          'list.json',
          'application/json'
        );
        expect(statusCode).toBe(200);
        const results = body.results ?? [];
        expect(results[0].status).toBe('ok');
        expect(results[1].status).toBe('missing_identifier');
        expect(results[2].status).toBe('missing_identifier');
      } finally {
        await cleanup();
      }
    });

    it('accepts the Chinese 用户id / 姓名 keys', async () => {
      const { planId, cleanup } = await createPlan('Json Chinese Keys');
      try {
        const { statusCode, body } = await preview(
          planId,
          JSON.stringify([{ 用户id: 'batch-user-zhangsan', 姓名: '张三' }]),
          'list.json',
          'application/json'
        );
        expect(statusCode).toBe(200);
        expect((body.results ?? [])[0].userId).toBe('batch-user-zhangsan');
      } finally {
        await cleanup();
      }
    });
  });
});
