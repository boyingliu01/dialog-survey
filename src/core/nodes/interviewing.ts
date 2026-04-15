import { InterviewState, NodeOutput } from '../types/index.js';
import { generateSmartResponse } from '../../services/followup.service.js';
import { info } from '../../utils/logger.js';

export async function interviewingNode(
  state: InterviewState,
  input: { content: string }
): Promise<Partial<InterviewState> & NodeOutput> {
  const template = getTemplate(state.templateId);
  const currentQ = state.currentQuestion;
  const currentQuestion = template.questions[currentQ];

  const newResponses = [
    ...state.responses,
    {
      questionId: `q${currentQ}`,
      content: input.content,
      isFollowup: false,
    },
  ];

  try {
    const smartResult = await generateSmartResponse(state, input.content, currentQuestion);

    info('Smart response generated', {
      currentQ,
      action: smartResult.action,
      response: smartResult.response,
    });

    if (smartResult.shouldEndInterview) {
      return {
        responses: newResponses,
        status: 'COMPLETED',
        shouldContinue: false,
        response: smartResult.response,
      };
    }

    if (smartResult.action === 'FOLLOWUP') {
      return {
        responses: newResponses,
        followupCount: state.followupCount + 1,
        shouldContinue: true,
        response: smartResult.response,
      };
    }

    if (smartResult.action === 'STAY') {
      return {
        responses: newResponses,
        shouldContinue: true,
        response: smartResult.response,
      };
    }

    const nextQuestion = template.questions[currentQ + 1];

    return {
      responses: newResponses,
      currentQuestion: currentQ + 1,
      shouldContinue: !!nextQuestion,
      response: smartResult.shouldProceedToNext
        ? nextQuestion
          ? `${smartResult.response}\n\n${nextQuestion}`
          : smartResult.response
        : smartResult.response,
    };
  } catch (e) {
    info('Smart response generation failed, falling back to next question', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const nextQuestion = template.questions[currentQ + 1];

  return {
    responses: newResponses,
    currentQuestion: currentQ + 1,
    shouldContinue: !!nextQuestion,
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
