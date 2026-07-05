import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock DingTalk client — phone lookup returns controlled results without real API calls
const MockDingTalkClient = class {
  static fromEnv() {
    return new MockDingTalkClient();
  }
  async getUserIdByMobile(phone: string) {
    if (phone === '13800138000') return { found: true, userId: 'user_zhangsan', name: '' };
    if (phone === '13900139000') return { found: true, userId: 'user_lisi', name: '' };
    return { found: false };
  }
  async getUserByUserId(userId: string) {
    if (userId === 'user_zhangsan')
      return { userid: 'user_zhangsan', name: '张三', mobile: '13800138000' };
    if (userId === 'user_lisi') return { userid: 'user_lisi', name: '李四', mobile: '13900139000' };
    throw new Error('user not found');
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

const prisma = new PrismaClient();

function makeCsv(header: string, ...rows: string[]): string {
  return [header, ...rows].join('\n');
}

const VALID_CSV = makeCsv('phone,name', '13800138000,张三', '13900139000,李四');

const NAME_MISMATCH_CSV = makeCsv('phone,name', '13800138000,NotZhangSan');

const PHONE_NOT_FOUND_CSV = makeCsv('phone,name', '00000000000,NotFound');

const CHINESE_HEADER_CSV = makeCsv('手机号,姓名', '13800138000,张三');

const NO_PHONE_COLUMN_CSV = makeCsv('name,age', '张三,30');

describe('Batch Import API', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv('ADMIN_API_KEY', 'test-admin-key');
    const { interviewPlanRoutes } = await import('../src/api/plans.js');
    const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
    fastify = Fastify({ logger: false });
    await fastify.register((await import('@fastify/multipart')).default, {
      limits: { fileSize: 1 * 1024 * 1024, parts: 1 },
    });
    await interviewPlanRoutes(fastify, {
      interviewPlanService: new InterviewPlanService(prisma),
      prisma,
    });
    await fastify.ready();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await fastify.close();
    await prisma.$disconnect();
  });

  describe('POST /api/plans/:id/import-preview', () => {
    it('should verify all rows and return passed', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-Preview Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Batch Preview Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const formData = new FormData();
        formData.append('file', new Blob([VALID_CSV], { type: 'text/csv' }), 'test.csv');

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-preview`,
          headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
          body: formData,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.totalRows).toBe(2);
        expect(body.passed).toBe(2);
        expect(body.failed).toBe(0);
        expect(body.summary).toBe('all_passed');
        expect(body.results[0].status).toBe('ok');
        expect(body.results[0].userId).toBe('user_zhangsan');
        expect(body.results[0].dingtalkName).toBe('张三');
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should detect name mismatch', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-Mismatch Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Mismatch Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const formData = new FormData();
        formData.append('file', new Blob([NAME_MISMATCH_CSV], { type: 'text/csv' }), 'test.csv');

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-preview`,
          headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
          body: formData,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.summary).toBe('has_errors');
        expect(body.results[0].status).toBe('name_mismatch');
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should detect phone not found', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-NotFound Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'NotFound Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const formData = new FormData();
        formData.append('file', new Blob([PHONE_NOT_FOUND_CSV], { type: 'text/csv' }), 'test.csv');

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-preview`,
          headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
          body: formData,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.results[0].status).toBe('phone_not_found');
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should support Chinese column headers', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-ChineseHeader Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Chinese Header Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const formData = new FormData();
        formData.append('file', new Blob([CHINESE_HEADER_CSV], { type: 'text/csv' }), 'test.csv');

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-preview`,
          headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
          body: formData,
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.passed).toBe(1);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should reject CSV with no phone column', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-NoPhone Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'NoPhone Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const formData = new FormData();
        formData.append('file', new Blob([NO_PHONE_COLUMN_CSV], { type: 'text/csv' }), 'test.csv');

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-preview`,
          headers: { 'x-admin-key': 'test-admin-key', 'content-type': 'multipart/form-data' },
          body: formData,
        });

        expect(res.statusCode).toBe(400);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should require admin auth', async () => {
      const formData = new FormData();
      formData.append('file', new Blob([VALID_CSV], { type: 'text/csv' }), 'test.csv');

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/plans/00000000-0000-0000-0000-000000000000/import-preview',
        headers: { 'content-type': 'multipart/form-data' },
        body: formData,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/plans/:id/import-commit', () => {
    it('should commit verified rows and create interviews', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-Commit Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Commit Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const rows = [
          {
            rowIndex: 2,
            phone: '13800138000',
            status: 'ok',
            userId: 'user_zhangsan',
            dingtalkName: '张三',
            message: '验证通过',
          },
          {
            rowIndex: 3,
            phone: '13900139000',
            status: 'ok',
            userId: 'user_lisi',
            dingtalkName: '李四',
            message: '验证通过',
          },
        ];

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.imported).toBe(2);
        expect(body.skipped).toBe(0);
        expect(body.interviewIds.length).toBe(2);

        // Verify DB state
        const interviews = await prisma.interview.findMany({ where: { planId } });
        expect(interviews.length).toBe(2);
        expect(interviews[0].status).toBe('PENDING');

        // Verify inviteeData
        const plan = await prisma.interviewPlan.findUnique({ where: { id: planId } });
        const invitees = plan?.inviteeData as Array<{ userId: string; name: string }> | undefined;
        expect(invitees?.length).toBe(2);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should skip duplicate userIds in same plan (idempotent)', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-Idempotent Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Idempotent Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const rows = [
          {
            rowIndex: 2,
            phone: '13800138000',
            status: 'ok',
            userId: 'user_zhangsan',
            dingtalkName: '张三',
            message: '验证通过',
          },
        ];

        // First commit
        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows },
        });
        expect(res1.statusCode).toBe(200);
        expect(JSON.parse(res1.body).imported).toBe(1);

        // Second commit — same user → skip
        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows },
        });
        expect(res2.statusCode).toBe(200);
        const body2 = JSON.parse(res2.body);
        expect(body2.imported).toBe(0);
        expect(body2.skipped).toBe(1);
        expect(body2.interviewIds.length).toBe(0);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should reject commit with non-ok rows', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-BadRows Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'BadRows Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        const rows = [
          {
            rowIndex: 2,
            phone: '13800138000',
            status: 'ok',
            userId: 'user_zhangsan',
            dingtalkName: '张三',
            message: '验证通过',
          },
          {
            rowIndex: 3,
            phone: '000',
            status: 'name_mismatch',
            userId: 'bad',
            dingtalkName: 'Nope',
            message: 'err',
          },
        ];

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows },
        });

        expect(res.statusCode).toBe(400);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });

    it('should report cross-plan conflict', async () => {
      let template1Id: string | undefined;
      let template2Id: string | undefined;
      let plan1Id: string | undefined;
      let plan2Id: string | undefined;
      try {
        const template1 = await prisma.template.create({
          data: { name: 'Batch-CrossPlan1 Template', content: '{}', status: 'DRAFT' },
        });
        template1Id = template1.id;
        const create1Res = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'CrossPlan1', templateId: template1.id },
        });
        plan1Id = JSON.parse(create1Res.body).id;

        // Add user to plan 1
        const res1 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan1Id}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                phone: '13800138000',
                status: 'ok',
                userId: 'user_zhangsan',
                dingtalkName: '张三',
                message: '验证通过',
              },
            ],
          },
        });
        expect(res1.statusCode).toBe(200);

        // Create plan 2 and try to import same user
        const template2 = await prisma.template.create({
          data: { name: 'Batch-CrossPlan2 Template', content: '{}', status: 'DRAFT' },
        });
        template2Id = template2.id;
        const create2Res = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'CrossPlan2', templateId: template2.id },
        });
        plan2Id = JSON.parse(create2Res.body).id;

        const res2 = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${plan2Id}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: {
            rows: [
              {
                rowIndex: 2,
                phone: '13800138000',
                status: 'ok',
                userId: 'user_zhangsan',
                dingtalkName: '张三',
                message: '验证通过',
              },
            ],
          },
        });

        expect(res2.statusCode).toBe(409);
      } finally {
        if (plan2Id) {
          await prisma.interview.deleteMany({ where: { planId: plan2Id } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: plan2Id } }).catch(() => {});
        }
        if (template2Id)
          await prisma.template.delete({ where: { id: template2Id } }).catch(() => {});
        if (plan1Id) {
          await prisma.interview.deleteMany({ where: { planId: plan1Id } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: plan1Id } }).catch(() => {});
        }
        if (template1Id)
          await prisma.template.delete({ where: { id: template1Id } }).catch(() => {});
      }
    });

    it('should reject plan not in PENDING/READY status', async () => {
      let templateId: string | undefined;
      let planId: string | undefined;
      try {
        const template = await prisma.template.create({
          data: { name: 'Batch-Status Template', content: '{}', status: 'DRAFT' },
        });
        templateId = template.id;
        const createRes = await fastify.inject({
          method: 'POST',
          url: '/api/plans',
          payload: { name: 'Status Plan', templateId: template.id },
        });
        planId = JSON.parse(createRes.body).id;

        // Cancel the plan
        await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/cancel`,
        });

        const rows = [
          {
            rowIndex: 2,
            phone: '13800138000',
            status: 'ok',
            userId: 'user_zhangsan',
            dingtalkName: '张三',
            message: '验证通过',
          },
        ];

        const res = await fastify.inject({
          method: 'POST',
          url: `/api/plans/${planId}/import-commit`,
          headers: { 'x-admin-key': 'test-admin-key' },
          payload: { rows },
        });

        expect(res.statusCode).toBe(400);
      } finally {
        if (planId) {
          await prisma.interview.deleteMany({ where: { planId } }).catch(() => {});
          await prisma.interviewPlan.delete({ where: { id: planId } }).catch(() => {});
        }
        if (templateId) await prisma.template.delete({ where: { id: templateId } }).catch(() => {});
      }
    });
  });
});
