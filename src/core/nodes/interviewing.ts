import { InterviewState, NodeOutput } from '../types/index.js';
import { isFollowupNeeded, generateFollowup } from '../../services/followup.service.js';
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
    const needsFollowup = await isFollowupNeeded(input.content);

    if (needsFollowup && state.followupCount < state.maxFollowups) {
      // 构建对话历史摘要
      const conversationHistory = state.messages
        .slice(-6)
        .map((m) => `${m.role === 'user' ? '用户' : '主持人'}: ${m.content.substring(0, 50)}`)
        .join('\n');

      const followupQuestion = await generateFollowup(
        currentQuestion,
        input.content,
        conversationHistory
      );

      if (followupQuestion) {
        info('Generated followup', {
          currentQ,
          followupCount: state.followupCount + 1,
          followupQuestion,
        });

        return {
          responses: newResponses,
          followupCount: state.followupCount + 1,
          shouldContinue: true,
          response: followupQuestion,
        };
      }
    }
  } catch (e) {
    info('Followup generation failed, falling back to next question', {
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
