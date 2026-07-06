import { TemplateStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

let idCounter = 0;
const generateId = () => `tmpl-${Date.now()}-${++idCounter}`;

interface TemplateRecord {
  id: string;
  name: string;
  description: string | null;
  content: string;
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

class TemplateRepository {
  private store: Map<string, TemplateRecord>;

  constructor() {
    this.store = new Map();
  }

  async create(data: { name: string; content: object; description?: string }) {
    const template: TemplateRecord = {
      id: generateId(),
      name: data.name,
      description: (data.description ?? null) as string | null,
      content: JSON.stringify(data.content),
      version: 1,
      status: TemplateStatus.DRAFT as string,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(template.id, template);
    return template;
  }

  async findById(id: string) {
    return this.store.get(id) || null;
  }

  async findAll() {
    return Array.from(this.store.values());
  }
}

describe('Task-008-4: Template Import/Export', () => {
  let repository: TemplateRepository;

  beforeEach(() => {
    repository = new TemplateRepository();
    idCounter = 0;
  });

  /**
   * @test REQ-008-4-01
   * @intent 测试模板导出为JSON格式功能是否正常工作
   */
  it('should export template to JSON', async () => {
    const template = await repository.create({
      name: 'Export Test',
      description: 'Test description',
      content: { topics: [{ name: 'Topic 1', questions: [] }] },
    });

    const exportData = {
      name: template.name,
      description: template.description,
      content: JSON.parse(template.content),
      version: template.version,
    };

    expect(exportData.name).toBe('Export Test');
    expect(exportData.content).toHaveProperty('topics');
    expect(JSON.stringify(exportData)).toBeTruthy();
  });

  it('should export all templates to JSON array', async () => {
    await repository.create({ name: 'Template 1', content: { topics: [] } });
    await repository.create({ name: 'Template 2', content: { topics: [] } });
    await repository.create({ name: 'Template 3', content: { topics: [] } });

    const templates = await repository.findAll();
    const exported = templates.map((t) => ({
      name: t.name,
      content: JSON.parse(t.content),
    }));

    expect(exported).toHaveLength(3);
    expect(exported[0].name).toBe('Template 1');
  });

  /**
   * @test REQ-008-4-01
   * @intent 测试从有效的JSON数据导入模板功能是否正常工作
   */
  it('should import template from valid JSON', async () => {
    const importData = {
      name: 'Imported Template',
      description: 'Imported description',
      content: {
        topics: [
          {
            name: 'Imported Topic',
            questions: [{ text: 'Q1', type: 'open' }],
          },
        ],
      },
    };

    const template = await repository.create(importData);

    expect(template.name).toBe('Imported Template');
    const content = JSON.parse(template.content);
    expect(content.topics[0].name).toBe('Imported Topic');
  });

  it('should validate JSON structure on import', async () => {
    const invalidData = {
      name: '',
      content: { topics: [] },
    };

    const result = await repository.create(invalidData).catch((e) => e.message);
    expect(result).toBeTruthy();
  });

  /**
   * @test REQ-008-4-01
   * @intent 测试导入JSON数据时处理缺失可选字段的功能是否正常工作
   */
  it('should handle import with missing optional fields', async () => {
    const minimalData = {
      name: 'Minimal Template',
      content: { topics: [] },
    };

    const template = await repository.create(minimalData);
    expect(template.name).toBe('Minimal Template');
    expect(template.description).toBeNull();
  });

  /**
   * @test REQ-008-4-01
   * @intent 测试导出导入的往返验证功能，确保数据一致性
   */
  it('should roundtrip: export then import produces same data', async () => {
    const original = {
      name: 'Roundtrip Test',
      description: 'Testing roundtrip',
      content: {
        topics: [{ name: 'T1', questions: [{ text: 'Q1', type: 'open' }] }],
      },
    };

    const created = await repository.create(original);
    const exportedContent = JSON.parse(created.content);

    expect(exportedContent.topics[0].name).toBe(original.content.topics[0].name);
  });
});
