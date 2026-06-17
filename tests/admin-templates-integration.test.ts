import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyFormbody from '@fastify/formbody';
import fastifyView from '@fastify/view';
/**
 * @intent Integration tests for admin template CRUD — save → load → render flow
 * @covers admin-templates.ts: buildContentFromForm, validateTemplateContent, POST, PUT, GET edit
 */
import type { Template, TemplateStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Shared mock state — mutated in beforeEach, accessed by the mocked PrismaClient
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

// Import AFTER vi.mock so the mocked PrismaClient is used
const { adminTemplatesRoutes } = await import('../src/api/admin-templates.js');

describe('Admin Templates Integration — save → load → render', () => {
  let app: FastifyInstance;

  function seedTemplate(name: string, questions: string[], version = 1): Template {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const template: Template = {
      id,
      name,
      description: '',
      content: JSON.stringify({ invitationPrompt: 'hello', questions }),
      version,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
      createdBy: 'admin',
      updatedBy: 'admin',
      dimensions: null,
      analysisConfig: null,
    };
    mockStore.set(id, template);
    return template;
  }

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  });

  afterAll(() => {
    process.env.ADMIN_API_KEY = undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = new Map();

    mockTemplateCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
      const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date();
      const template: Template = {
        id,
        name: String(args.data.name),
        description: args.data.description as string | null,
        content: args.data.content as string,
        version: args.data.version as number,
        status: args.data.status as TemplateStatus,
        createdAt: now,
        updatedAt: now,
        createdBy: args.data.createdBy as string,
        updatedBy: args.data.updatedBy as string,
        dimensions: null,
        analysisConfig: null,
      };
      mockStore.set(id, template);
      return Promise.resolve(template);
    });

    mockTemplateFindUnique.mockImplementation(
      (args: { where: { id: string; version?: number } }) => {
        const id = args.where.id;
        const tpl = mockStore.get(id);
        if (!tpl) return Promise.resolve(null);
        if (args.where.version !== undefined && tpl.version !== args.where.version) {
          return Promise.resolve(null);
        }
        return Promise.resolve(tpl);
      }
    );

    mockTemplateFindMany.mockImplementation(() => Promise.resolve(Array.from(mockStore.values())));

    mockTemplateUpdate.mockImplementation(
      (args: { where: { id: string; version?: number }; data: Record<string, unknown> }) => {
        const id = args.where.id;
        const tpl = mockStore.get(id);
        if (!tpl) return Promise.reject(new Error('Record not found'));
        if (args.where.version !== undefined && tpl.version !== args.where.version) {
          return Promise.reject(new Error('Record not found: version mismatch'));
        }
        const now = new Date();
        const updated: Template = {
          ...tpl,
          name: (args.data.name as string) ?? tpl.name,
          description: (args.data.description as string | null) ?? tpl.description,
          content: (args.data.content as string) ?? tpl.content,
          version: tpl.version + 1,
          status: (args.data.status as TemplateStatus) ?? tpl.status,
          updatedAt: now,
          updatedBy: (args.data.updatedBy as string) ?? tpl.updatedBy,
        };
        mockStore.set(id, updated);
        return Promise.resolve(updated);
      }
    );

    mockTemplateDelete.mockImplementation((args: { where: { id: string } }) => {
      mockStore.delete(args.where.id);
      return Promise.resolve({});
    });

    mockTemplateCount.mockImplementation(() => Promise.resolve(mockStore.size));
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function createApp() {
    app = Fastify();
    app.register(fastifyFormbody);
    await app.register(fastifyView, {
      engine: { nunjucks },
      templates: viewsDir,
      options: { autoescape: true, noCache: true },
    });
    const { PrismaClient } = await import('@prisma/client');
    const { TemplateRepository } = await import('../src/repositories/template.repository.js');
    const { InterviewRepository } = await import('../src/repositories/interview.repository.js');
    const { AnalysisService } = await import('../src/services/analysis.service.js');
    const { AnalyticsService } = await import('../src/services/analytics.service.js');
    const { InterviewPlanService } = await import('../src/services/interview-plan.service.js');
    const prisma = new PrismaClient();
    await app.register(adminTemplatesRoutes, {
      templateRepo: new TemplateRepository(prisma),
      interviewPlanService: new InterviewPlanService(prisma),
      interviewRepo: new InterviewRepository(prisma),
      analysisService: new AnalysisService(prisma),
      analyticsService: new AnalyticsService(prisma),
    });
    await app.ready();
  }

  function authHeader() {
    return { 'x-admin-key': ADMIN_KEY };
  }

  function formPayload(params: Record<string, string>) {
    return new URLSearchParams(params).toString();
  }

  // --- Test 1: Create template with 12 questions, verify content stored ---
  it('should create template with 12 questions and persist all questions', async () => {
    await createApp();

    const params: Record<string, string> = {
      name: '盖洛普Q12',
      description: '员工敬业度调查',
      invitationPrompt: '你好，我是AI访谈师',
      closingMessage: '感谢分享',
    };
    for (let i = 0; i < 12; i++) {
      params[`questions[${i}][text]`] = `Q${i + 1} 测试问题 ${i + 1}`;
    }

    const resp = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload(params),
    });

    expect(resp.statusCode).toBe(201);
    expect(resp.headers['hx-redirect']).toBe('/admin');

    const created = mockTemplateCreate.mock.calls[0][0];
    const content = JSON.parse(created.data.content);
    expect(content.questions).toHaveLength(12);
    expect(content.questions[0]).toBe('Q1 测试问题 1');
    expect(content.questions[11]).toBe('Q12 测试问题 12');
    expect(content.invitationPrompt).toBe('你好，我是AI访谈师');
  });

  // --- Test 2: Create template with empty questions → validation error ---
  it('should reject template with no questions', async () => {
    await createApp();

    const resp = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload({ name: 'Empty', invitationPrompt: 'hello' }),
    });

    expect(resp.statusCode).toBe(422);
    expect(resp.body).toContain('请至少添加一个问题');
  });

  // --- Test 3: Update template with new questions → verify persisted ---
  it('should update template questions and persist to store', async () => {
    await createApp();
    const tpl = seedTemplate('旧模板', ['旧问题1'], 1);

    const params: Record<string, string> = {
      name: '新模板',
      invitationPrompt: '新的邀约提示',
      version: '1',
    };
    for (let i = 0; i < 5; i++) {
      params[`questions[${i}][text]`] = `新问题 ${i + 1}`;
    }

    const resp = await app.inject({
      method: 'PUT',
      url: `/admin/api/templates/${tpl.id}?version=1`,
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload(params),
    });

    expect(resp.statusCode).toBe(200);

    const updated = mockStore.get(tpl.id);
    expect(updated).toBeDefined();
    const content = JSON.parse((updated as Template).content);
    expect(content.questions).toHaveLength(5);
    expect(content.questions[0]).toBe('新问题 1');
    expect(content.questions[4]).toBe('新问题 5');
    expect((updated as Template).version).toBe(2);
  });

  // --- Test 4: Version conflict → 409 ---
  it('should return 409 when version mismatch on update', async () => {
    await createApp();
    const tpl = seedTemplate('版本冲突', ['问题1'], 3);

    const resp = await app.inject({
      method: 'PUT',
      url: `/admin/api/templates/${tpl.id}?version=1`,
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload({
        name: '冲突',
        invitationPrompt: 'hello',
        version: '1',
        'questions[0][text]': 'Q1',
      }),
    });

    expect(resp.statusCode).toBe(409);
    expect(resp.body).toContain('模板已被他人修改');
  });

  // --- Test 5: GET edit page → loads questions correctly ---
  it('should load existing questions on edit page render', async () => {
    await createApp();
    const tpl = seedTemplate('加载测试', ['Q1 问题一', 'Q2 问题二', 'Q3 问题三'], 1);

    const resp = await app.inject({
      method: 'GET',
      url: `/admin/content/templates/${tpl.id}/edit`,
      headers: authHeader(),
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.body).toContain('&quot;Q1 问题一&quot;');
    expect(resp.body).toContain('&quot;Q2 问题二&quot;');
    expect(resp.body).toContain('&quot;Q3 问题三&quot;');
    expect(resp.body).toContain('order: 0');
    expect(resp.body).toContain("uid: 'uid_0'");
  });

  // --- Test 6: Full round-trip — create → edit load → update → re-load ---
  it('should persist questions through full create → edit → update → reload cycle', async () => {
    await createApp();

    // Step 1: Create
    const createResp = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload({
        name: '轮转测试',
        invitationPrompt: '邀请提示',
        'questions[0][text]': '初始问题 A',
        'questions[1][text]': '初始问题 B',
      }),
    });
    expect(createResp.statusCode).toBe(201);

    const createdTemplate = await mockTemplateCreate.mock.results[0].value;
    const tplId = createdTemplate.id;

    // Step 2: Load edit page — verify initial questions
    const loadResp = await app.inject({
      method: 'GET',
      url: `/admin/content/templates/${tplId}/edit`,
      headers: authHeader(),
    });
    expect(loadResp.statusCode).toBe(200);
    expect(loadResp.body).toContain('初始问题 A');
    expect(loadResp.body).toContain('初始问题 B');

    // Step 3: Update with new questions
    const updateResp = await app.inject({
      method: 'PUT',
      url: `/admin/api/templates/${tplId}?version=1`,
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload({
        name: '轮转测试 v2',
        invitationPrompt: '新提示',
        version: '1',
        'questions[0][text]': '更新问题 1',
        'questions[1][text]': '更新问题 2',
        'questions[2][text]': '新增问题 3',
      }),
    });
    expect(updateResp.statusCode).toBe(200);

    // Step 4: Reload edit page — verify updated questions
    const reloadResp = await app.inject({
      method: 'GET',
      url: `/admin/content/templates/${tplId}/edit`,
      headers: authHeader(),
    });
    expect(reloadResp.statusCode).toBe(200);
    expect(reloadResp.body).toContain('更新问题 1');
    expect(reloadResp.body).toContain('更新问题 2');
    expect(reloadResp.body).toContain('新增问题 3');
    expect(reloadResp.body).not.toContain('初始问题 A');
    expect(reloadResp.body).not.toContain('初始问题 B');
  });

  // --- Test 7: Questions with special characters → survive round-trip ---
  // --- Test 8: Create template with closingMessage and llmPromptTemplate → stored correctly ---
  it('should store closingMessage and llmPromptTemplate on create', async () => {
    await createApp();

    const params: Record<string, string> = {
      name: '完整模板',
      invitationPrompt: '邀约提示',
      'questions[0][text]': '测试问题',
      closingMessage: '感谢您接受本次访谈，祝您工作顺利！',
      llmPromptTemplate: '你是AI主持人，基于以下信息进行追问：\n对话：{{ conversationHistory }}\n问题：{{ currentQuestion }}',
    };

    const resp = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload(params),
    });

    expect(resp.statusCode).toBe(201);

    const created = mockTemplateCreate.mock.calls[0][0];
    const content = JSON.parse(created.data.content);
    expect(content.closingMessage).toBe('感谢您接受本次访谈，祝您工作顺利！');
    expect(content.llmPromptTemplate).toContain('{{ conversationHistory }}');
    expect(content.llmPromptTemplate).toContain('{{ currentQuestion }}');
  });

  // --- Test 9: Edit page renders closingMessage and llmPromptTemplate values ---
  it('should load closingMessage and llmPromptTemplate from stored content on edit page', async () => {
    await createApp();
    const content = JSON.stringify({
      invitationPrompt: '邀约',
      questions: ['Q1'],
      closingMessage: '谢谢参与',
      llmPromptTemplate: '自定义prompt模板内容',
    });
    const tpl = seedTemplate('字段渲染测试', ['Q1'], 1);
    const stored = mockStore.get(tpl.id) as Template;
    mockStore.set(tpl.id, { ...stored, content });

    const resp = await app.inject({
      method: 'GET',
      url: `/admin/content/templates/${tpl.id}/edit`,
      headers: authHeader(),
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.body).toContain('谢谢参与');
    expect(resp.body).toContain('自定义prompt模板内容');
  });

  it('should preserve special characters (quotes, newlines, CJK) through save → load', async () => {
    await createApp();

    const specialQ = 'Q1: "包含引号" 的问题\n换行测试';
    const resp = await app.inject({
      method: 'POST',
      url: '/admin/api/templates',
      headers: { ...authHeader(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: formPayload({
        name: '特殊字符测试',
        invitationPrompt: 'hello',
        'questions[0][text]': specialQ,
      }),
    });
    expect(resp.statusCode).toBe(201);

    const createdTemplate = await mockTemplateCreate.mock.results[0].value;
    const tplId = createdTemplate.id;

    const loadResp = await app.inject({
      method: 'GET',
      url: `/admin/content/templates/${tplId}/edit`,
      headers: authHeader(),
    });
    expect(loadResp.statusCode).toBe(200);
    expect(loadResp.body).toContain('包含引号');
  });
});
