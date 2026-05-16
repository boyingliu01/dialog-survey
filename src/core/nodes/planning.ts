import { TemplateRepository } from '../../repositories/template.repository.js';
import { InterviewState, NodeOutput } from '../types/index.js';

export interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  dimensions?: Array<{
    id: string;
    label: string;
    keywords?: string[];
  }>;
  analysisConfig?: Record<string, unknown>;
}

export async function planningNode(
  state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId);
  const firstQuestion = content.questions[0];
  const greeting = content.invitationPrompt;

  return {
    status: 'ACTIVE',
    currentQuestion: 0,
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      },
    ],
    response: firstQuestion,
    shouldContinue: true,
  };
}

async function loadTemplateContent(templateId?: string): Promise<TemplateContent> {
  const repo = new TemplateRepository();

  if (templateId) {
    const template = await repo.findById(templateId);
    if (template) {
      return JSON.parse(template.content) as TemplateContent;
    }
  }

  return {
    name: 'Default Interview',
    invitationPrompt: '您好！欢迎参与本次访谈。您的回答对我们非常重要，请根据提示回答问题即可。',
    questions: [
      '请简单介绍一下您的工作经历？',
      '您在工作中遇到过最大的挑战是什么？',
      '您是如何解决这个挑战的？',
      '您对未来的职业规划是什么？',
    ],
  };
}
