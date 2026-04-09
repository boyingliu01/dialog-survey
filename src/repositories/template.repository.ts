import { PrismaClient, Template, TemplateStatus } from '@prisma/client';

export class TemplateRepository {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  async create(data: {
    name: string;
    content: Record<string, unknown>;
    description?: string;
  }): Promise<Template> {
    return this.prisma.template.create({
      data: {
        name: data.name,
        description: data.description,
        content: JSON.stringify(data.content),
        version: 1,
        status: TemplateStatus.DRAFT,
      },
    });
  }

  async findAll(): Promise<Template[]> {
    return this.prisma.template.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Template | null> {
    return this.prisma.template.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      content: Record<string, unknown>;
      description: string;
      status: TemplateStatus;
    }>
  ): Promise<Template> {
    const updateData: Parameters<typeof this.prisma.template.update>[0]['data'] = {};
    if (data.name) updateData.name = data.name;
    if (data.description) updateData.description = data.description;
    if (data.content) updateData.content = JSON.stringify(data.content);
    if (data.status) updateData.status = data.status;

    return this.prisma.template.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.prisma.template.delete({
      where: { id },
    });
    return true;
  }

  async findByStatus(status: TemplateStatus): Promise<Template[]> {
    return this.prisma.template.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementVersion(id: string): Promise<Template> {
    const template = await this.findById(id);
    if (!template) throw new Error('Template not found');

    return this.prisma.template.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }

  async getVersion(id: string): Promise<{ id: string; version: number } | null> {
    const template = await this.findById(id);
    if (!template) return null;
    return { id: template.id, version: template.version };
  }

  async getVersionHistory(
    id: string
  ): Promise<Array<{ id: string; version: number; createdAt: Date }>> {
    const template = await this.findById(id);
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
