import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2EServer } from './helpers/e2e-server.js';

interface TestContext {
  templateIds: string[];
}

describe('Template Lifecycle (E2E)', () => {
  const ctx: TestContext = { templateIds: [] };
  let server: Awaited<ReturnType<typeof createE2EServer>>;

  beforeAll(async () => {
    server = await createE2EServer();
  });

  beforeEach(() => {
    ctx.templateIds = [];
  });

  afterEach(async () => {
    if (ctx.templateIds.length > 0) {
      await server.testDb.cleanup({ templates: ctx.templateIds });
    }
  });

  afterAll(async () => {
    await server.teardown();
  });

  it('should create a template, retrieve it, update it, and publish it', async () => {
    const prisma = server.prisma;

    // 1. Create template (DRAFT by default)
    const template = await prisma.template.create({
      data: {
        name: 'E2E 模板生命周期测试',
        description: '测试模板完整生命周期',
        content: JSON.stringify({
          name: 'E2E 模板生命周期测试',
          invitationPrompt: '您好，欢迎参与测试访谈！',
          questions: ['问题一：请介绍您的工作经历', '问题二：您最大的成就是什么？'],
          closingMessage: '感谢参与！',
        }),
        status: 'DRAFT',
      },
    });
    ctx.templateIds.push(template.id);
    expect(template.id).toBeDefined();
    expect(template.status).toBe('DRAFT');
    expect(template.name).toBe('E2E 模板生命周期测试');

    // 2. Retrieve template
    const retrieved = await prisma.template.findUnique({ where: { id: template.id } });
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('E2E 模板生命周期测试');
    expect(retrieved?.status).toBe('DRAFT');
    const content = JSON.parse(retrieved?.content || '{}');
    expect(content.questions).toHaveLength(2);

    // 3. List templates — should find our template
    const templates = await prisma.template.findMany();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.id === template.id)).toBe(true);

    // 4. Update template name and description
    const updated = await prisma.template.update({
      where: { id: template.id },
      data: {
        name: 'E2E 模板生命周期测试 (已更新)',
        description: '已更新的模板描述',
      },
    });
    expect(updated.name).toBe('E2E 模板生命周期测试 (已更新)');
    expect(updated.description).toBe('已更新的模板描述');
    expect(updated.status).toBe('DRAFT');

    // 5. Publish template
    const published = await prisma.template.update({
      where: { id: template.id },
      data: { status: 'PUBLISHED' },
    });
    expect(published.status).toBe('PUBLISHED');

    // 6. Verify published status persists
    const verified = await prisma.template.findUnique({ where: { id: template.id } });
    expect(verified?.status).toBe('PUBLISHED');
  });

  it('should archive an existing template', async () => {
    const prisma = server.prisma;

    const template = await prisma.template.create({
      data: {
        name: 'E2E 归档测试模板',
        content: JSON.stringify({
          name: '归档测试',
          invitationPrompt: '欢迎',
          questions: ['问题A', '问题B'],
        }),
        status: 'DRAFT',
      },
    });
    ctx.templateIds.push(template.id);

    await prisma.template.update({
      where: { id: template.id },
      data: { status: 'PUBLISHED' },
    });

    const archived = await prisma.template.update({
      where: { id: template.id },
      data: { status: 'ARCHIVED' },
    });
    expect(archived.status).toBe('ARCHIVED');
  });

  it('should create a template with multiple questions', async () => {
    const prisma = server.prisma;

    const template = await prisma.template.create({
      data: {
        name: 'E2E 多问题模板',
        content: JSON.stringify({
          name: '多问题模板',
          invitationPrompt: '欢迎参加多问题访谈',
          questions: [
            '问题1：请自我介绍',
            '问题2：谈谈您的工作经历',
            '问题3：您未来的计划是什么？',
            '问题4：您有什么建议？',
            '问题5：其他补充',
          ],
          closingMessage: '访谈到此结束，感谢您的参与！',
          dimensions: [
            { id: 'work', label: '工作经历', keywords: ['工作', '经历'] },
            { id: 'future', label: '未来规划', keywords: ['计划', '未来'] },
          ],
        }),
        status: 'DRAFT',
      },
    });
    ctx.templateIds.push(template.id);

    const retrieved = await prisma.template.findUnique({ where: { id: template.id } });
    const content = JSON.parse(retrieved?.content || '{}');
    expect(content.questions).toHaveLength(5);
    expect(content.dimensions).toHaveLength(2);
    expect(content.closingMessage).toBe('访谈到此结束，感谢您的参与！');
  });
});
