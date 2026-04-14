import { InterviewState, NodeOutput } from '../types/index.js';

export async function planningNode(
  state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  const template = getTemplate(state.templateId);
  const firstQuestion = template.questions[0];

  return {
    status: 'ACTIVE', // Transition from PENDING to ACTIVE
    currentQuestion: 0,
    messages: [
      ...state.messages,
      {
        role: 'assistant',
        content: firstQuestion,
        timestamp: new Date(),
      },
    ],
    response: firstQuestion,
    shouldContinue: true,
  };
}

function getTemplate(templateId?: string) {
  return {
    id: templateId || 'default',
    questions: [
      '请简单介绍一下您的工作经历？',
      '您在工作中遇到过最大的挑战是什么？',
      '您是如何解决这个挑战的？',
      '您对未来的职业规划是什么？',
    ],
  };
}
