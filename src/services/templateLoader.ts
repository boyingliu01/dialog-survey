import fs from "fs";
import path from "path";
import { z } from "zod";
import logger from "../utils/logger.js";

// Template question schema
const TemplateQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["rating", "text", "single_choice", "yes_no"]),
  text: z.string(),
  follow_ups: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        condition: z.string().optional(),
      }),
    )
    .optional(),
  condition: z.string().optional(),
});

// Template topic schema
const TemplateTopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  initial_question: z.string(),
});

// Interview template schema
export const InterviewTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  topics: z.array(TemplateTopicSchema),
  questions: z.array(TemplateQuestionSchema),
  domain_context: z.string().optional(),
  version: z.string().optional(),
});

// Interview template type
export type InterviewTemplate = z.infer<typeof InterviewTemplateSchema>;

class TemplateLoader {
  private templates: Map<string, InterviewTemplate> = new Map();
  private templatesDirectory: string;

  constructor(
    templatesDirectory: string = path.join(process.cwd(), "templates"),
  ) {
    this.templatesDirectory = templatesDirectory;
  }

  /**
   * Load all templates from the templates directory
   */
  loadTemplates(): InterviewTemplate[] {
    try {
      const files = fs.readdirSync(this.templatesDirectory);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      const loadedTemplates: InterviewTemplate[] = [];

      for (const file of jsonFiles) {
        const template = this.loadTemplate(file.replace(".json", ""));
        if (template) {
          loadedTemplates.push(template);
        }
      }

      return loadedTemplates;
    } catch (error) {
      logger.error({ error }, "Failed to load templates");
      return [];
    }
  }

  /**
   * Load a specific template by ID
   */
  loadTemplate(templateId: string): InterviewTemplate | null {
    try {
      // Check cache first
      if (this.templates.has(templateId)) {
        return this.templates.get(templateId) || null;
      }

      const templatePath = path.join(
        this.templatesDirectory,
        `${templateId}.json`,
      );

      if (!fs.existsSync(templatePath)) {
        logger.error({ templatePath }, `Template file not found`);
        return null;
      }

      const content = fs.readFileSync(templatePath, "utf8");
      const rawData: unknown = JSON.parse(content);

      const validatedTemplate = InterviewTemplateSchema.parse(rawData);

      this.templates.set(templateId, validatedTemplate);

      return validatedTemplate;
    } catch (error) {
      logger.error({ templateId, error }, `Failed to load template`);
      return null;
    }
  }

  /**
   * List all available templates
   */
  listTemplates(): InterviewTemplate[] {
    return this.loadTemplates();
  }

  /**
   * Clear templates cache
   */
  clearCache(): void {
    this.templates.clear();
  }
}

export { TemplateLoader };
