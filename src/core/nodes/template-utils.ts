import type { PrismaClient } from '@prisma/client';
import { TemplateRepository } from '../../repositories/template.repository.js';
import { DEFAULT_TEMPLATE_CONTENT, type TemplateContent } from '../types/index.js';

export async function loadTemplateContent(
  templateId?: string,
  prisma?: PrismaClient
): Promise<TemplateContent> {
  if (templateId && prisma) {
    const repo = new TemplateRepository(prisma);
    const template = await repo.findById(templateId);
    if (template) return JSON.parse(template.content) as TemplateContent;
  }
  return { ...DEFAULT_TEMPLATE_CONTENT };
}
