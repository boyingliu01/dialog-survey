import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyFormbody from '@fastify/formbody';
import fastifyView from '@fastify/view';
import type { Template, TemplateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewRepository } from '../src/repositories/interview.repository.js';
import type { AnalysisService } from '../src/services/analysis.service.js';
import type { AnalyticsService } from '../src/services/analytics.service.js';
import type { InterviewPlanService } from '../src/services/interview-plan.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const viewsDir = resolve(__dirname, '../src/views');

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

const ADMIN_KEY = 'test-admin-key';

let mockStore: Map<string, Template>;
const mockTemplateCreate = vi.fn();
const mockTemplateFindUnique = vi.fn();
const mockTemplateFindMany = vi.fn();
const mockTemplateUpdate = vi.fn();
const mockTemplateDelete = vi.fn();
const mockTemplateCount = vi.fn();
const mockInterviewPlanFindMany = vi.fn(() => Promise.resolve([]));
const mockInterviewPlanGroupBy = vi.fn(() => Promise.resolve([]));
const mockInterviewFindMany = vi.fn(() => Promise.resolve([]));
const mockInterviewGroupBy = vi.fn(() => Promise.resolve([]));
const mockAnalysisReportFindMany = vi.fn(() => Promise.resolve([]));
const mockAnalysisReportFindFirst = vi.fn(() => Promise.resolve(null));
const mockBatchReportCount = vi.fn(() => Promise.resolve(0));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    template = {
      get create() {
        return mockTemplateCreate;
      },
      get findUnique() {
        return mockTemplateFindUnique;
      },
      get findMany() {
        return mockTemplateFindMany;
      },
      get update() {
        return mockTemplateUpdate;
      },
      get delete() {
        return mockTemplateDelete;
      },
      get count() {
        return mockTemplateCount;
      },
    };
    interviewPlan = {
      get findMany() {
        return mockInterviewPlanFindMany;
      },
      get groupBy() {
        return mockInterviewPlanGroupBy;
      },
    };
    interview = {
      get findMany() {
        return mockInterviewFindMany;
      },
      get groupBy() {
        return mockInterviewGroupBy;
      },
    };
    analysisReport = {
      get findMany() {
        return mockAnalysisReportFindMany;
      },
      get findFirst() {
        return mockAnalysisReportFindFirst;
      },
    };
    batchAnalysisReport = {
      get count() {
        return mockBatchReportCount;
      },
    };
    $disconnect = vi.fn(() => Promise.resolve());
    $connect = vi.fn(() => Promise.resolve());
  },
  TemplateStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' },
}));

const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');
const { TemplateRepository } = await import('../src/repositories/template.repository.js');

describe('Admin Templates Import', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env['ADMIN_API_KEY'] = ADMIN_KEY;
  });

  afterAll(() => {
    process.env['ADMIN_API_KEY'] = undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = new Map();

    mockTemplateCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
      const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date();
      const template: Template = {
        id,
        name: String(args.data['name']),
        description: args.data['description'] as string | null,
        content: args.data['content'] as string,
        version: args.data['version'] as number,
        status: args.data['status'] as TemplateStatus,
        createdAt: now,
        updatedAt: now,
        createdBy: args.data['createdBy'] as string,
        updatedBy: args.data['updatedBy'] as string,
        dimensions: null,
        analysisConfig: null,
      };
      mockStore.set(id, template);
      return Promise.resolve(template);
    });

    mockTemplateFindMany.mockImplementation(() => Promise.resolve(Array.from(mockStore.values())));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(fastifyFormbody);
    await app.register(fastifyView, {
      engine: { nunjucks },
      templates: viewsDir,
      options: { autoescape: true, noCache: true },
    });
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await app.register(adminTemplatesRoutes, {
      templateRepo: new TemplateRepository(prisma),
      interviewPlanService: {} as unknown as InterviewPlanService,
      interviewRepo: {} as unknown as InterviewRepository,
      analysisService: {} as unknown as AnalysisService,
      analyticsService: {} as unknown as AnalyticsService,
      prisma,
    });
    await app.ready();
    return app;
  }

  describe('POST /admin/api/templates/import', () => {
    it('should import valid JSON template', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        name: '导入的模板',
        description: '测试描述',
        content: {
          invitationPrompt: '你好',
          questions: ['问题1', '问题2'],
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(201);
      expect(mockTemplateCreate).toHaveBeenCalledTimes(1);
      const createArg = mockTemplateCreate.mock.calls[0][0];
      expect(createArg.data.name).toBe('导入的模板');
      expect(createArg.data.description).toBe('测试描述');
    });

    it('should return 422 when JSON is empty', async () => {
      app = await buildApp();
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: '' },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('请粘贴模板 JSON 内容');
    });

    it('should return 422 when JSON is invalid', async () => {
      app = await buildApp();
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: '{invalid json' },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('JSON 格式错误');
    });

    it('should return 422 when name is missing', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        content: { invitationPrompt: 'hi', questions: ['q1'] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('缺少 name 字段');
    });

    it('should return 422 when content is missing', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({ name: 'test' });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('缺少 content 字段');
    });

    it('should return 422 when questions array is empty', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        name: 'test',
        content: { invitationPrompt: 'hi', questions: [] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('至少添加一个问题');
    });

    it('should return 422 when invitationPrompt is empty', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        name: 'test',
        content: { invitationPrompt: '', questions: ['q1'] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('请填写邀约提示词');
    });

    it('should import template with dimensions', async () => {
      app = await buildApp();
      await app.ready();

      const dimensions = [
        { id: 'dim1', label: '维度一', keywords: ['关键词1', '关键词2'] },
        { id: 'dim2', label: '维度二', keywords: ['关键词3'] },
      ];

      const jsonPayload = JSON.stringify({
        name: '含维度的模板',
        description: '测试维度导入',
        content: {
          invitationPrompt: '你好',
          questions: ['问题1', '问题2'],
        },
        dimensions,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(201);
      expect(mockTemplateCreate).toHaveBeenCalledTimes(1);
      const createArg = mockTemplateCreate.mock.calls[0][0];
      expect(createArg.data.name).toBe('含维度的模板');
    });

    it('should import template with closingMessage and llmPromptTemplate', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        name: '完整模板',
        content: {
          invitationPrompt: '欢迎参加访谈',
          questions: ['问题A', '问题B', '问题C'],
          closingMessage: '感谢您的参与',
          llmPromptTemplate: '你是一个访谈主持人...',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        headers: { 'x-admin-key': ADMIN_KEY },
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(201);
      expect(mockTemplateCreate).toHaveBeenCalledTimes(1);
      const createArg = mockTemplateCreate.mock.calls[0][0];
      const savedContent = JSON.parse(createArg.data.content) as Record<string, unknown>;
      expect(savedContent['closingMessage']).toBe('感谢您的参与');
      expect(savedContent['llmPromptTemplate']).toBe('你是一个访谈主持人...');
    });

    it('should return 401 without admin key', async () => {
      app = await buildApp();
      await app.ready();

      const jsonPayload = JSON.stringify({
        name: 'test',
        content: { invitationPrompt: 'hi', questions: ['q1'] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/admin/api/templates/import',
        payload: { json: jsonPayload },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
