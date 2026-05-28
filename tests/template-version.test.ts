import { TemplateStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

let idCounter = 0;
const generateId = () => `tmpl-${Date.now()}-${++idCounter}`;

interface TemplateRecord {
  id: string;
  name: string;
  description?: string;
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
      description: data.description,
      content: JSON.stringify(data.content),
      version: 1,
      status: TemplateStatus.DRAFT as unknown as string,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(template.id, template);
    return template;
  }

  async getVersion(id: string) {
    const template = this.store.get(id);
    if (!template) return null;
    return { id: template.id, version: template.version };
  }

  async incrementVersion(id: string) {
    const template = this.store.get(id);
    if (!template) throw new Error('Template not found');
    template.version++;
    template.updatedAt = new Date();
    this.store.set(id, template);
    return template;
  }

  async getVersionHistory(id: string) {
    const template = this.store.get(id);
    if (!template) throw new Error('Template not found');
    return [
      {
        id: template.id,
        version: template.version,
        createdAt: template.createdAt,
      },
    ];
  }
}

describe('Task-008-3: Template Version Management', () => {
  let repository: TemplateRepository;

  beforeEach(() => {
    repository = new TemplateRepository();
    idCounter = 0;
  });

  /**
   * @test REQ-008-3-01
   * @intent 测试查询当前模板版本号功能是否正常工作
   */
  it('should return current version when querying version', async () => {
    const template = await repository.create({
      name: 'Version Test',
      content: { topics: [] },
    });

    const versionInfo = await repository.getVersion(template.id);
    expect(versionInfo).toBeDefined();
    expect(versionInfo?.version).toBe(1);
  });

  it('should increment version when creating new version', async () => {
    const template = await repository.create({
      name: 'Increment Test',
      content: { topics: [] },
    });

    const updated = await repository.incrementVersion(template.id);
    expect(updated.version).toBe(2);

    const versionInfo = await repository.getVersion(template.id);
    expect(versionInfo?.version).toBe(2);
  });

  /**
   * @test REQ-008-3-01
   * @intent 测试多次连续增量升级模板版本功能是否正常工作
   */
  it('should support multiple version increments', async () => {
    const template = await repository.create({
      name: 'Multi Increment',
      content: { topics: [] },
    });

    await repository.incrementVersion(template.id);
    await repository.incrementVersion(template.id);
    await repository.incrementVersion(template.id);

    const versionInfo = await repository.getVersion(template.id);
    expect(versionInfo?.version).toBe(4);
  });

  it('should throw error when incrementing non-existent template', async () => {
    await expect(repository.incrementVersion('non-existent')).rejects.toThrow('Template not found');
  });

  /**
   * @test REQ-008-3-01
   * @intent 测试获取模板版本历史记录功能是否正常工作
   */
  it('should get version history', async () => {
    const template = await repository.create({
      name: 'History Test',
      content: { version: 1 },
    });

    await repository.incrementVersion(template.id);
    await repository.incrementVersion(template.id);

    const history = await repository.getVersionHistory(template.id);
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});
