import { type PrismaClient, TemplateStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateRepository } from '../src/repositories/template.repository.js';

const mockTemplate = (overrides = {}) => ({
  id: 'tpl-123',
  name: 'Test Template',
  description: 'A test template',
  content: '{"topics":[]}',
  version: 1,
  status: TemplateStatus.DRAFT,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  createdBy: 'admin',
  updatedBy: 'admin',
  ...overrides,
});

const mockPrisma = {
  template: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  interview: {
    groupBy: vi.fn(),
  },
  interviewPlan: {
    groupBy: vi.fn(),
  },
  batchAnalysisReport: {
    count: vi.fn(),
  },
};

let repo: TemplateRepository;

beforeEach(() => {
  vi.clearAllMocks();
  repo = new TemplateRepository(mockPrisma as unknown as PrismaClient);
});

describe('TemplateRepository', () => {
  describe('create', () => {
    it('should create a new template with DRAFT status and version 1', async () => {
      const created = mockTemplate();
      mockPrisma.template.create.mockResolvedValueOnce(created);

      const result = await repo.create({
        name: 'Test Template',
        description: 'A test template',
        content: { topics: [] },
      });

      expect(result).toEqual(created);
      expect(mockPrisma.template.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Template',
          description: 'A test template',
          content: '{"topics":[]}',
          version: 1,
          status: TemplateStatus.DRAFT,
          createdBy: 'admin',
          updatedBy: 'admin',
        },
      });
    });

    it('should create a template without description', async () => {
      const created = mockTemplate({ name: 'Minimal', description: null });
      mockPrisma.template.create.mockResolvedValueOnce(created);

      const result = await repo.create({
        name: 'Minimal',
        content: { topics: [] },
      });

      expect(result.name).toBe('Minimal');
      expect(mockPrisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Minimal' }),
        })
      );
    });
  });

  describe('findAll', () => {
    it('should return all templates ordered by createdAt desc', async () => {
      const templates = [mockTemplate({ id: 'tpl-2' }), mockTemplate({ id: 'tpl-1' })];
      mockPrisma.template.findMany.mockResolvedValueOnce(templates);

      const result = await repo.findAll();

      expect(result).toEqual(templates);
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no templates exist', async () => {
      mockPrisma.template.findMany.mockResolvedValueOnce([]);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a template by id', async () => {
      const template = mockTemplate();
      mockPrisma.template.findUnique.mockResolvedValueOnce(template);

      const result = await repo.findById('tpl-123');

      expect(result).toEqual(template);
      expect(mockPrisma.template.findUnique).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
      });
    });

    it('should return null when template is not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update template fields and set updatedBy', async () => {
      const updated = mockTemplate({ name: 'Updated Name' });
      mockPrisma.template.update.mockResolvedValueOnce(updated);

      const result = await repo.update('tpl-123', { name: 'Updated Name' });

      expect(result).toEqual(updated);
      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        data: {
          name: 'Updated Name',
          updatedBy: 'admin',
        },
      });
    });

    it('should serialize content to JSON string when updating content', async () => {
      mockPrisma.template.update.mockResolvedValueOnce(mockTemplate());
      const content = { newKey: 'value' };

      await repo.update('tpl-123', { content });

      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        data: {
          content: JSON.stringify(content),
          updatedBy: 'admin',
        },
      });
    });

    it('should update status when provided', async () => {
      mockPrisma.template.update.mockResolvedValueOnce(mockTemplate());

      await repo.update('tpl-123', { status: TemplateStatus.PUBLISHED });

      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        data: {
          status: TemplateStatus.PUBLISHED,
          updatedBy: 'admin',
        },
      });
    });

    it('should throw when template does not exist', async () => {
      mockPrisma.template.update.mockRejectedValueOnce(new Error('Record to update not found.'));

      await expect(repo.update('non-existent', { name: 'Fail' })).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete a template and return true', async () => {
      mockPrisma.template.delete.mockResolvedValueOnce(mockTemplate());

      const result = await repo.delete('tpl-123');

      expect(result).toBe(true);
      expect(mockPrisma.template.delete).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
      });
    });

    it('should throw when template does not exist', async () => {
      mockPrisma.template.delete.mockRejectedValueOnce(new Error('Record to delete not found.'));

      await expect(repo.delete('non-existent')).rejects.toThrow();
    });
  });

  describe('findByStatus', () => {
    it('should return templates filtered by status', async () => {
      const templates = [mockTemplate()];
      mockPrisma.template.findMany.mockResolvedValueOnce(templates);

      const result = await repo.findByStatus(TemplateStatus.DRAFT);

      expect(result).toEqual(templates);
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
        where: { status: TemplateStatus.DRAFT },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return published templates', async () => {
      const published = mockTemplate({ status: TemplateStatus.PUBLISHED });
      mockPrisma.template.findMany.mockResolvedValueOnce([published]);

      const result = await repo.findByStatus(TemplateStatus.PUBLISHED);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(TemplateStatus.PUBLISHED);
    });
  });

  describe('incrementVersion', () => {
    it('should increment version by 1', async () => {
      const updated = mockTemplate({ version: 2 });
      mockPrisma.template.findUnique.mockResolvedValueOnce(mockTemplate());
      mockPrisma.template.update.mockResolvedValueOnce(updated);

      const result = await repo.incrementVersion('tpl-123');

      expect(result.version).toBe(2);
      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        data: { version: { increment: 1 } },
      });
    });

    it('should throw when template is not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      await expect(repo.incrementVersion('non-existent')).rejects.toThrow('Template not found');
    });
  });

  describe('getVersion', () => {
    it('should return id and version', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(mockTemplate({ version: 3 }));

      const result = await repo.getVersion('tpl-123');

      expect(result).toEqual({ id: 'tpl-123', version: 3 });
    });

    it('should return null when template is not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      const result = await repo.getVersion('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getVersionHistory', () => {
    it('should return version history for existing template', async () => {
      const createdAt = new Date('2025-01-01');
      mockPrisma.template.findUnique.mockResolvedValueOnce(mockTemplate({ createdAt }));

      const result = await repo.getVersionHistory('tpl-123');

      expect(result).toEqual([{ id: 'tpl-123', version: 1, createdAt }]);
    });

    it('should throw when template is not found', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      await expect(repo.getVersionHistory('non-existent')).rejects.toThrow('Template not found');
    });
  });

  describe('updateWithVersion', () => {
    it('should update template with optimistic locking and increment version', async () => {
      const updated = mockTemplate({ name: 'New Name', version: 2 });
      mockPrisma.template.update.mockResolvedValueOnce(updated);

      const result = await repo.updateWithVersion('tpl-123', 1, { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123', version: 1 },
        data: {
          name: 'New Name',
          version: { increment: 1 },
          updatedBy: 'admin',
        },
      });
    });

    it('should throw on version conflict', async () => {
      mockPrisma.template.update.mockRejectedValueOnce(new Error('Record to update not found.'));

      await expect(repo.updateWithVersion('tpl-123', 999, { name: 'Conflict' })).rejects.toThrow();
    });

    it('should include all fields in update data', async () => {
      mockPrisma.template.update.mockResolvedValueOnce(mockTemplate());

      await repo.updateWithVersion('tpl-123', 1, {
        name: 'New',
        description: 'new desc',
        content: { newKey: 'data' },
        status: 'PUBLISHED',
      });

      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123', version: 1 },
        data: {
          name: 'New',
          description: 'new desc',
          content: '{"newKey":"data"}',
          status: 'PUBLISHED',
          version: { increment: 1 },
          updatedBy: 'admin',
        },
      });
    });
  });

  describe('findAllForAdminTree', () => {
    it('should return templates with nested plans and interviews', async () => {
      const treeData = [
        {
          id: 'tpl-1',
          name: 'Template A',
          description: 'desc',
          status: TemplateStatus.DRAFT,
          version: 1,
          createdAt: new Date(),
          _count: { interviewPlans: 2, interviews: 5 },
          interviewPlans: [
            {
              id: 'plan-1',
              name: 'Plan A',
              description: null,
              status: 'READY',
              completedCount: 3,
              sentCount: 5,
              createdAt: new Date(),
              _count: { interviews: 10 },
              interviews: [
                { id: 'iv-1', userId: 'user1', status: 'COMPLETED', completedAt: new Date() },
              ],
            },
          ],
        },
      ];
      mockPrisma.template.findMany.mockResolvedValueOnce(treeData);

      const result = await repo.findAllForAdminTree();

      expect(result).toEqual(treeData);
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } })
      );
    });
  });

  describe('findAllForSelect', () => {
    it('should return id and name only', async () => {
      const selectData = [
        { id: 'tpl-1', name: 'Template A' },
        { id: 'tpl-2', name: 'Template B' },
      ];
      mockPrisma.template.findMany.mockResolvedValueOnce(selectData);

      const result = await repo.findAllForSelect();

      expect(result).toEqual(selectData);
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
    });
  });

  describe('findByIdWithCounts', () => {
    it('should return template with interview/plan counts', async () => {
      const withCounts = mockTemplate({
        _count: { interviewPlans: 3, interviews: 7 },
      });
      mockPrisma.template.findUnique.mockResolvedValueOnce(withCounts);

      const result = await repo.findByIdWithCounts('tpl-123');

      expect(result).toEqual(withCounts);
      expect(mockPrisma.template.findUnique).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          content: true,
          _count: { select: { interviewPlans: true, interviews: true } },
        },
      });
    });
  });

  describe('publish', () => {
    it('should set status to PUBLISHED', async () => {
      const published = mockTemplate({ status: TemplateStatus.PUBLISHED });
      mockPrisma.template.update.mockResolvedValueOnce(published);

      const result = await repo.publish('tpl-123');

      expect(result.status).toBe(TemplateStatus.PUBLISHED);
      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-123' },
        data: { status: TemplateStatus.PUBLISHED, updatedAt: expect.any(Date) },
      });
    });
  });

  describe('deleteAndVerify', () => {
    it('should delete and confirm deletion', async () => {
      mockPrisma.template.delete.mockResolvedValueOnce(mockTemplate());
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      const result = await repo.deleteAndVerify('tpl-123');

      expect(result).toBe(true);
      expect(mockPrisma.template.delete).toHaveBeenCalledWith({ where: { id: 'tpl-123' } });
      expect(mockPrisma.template.findUnique).toHaveBeenCalledWith({ where: { id: 'tpl-123' } });
    });

    it('should return false if deletion was not successful', async () => {
      mockPrisma.template.delete.mockResolvedValueOnce(mockTemplate());
      mockPrisma.template.findUnique.mockResolvedValueOnce(mockTemplate());

      const result = await repo.deleteAndVerify('tpl-123');

      expect(result).toBe(false);
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated results with total count', async () => {
      const items = [mockTemplate({ id: 'tpl-1' }), mockTemplate({ id: 'tpl-2' })];
      mockPrisma.template.findMany.mockResolvedValueOnce(items);
      mockPrisma.template.count.mockResolvedValueOnce(10);

      const result = await repo.findAllPaginated(1, 2);

      expect(result).toEqual({ items, total: 10, page: 1, limit: 2 });
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 2,
      });
      expect(mockPrisma.template.count).toHaveBeenCalled();
    });

    it('should calculate skip for page 2', async () => {
      mockPrisma.template.findMany.mockResolvedValueOnce([]);
      mockPrisma.template.count.mockResolvedValueOnce(5);

      const result = await repo.findAllPaginated(2, 10);

      expect(result.page).toBe(2);
      expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });
  });

  describe('getUsageStats', () => {
    it('should return aggregated usage statistics', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Test Template' });
      mockPrisma.interview.groupBy.mockResolvedValueOnce([
        { status: 'COMPLETED', _count: 5 },
        { status: 'ACTIVE', _count: 2 },
      ]);
      mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([
        { status: 'RUNNING', _count: 1 },
        { status: 'COMPLETED', _count: 3 },
      ]);
      mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(2);

      const result = await repo.getUsageStats('tpl-123');

      expect(result).toEqual({
        templateId: 'tpl-123',
        templateName: 'Test Template',
        interviews: { active: 2, pending: 0, waiting: 0, completed: 5, cancelled: 0, total: 7 },
        plans: { running: 1, pending: 0, ready: 0, paused: 0, completed: 3, total: 4 },
        reportCount: 2,
        safeToDelete: false,
      });
    });

    it('should mark safeToDelete true when no active interviews or plans', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce({ name: 'Unused Template' });
      mockPrisma.interview.groupBy.mockResolvedValueOnce([{ status: 'COMPLETED', _count: 3 }]);
      mockPrisma.interviewPlan.groupBy.mockResolvedValueOnce([{ status: 'COMPLETED', _count: 1 }]);
      mockPrisma.batchAnalysisReport.count.mockResolvedValueOnce(0);

      const result = await repo.getUsageStats('tpl-safe');

      expect(result.safeToDelete).toBe(true);
      expect(result.templateName).toBe('Unused Template');
    });

    it('should throw when template does not exist', async () => {
      mockPrisma.template.findUnique.mockResolvedValueOnce(null);

      await expect(repo.getUsageStats('non-existent')).rejects.toThrow('Template not found');
    });
  });
});
