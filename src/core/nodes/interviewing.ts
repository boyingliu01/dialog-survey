import { InterviewState, NodeOutput } from '../types/index.js';

export async function interviewingNode(
  state: InterviewState,
  input: { content: string }
): Promise<Partial<InterviewState> & NodeOutput> {
  const template = getTemplate(state.templateId);
  const currentQ = state.currentQuestion;

  const newResponses = [
    ...state.responses,
    {
      questionId: `q${currentQ}`,
      content: input.content,
      isFollowup: false,
    },
  ];

  const nextQuestion = template.questions[currentQ + 1];

  return {
    responses: newResponses,
    currentQuestion: currentQ + 1,
    shouldContinue: !!nextQuestion,
    nextQuestion,
    response: nextQuestion || '访谈已完成，感谢您的参与！',
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
