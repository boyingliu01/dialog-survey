export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
}

const TEMPLATES: Record<string, PromptTemplate> = {
  generateQuestion: {
    name: 'generateQuestion',
    template: `你是访谈主持人。根据以下访谈上下文，生成下一个问题。

访谈主题: {{topic}}
当前问题: {{currentQuestion}}
用户回答: {{userAnswer}}

请生成下一个问题，要求简洁、具体。`,
    variables: ['topic', 'currentQuestion', 'userAnswer'],
  },

  generateFollowup: {
    name: 'generateFollowup',
    template: `基于用户的回答，判断是否需要追问，如果需要，生成追问问题。

用户回答: {{userAnswer}}
问题: {{question}}

如果需要追问，请直接输出追问问题，不需要其他说明。如果不需要追问，请输出"SKIP"。`,
    variables: ['userAnswer', 'question'],
  },

  generateReport: {
    name: 'generateReport',
    template: `根据以下访谈内容，生成访谈报告。

访谈主题: {{topic}}
访谈问题与回答:
{{qaPairs}}

请生成包含以下内容的报告：
1. 关键发现
2. 情感分析
3. 行动建议

使用中文输出。`,
    variables: ['topic', 'qaPairs'],
  },

  isFollowupNeeded: {
    name: 'isFollowupNeeded',
    template: `判断以下回答是否模糊或不完整，需要追问。

用户回答: {{userAnswer}}

如果需要追问，输出YES。如果回答清晰完整，输出NO。`,
    variables: ['userAnswer'],
  },
};

export class PromptService {
  private templates: Map<string, PromptTemplate>;

  constructor(templates?: Record<string, PromptTemplate>) {
    this.templates = new Map(Object.entries(templates || TEMPLATES));
  }

  render(templateName: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    let result = template.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }
}

export const promptService = new PromptService();
