import { TemplateRepository } from '../../repositories/template.repository.js';
import type { PrismaClient } from '../../utils/prisma-client.js';
import { DEFAULT_TEMPLATE_CONTENT, type TemplateContent } from '../types/index.js';

export async function loadTemplateContent(
  templateId?: string,
  prisma?: PrismaClient
): Promise<TemplateContent> {
  if (templateId && prisma) {
    const repo = new TemplateRepository(prisma);
    const template = await repo.findById(templateId);
    if (template) {
      const parsed = JSON.parse(template.content) as TemplateContent;
      // The name lives in the Template row, not in the content JSON, but the
      // greeting interpolates it (`欢迎参加「${content.name}」…`). Returning the
      // parsed JSON alone rendered `欢迎参加「undefined」访谈调查` for every
      // template whose opening line did not contain an intent word.
      return { ...parsed, name: parsed.name ?? template.name };
    }
  }
  return { ...DEFAULT_TEMPLATE_CONTENT };
}
