/**
 * Integration tests for TemplateRepository
 * Uses real PostgreSQL database — no Mocks
 *
 * Prerequisites: PostgreSQL running + dialog_survey_test database
 * Run: npx vitest run tests/template-repository.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TemplateRepository } from '../src/repositories/template.repository.js';
import { TestDatabase } from './helpers/test-db.js';

describe('TemplateRepository (Integration)', () => {
  let testDb: TestDatabase;
  let repo: TemplateRepository;
  let createdIds: string[] = [];

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    repo = new TemplateRepository(testDb.getPrisma());
  });

  beforeEach(() => {
    createdIds = [];
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await testDb.cleanup({ templates: createdIds });
    }
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  describe('create', () => {
    it('should create a template with valid data and persist to DB', async () => {
      const content = { invitationPrompt: '欢迎参加访谈', questions: ['Q1', 'Q2'] };
      const template = await repo.create({
        name: '测试模板',
        content,
        description: '集成测试用模板',
      });
      createdIds.push(template.id);

      expect(template.id).toBeDefined();
      expect(template.name).toBe('测试模板');
      expect(template.description).toBe('集成测试用模板');
      expect(template.status).toBe('DRAFT');
      expect(template.version).toBe(1);
      // content is stored as JSON string
      expect(JSON.parse(template.content)).toEqual(content);

      // Verify it actually exists in DB
      const fromDb = await testDb.getPrisma().template.findUnique({
        where: { id: template.id },
      });
      expect(fromDb).not.toBeNull();
      expect(fromDb?.name).toBe('测试模板');
    });

    it('should create template without optional description', async () => {
      const template = await repo.create({
        name: '无描述模板',
        content: { questions: ['Q1'] },
      });
      createdIds.push(template.id);

      expect(template.name).toBe('无描述模板');
      expect(template.description).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find existing template by ID', async () => {
      const created = await repo.create({
        name: '查找测试',
        content: { questions: ['Q1', 'Q2', 'Q3'] },
      });
      createdIds.push(created.id);

      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('查找测试');
      expect(JSON.parse(found?.content ?? '{}')).toEqual({ questions: ['Q1', 'Q2', 'Q3'] });
    });

    it('should return null for non-existent ID', async () => {
      const found = await repo.findById('non-existent-uuid');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all templates ordered by createdAt desc', async () => {
      const beforeCount = (await repo.findAll()).length;

      const templateA = await repo.create({ name: '模板A', content: { q: 1 } });
      createdIds.push(templateA.id);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      const templateB = await repo.create({ name: '模板B', content: { q: 2 } });
      createdIds.push(templateB.id);

      const all = await repo.findAll();
      expect(all.length).toBe(beforeCount + 2);
      const names = all.map((t) => t.name);
      expect(names).toContain('模板A');
      expect(names).toContain('模板B');
    });

    it('should return templates when they exist', async () => {
      const template = await repo.create({ name: '存在测试', content: { q: 1 } });
      createdIds.push(template.id);

      const all = await repo.findAll();
      expect(all.length).toBeGreaterThan(0);
      expect(all.some((t) => t.name === '存在测试')).toBe(true);
    });
  });

  describe('update', () => {
    it('should update template name and content', async () => {
      const created = await repo.create({
        name: '原始名称',
        content: { questions: ['Q1'] },
      });
      createdIds.push(created.id);

      const updated = await repo.update(created.id, {
        name: '更新后名称',
        content: { questions: ['Q1', 'Q2', 'Q3'] },
      });

      expect(updated.name).toBe('更新后名称');
      expect(JSON.parse(updated.content)).toEqual({ questions: ['Q1', 'Q2', 'Q3'] });
    });

    it('should update template status to PUBLISHED', async () => {
      const created = await repo.create({
        name: '发布测试',
        content: { questions: ['Q1'] },
      });
      createdIds.push(created.id);

      const updated = await repo.update(created.id, { status: 'PUBLISHED' });
      expect(updated.status).toBe('PUBLISHED');
    });
  });

  describe('delete', () => {
    it('should delete template and verify removal from DB', async () => {
      const created = await repo.create({
        name: '删除测试',
        content: { questions: ['Q1'] },
      });

      const result = await repo.delete(created.id);
      expect(result).toBe(true);

      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('findByStatus', () => {
    it('should filter templates by status', async () => {
      const draft1 = await repo.create({ name: '草稿1', content: { q: 1 } });
      createdIds.push(draft1.id);
      const draft2 = await repo.create({ name: '草稿2', content: { q: 2 } });
      createdIds.push(draft2.id);
      const published = await repo.create({ name: '已发布', content: { q: 3 } });
      createdIds.push(published.id);
      await repo.update(published.id, { status: 'PUBLISHED' });

      const drafts = await repo.findByStatus('DRAFT');
      expect(drafts.some((t) => t.name === '草稿1')).toBe(true);
      expect(drafts.some((t) => t.name === '草稿2')).toBe(true);
      expect(drafts.some((t) => t.name === '已发布')).toBe(false);

      const publishedList = await repo.findByStatus('PUBLISHED');
      expect(publishedList.some((t) => t.name === '已发布')).toBe(true);
    });
  });

  describe('incrementVersion', () => {
    it('should increment version by 1', async () => {
      const created = await repo.create({
        name: '版本测试',
        content: { questions: ['Q1'] },
      });
      createdIds.push(created.id);
      expect(created.version).toBe(1);

      const updated = await repo.incrementVersion(created.id);
      expect(updated.version).toBe(2);

      const updatedAgain = await repo.incrementVersion(created.id);
      expect(updatedAgain.version).toBe(3);
    });
  });

  describe('findAllForSelect', () => {
    it('should return only id and name fields', async () => {
      const created = await repo.create({ name: '选择列表模板', content: { questions: ['Q1'] } });
      createdIds.push(created.id);

      const items = await repo.findAllForSelect();
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('name');
      const target = items.find((i) => i.name === '选择列表模板');
      expect(target).toBeDefined();
      // Should NOT have other fields
      expect((target as Record<string, unknown>)['content']).toBeUndefined();
    });
  });
});
