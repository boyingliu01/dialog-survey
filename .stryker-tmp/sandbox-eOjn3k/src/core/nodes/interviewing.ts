// @ts-nocheck
import { TemplateRepository } from '../../repositories/template.repository.js';
import { generateSmartResponse } from '../../services/followup.service.js';
import { info, warn } from '../../utils/logger.js';
import type { InterviewState, NodeOutput } from '../types/index.js';

export interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  closingMessage?: string;
  llmPromptTemplate?: string;
}

export async function interviewingNode(
  state: InterviewState,
  input: { content: string }
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId);
  const currentQ = state.currentQuestion;
  const currentQuestion = content.questions[currentQ];
  const isLastQuestion = currentQ >= content.questions.length - 1;

  const newResponses = [
    ...state.responses,
    { questionId: `q${currentQ}`, content: input.content, isFollowup: false },
  ];

  try {
    const smartResult = await generateSmartResponse(
      state,
      input.content,
      currentQuestion,
      content.llmPromptTemplate,
      isLastQuestion
    );

    info('Smart response generated', {
      currentQ,
      action: smartResult.action,
      response: smartResult.response.substring(0, 50),
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
      return { responses: newResponses, shouldContinue: true, response: smartResult.response };
    }

    const nextQuestion = content.questions[currentQ + 1];

    // Guard: ensure one question at a time
    if (containsMultipleQuestions(smartResult.response)) {
      warn('LLM response contains multiple questions. Removing extra text.', {
        text: smartResult.response.substring(0, 80),
      });
      // Split on the first question mark and keep the text before it
      const firstSentence = smartResult.response.split(/[?？]/)[0].trim();
      return {
        responses: newResponses,
        currentQuestion: currentQ + 1,
        shouldContinue: !!nextQuestion,
        response: `${firstSentence}\n\n${isLastQuestion ? content.closingMessage || '访谈已完成，感谢您的参与！' : nextQuestion}`,
      };
    }

    if (isLastQuestion && smartResult.response) {
      const closing =
        content.closingMessage ||
        '非常感谢您的分享！这些信息对我们非常有价值。访谈到此结束，祝您工作顺利！';
      return {
        responses: newResponses,
        currentQuestion: currentQ + 1,
        shouldContinue: false,
        response: `${smartResult.response}\n\n${closing}`,
      };
    }

    return {
      responses: newResponses,
      currentQuestion: currentQ + 1,
      shouldContinue: !!nextQuestion,
      response: smartResult.response ? `${smartResult.response}\n\n${nextQuestion}` : nextQuestion,
    };
  } catch (e) {
    info('Smart response generation failed, falling back to next question', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const nextQuestion = content.questions[currentQ + 1];

  if (isLastQuestion) {
    const closing = content.closingMessage || '访谈已完成，感谢您的参与！';
    return {
      responses: newResponses,
      currentQuestion: currentQ + 1,
      shouldContinue: false,
      response: closing,
    };
  }

  return {
    responses: newResponses,
    currentQuestion: currentQ + 1,
    shouldContinue: !!nextQuestion,
    response: nextQuestion || '访谈已完成，非常感谢您拨冗参与！',
  };
}

/**
 * Detect multiple questions in a text. If > 1 question mark, returns true.
 */
function containsMultipleQuestions(text: string): boolean {
  const matches = text.match(/[?？]/g);
  return matches ? matches.length > 1 : false;
}

async function loadTemplateContent(templateId?: string): Promise<TemplateContent> {
  const repo = new TemplateRepository();
  if (templateId) {
    const template = await repo.findById(templateId);
    if (template) return JSON.parse(template.content) as TemplateContent;
  }
  return {
    name: 'Default Interview',
    invitationPrompt: '您好！欢迎参与本次访谈。',
    questions: [
      '请简单介绍一下您的工作经历？',
      '您在工作中遇到过最大的挑战是什么？',
      '您是如何解决这个挑战的？',
      '您对未来的职业规划是什么？',
    ],
  };
}
