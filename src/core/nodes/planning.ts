import type { PrismaClient } from '@prisma/client';
import { polishFirstQuestion } from '../../services/followup.service.js';
import type { InterviewState, NodeOutput } from '../types/index.js';
import { loadTemplateContent } from './template-utils.js';

export async function planningNode(
  state: InterviewState,
  prisma?: PrismaClient
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId, prisma);
  const firstQuestion = content.questions[0] || '请开始回答，我会根据您的回答进行追问。';
  const refinedFirstQuestion = await polishFirstQuestion(firstQuestion);
  let greeting = content.invitationPrompt;

  // Ensure the greeting clearly conveys interview intent within the first ~40 chars.
  // If the template's invitationPrompt starts with vague methodology text, prepend a
  // brief, direct statement so the interviewee immediately understands this is an interview.
  const intentSignals = /访谈|采访|聊一聊|survey|interview/i;
  if (!intentSignals.test(greeting.substring(0, 40))) {
    greeting = `欢迎参加「${content.name}」访谈调查。\n\n${greeting}`;
  }

  const fullMessage = `${greeting}\n\n${refinedFirstQuestion}`;

  return {
    status: 'ACTIVE',
    currentQuestion: 0,
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: fullMessage,
        timestamp: new Date(),
      },
    ],
    response: fullMessage,
    shouldContinue: true,
  };
}
