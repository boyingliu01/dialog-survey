import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// Template schema
const TopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  initial_question: z.string(),
});

const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['rating', 'text', 'single_choice', 'yes_no']),
  text: z.string(),
  follow_ups: z.array(z.any()).optional(),
  condition: z.string().optional(),
});

const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  topics: z.array(TopicSchema),
  questions: z.array(QuestionSchema).optional(),
  domain_context: z.string().default(''),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Question = z.infer<typeof QuestionSchema>;

export class TemplateService {
  private readonly templatesDir: string;
  private readonly templatesCache = new Map<string, Template>();

  constructor(templatesDir = './templates') {
    this.templatesDir = path.resolve(templatesDir);
    this.ensureTemplatesDir();
    this.loadTemplates();
  }

  private ensureTemplatesDir(): void {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  private loadTemplates(): void {
    try {
      const files = fs.readdirSync(this.templatesDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.templatesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const template = TemplateSchema.parse(JSON.parse(content));
            this.templatesCache.set(template.id, template);
          } catch (error) {
            console.error(`Error loading template ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  /**
   * List all available templates
   */
  listTemplates(): Omit<Template, 'topics' | 'questions' | 'domain_context'>[] {
    return Array.from(this.templatesCache.values()).map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      version: template.version,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): Template | null {
    return this.templatesCache.get(templateId) || null;
  }

  /**
   * Check if a template exists
   */
  templateExists(templateId: string): boolean {
    return this.templatesCache.has(templateId);
  }

  /**
   * Create a new template
   */
  async createTemplate(data: Omit<Template, 'createdAt' | 'updatedAt'>): Promise<Template> {
    const now = new Date().toISOString();
    const template: Template = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    // Validate template
    const validated = TemplateSchema.parse(template);

    // Save to file
    const filePath = path.join(this.templatesDir, `${template.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(validated, null, 2), 'utf-8');

    // Update cache
    this.templatesCache.set(template.id, validated);

    return validated;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = this.templatesCache.get(templateId);
    if (!template) {
      return false;
    }

    const filePath = path.join(this.templatesDir, `${templateId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.templatesCache.delete(templateId);
    return true;
  }
}

// Singleton instance
let templateServiceInstance: TemplateService | null = null;

export function getTemplateService(): TemplateService {
  if (!templateServiceInstance) {
    templateServiceInstance = new TemplateService();
  }
  return templateServiceInstance;
}
