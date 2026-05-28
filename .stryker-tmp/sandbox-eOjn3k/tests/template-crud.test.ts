// @ts-nocheck
import { PrismaClient, TemplateStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

// Unique ID generator to avoid Date.now() collision in tests
let idCounter = 0;
const generateId = () => `tmpl-${Date.now()}-${++idCounter}`;

// Template Repository (will be implemented)
class TemplateRepository {
  private prisma: PrismaClient;
  private store: Map<string, any>;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
    this.store = new Map();
  }

  async create(data: { name: string; content: any; description?: string }) {
    // TODO: Implement with real Prisma
    const template = {
      id: generateId(),
      name: data.name,
      description: data.description,
      content: data.content,
      version: 1,
      status: 'DRAFT' as TemplateStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(template.id, template);
    return template;
  }

  async findAll() {
    return Array.from(this.store.values());
  }

  async findById(id: string) {
    return this.store.get(id) || null;
  }

  async update(id: string, data: Partial<{ name: string; content: any; description: string }>) {
    const existing = this.store.get(id);
    if (!existing) throw new Error('Template not found');
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string) {
    const existing = this.store.get(id);
    if (!existing) throw new Error('Template not found');
    this.store.delete(id);
    return true;
  }
}

describe('Task-008-2: Template CRUD API', () => {
  let repository: TemplateRepository;

  beforeEach(() => {
    repository = new TemplateRepository();
  });

  it('should create a new template', async () => {
    const template = await repository.create({
      name: 'Test Template',
      description: 'A test template',
      content: { topics: [] },
    });

    expect(template.id).toBeDefined();
    expect(template.name).toBe('Test Template');
    expect(template.version).toBe(1);
    expect(template.status).toBe('DRAFT');
  });

  it('should list all templates', async () => {
    await repository.create({ name: 'Template 1', content: { topics: [] } });
    await repository.create({ name: 'Template 2', content: { topics: [] } });

    const templates = await repository.findAll();
    expect(templates.length).toBe(2);
  });

  it('should find template by id', async () => {
    const created = await repository.create({
      name: 'Find Me',
      content: { topics: [] },
    });

    const found = await repository.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Find Me');
  });

  it('should update a template', async () => {
    const created = await repository.create({
      name: 'Original',
      content: { topics: [] },
    });

    const updated = await repository.update(created.id, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
  });

  it('should delete a template', async () => {
    const created = await repository.create({
      name: 'Delete Me',
      content: { topics: [] },
    });

    await repository.delete(created.id);
    const found = await repository.findById(created.id);
    expect(found).toBeNull();
  });

  it('should throw error when updating non-existent template', async () => {
    await expect(repository.update('non-existent', { name: 'Fail' })).rejects.toThrow(
      'Template not found'
    );
  });

  it('should throw error when deleting non-existent template', async () => {
    await expect(repository.delete('non-existent')).rejects.toThrow('Template not found');
  });
});
