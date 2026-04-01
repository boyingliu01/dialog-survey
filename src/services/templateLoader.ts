import fs from "fs";
import path from "path";
import { z } from "zod";

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
  async loadTemplates(): Promise<InterviewTemplate[]> {
    try {
      const files = fs.readdirSync(this.templatesDirectory);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      const loadedTemplates: InterviewTemplate[] = [];

      for (const file of jsonFiles) {
        const template = await this.loadTemplate(file.replace(".json", ""));
        if (template) {
          loadedTemplates.push(template);
        }
      }

      return loadedTemplates;
    } catch (error) {
      console.error("Failed to load templates:", error);
      return [];
    }
  }

  /**
   * Load a specific template by ID
   */
  async loadTemplate(templateId: string): Promise<InterviewTemplate | null> {
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
        console.error(`Template file not found: ${templatePath}`);
        return null;
      }

      const content = fs.readFileSync(templatePath, "utf8");
      const rawData = JSON.parse(content);

      const validatedTemplate = InterviewTemplateSchema.parse(rawData);

      this.templates.set(templateId, validatedTemplate);

      return validatedTemplate;
    } catch (error) {
      console.error(`Failed to load template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<InterviewTemplate[]> {
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
