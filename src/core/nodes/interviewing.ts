import type { PrismaClient } from '@prisma/client';
import { TemplateRepository } from '../../repositories/template.repository.js';
import { generateSmartResponse } from '../../services/followup.service.js';
import { info, warn } from '../../utils/logger.js';
import type { InterviewState, NodeOutput } from '../types/index.js';

type ResponseEntry = { questionId: string; content: string; isFollowup: boolean };
type NewResponses = ResponseEntry[];

export interface TemplateContent {
  name: string;
  description?: string;
  invitationPrompt: string;
  questions: string[];
  closingMessage?: string;
  llmPromptTemplate?: string;
}

interface SmartResult {
  action: string;
  response: string;
  shouldEndInterview: boolean;
}

function buildClosingMessage(closingMessage: string | undefined): string {
  return closingMessage || '访谈已完成，感谢您的参与！';
}

function handleSmartResult(
  smartResult: SmartResult,
  state: InterviewState,
  content: TemplateContent,
  currentQ: number,
  newResponses: NewResponses
): (Partial<InterviewState> & NodeOutput) | null {
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
  const isLastQuestion = currentQ >= content.questions.length - 1;

  if (containsMultipleQuestions(smartResult.response)) {
    warn('LLM response contains multiple questions. Removing extra text.', {
      text: smartResult.response.substring(0, 80),
    });
    const firstSentence = smartResult.response.split(/[?？]/)[0].trim();
    return {
      responses: newResponses,
      currentQuestion: currentQ + 1,
      shouldContinue: !!nextQuestion,
      response: `${firstSentence}\n\n${isLastQuestion ? content.closingMessage || buildClosingMessage(content.closingMessage) : nextQuestion}`,
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

  return null;
}

function buildFallbackResponse(
  content: TemplateContent,
  currentQ: number,
  newResponses: NewResponses
): Partial<InterviewState> & NodeOutput {
  const nextQuestion = content.questions[currentQ + 1];
  const isLastQuestion = currentQ >= content.questions.length - 1;

  if (isLastQuestion) {
    const closing = buildClosingMessage(content.closingMessage);
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

export async function interviewingNode(
  state: InterviewState,
  input: { content: string; prisma?: PrismaClient }
): Promise<Partial<InterviewState> & NodeOutput> {
  const content = await loadTemplateContent(state.templateId, input.prisma);
  const currentQ = state.currentQuestion;
  const currentQuestion = content.questions[currentQ] || '请根据用户的回答进行追问或总结。';

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
      currentQ >= content.questions.length - 1
    );

    info('Smart response generated', {
      currentQ,
      action: smartResult.action,
      response: smartResult.response.substring(0, 50),
    });

    const handled = handleSmartResult(smartResult, state, content, currentQ, newResponses);
    if (handled) return handled;

    const nextQuestion = content.questions[currentQ + 1];
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

  return buildFallbackResponse(content, currentQ, newResponses);
}

/**
 * Detect multiple questions in a text. If > 1 question mark, returns true.
 */
function containsMultipleQuestions(text: string): boolean {
  const matches = text.match(/[?？]/g);
  return matches ? matches.length > 1 : false;
}

async function loadTemplateContent(
  templateId?: string,
  prisma?: PrismaClient
): Promise<TemplateContent> {
  if (templateId && prisma) {
    const repo = new TemplateRepository(prisma);
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
