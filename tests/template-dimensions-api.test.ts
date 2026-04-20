import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { updateTemplateDimensions } from '../src/services/template-dimension.service.js';

const prisma = new PrismaClient();

describe('Template Dimension Service', () => {
  /** @test REQ-TEMPLATE-001 @intent verify valid dimensions can be saved @covers AC-TEMPLATE-001-01 */
  it('updates template with valid dimensions', async () => {
    const t = await prisma.template.create({
      data: { name: 'DimTest', content: '[]', status: 'DRAFT' },
    });

    const dims = [{ id: 'stability', label: '稳定性', keywords: ['崩溃'] }];
    const result = await updateTemplateDimensions(prisma, t.id, dims);

    expect(result.dimensions).not.toBeNull();
    const parsed = result.dimensions as any[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe('稳定性');

    await prisma.template.delete({ where: { id: t.id } });
  });

  /** @test REQ-TEMPLATE-001 @intent verify empty dimensions clears the field @covers AC-TEMPLATE-001-03 */
  it('sets dimensions to empty array when passed empty', async () => {
    const t = await prisma.template.create({
      data: {
        name: 'DimClear',
        content: '[]',
        status: 'DRAFT',
        dimensions: [{ id: 'x', label: 'X', keywords: [] }],
      },
    });

    const result = await updateTemplateDimensions(prisma, t.id, []);
    expect(result.dimensions).toEqual([]);

    await prisma.template.delete({ where: { id: t.id } });
  });

  /** @test REQ-SAFETY-001 @intent reject dimensions missing label @covers AC-SAFETY-001-01 */
  it('rejects dimensions missing label', async () => {
    const t = await prisma.template.create({
      data: { name: 'DimBad', content: '[]', status: 'DRAFT' },
    });

    const dims = [{ id: 'stability' }] as any;
    await expect(updateTemplateDimensions(prisma, t.id, dims)).rejects.toThrow();

    await prisma.template.delete({ where: { id: t.id } });
  });

  /** @test REQ-SAFETY-001 @intent reject dimensions missing id @covers AC-SAFETY-001-01 */
  it('rejects dimensions missing id', async () => {
    const t = await prisma.template.create({
      data: { name: 'DimBad2', content: '[]', status: 'DRAFT' },
    });

    const dims = [{ label: '稳定性' }] as any;
    await expect(updateTemplateDimensions(prisma, t.id, dims)).rejects.toThrow();

    await prisma.template.delete({ where: { id: t.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
