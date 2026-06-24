import type { PrismaClient } from '@prisma/client';
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
  state: InterviewState,
  prisma?: PrismaClient
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId, prisma);
  const firstQuestion = content.questions[0] || '请开始回答，我会根据您的回答进行追问。';
  let greeting = content.invitationPrompt;

  // Ensure the greeting clearly conveys interview intent within the first ~40 chars.
  // If the template's invitationPrompt starts with vague methodology text, prepend a
  // brief, direct statement so the interviewee immediately understands this is an interview.
  const intentSignals = /访谈|采访|聊一聊|survey|interview/i;
  if (!intentSignals.test(greeting.substring(0, 40))) {
    greeting = `欢迎参加「${content.name}」访谈调查。\n\n${greeting}`;
  }

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
    response: `${greeting}\n\n${firstQuestion}`,
    shouldContinue: true,
  };
}

async function loadTemplateContent(
  templateId?: string,
  prisma?: PrismaClient
): Promise<TemplateContent> {
  if (templateId && prisma) {
    const repo = new TemplateRepository(prisma);
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
