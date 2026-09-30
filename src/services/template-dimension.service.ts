import { dimensionsArraySchema } from '../schemas/dimensions.js';
import type { PrismaClient } from '../utils/prisma-client.js';

export async function updateTemplateDimensions(
  prisma: PrismaClient,
  templateId: string,
  dimensions: {
    id: string;
    label: string;
    description?: string;
    keywords?: string[];
  }[]
) {
  dimensionsArraySchema.parse(dimensions);

  return prisma.template.update({
    where: { id: templateId },
    data: { dimensions, updatedAt: new Date() },
  });
}
