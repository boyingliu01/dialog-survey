import type { PrismaClient } from '@prisma/client';
import { generateSmartResponse } from '../../services/followup.service.js';
import { info } from '../../utils/logger.js';
import {
  DEFAULT_CLOSING_MESSAGE,
  type InterviewState,
  type NodeOutput,
  type TemplateContent,
} from '../types/index.js';
import { loadTemplateContent } from './template-utils.js';

type ResponseEntry = { questionId: string; content: string; isFollowup: boolean };
type NewResponses = ResponseEntry[];

interface ActionResult {
  followupCount: number;
  currentQuestion: number;
  shouldContinue: boolean;
  status?: InterviewState['status'];
  response: string;
}

function routeAction(
  initialAction: string,
  followupCount: number,
  maxFollowups: number,
  currentQ: number,
  totalQuestions: number,
  smartResponse: string,
  closingMessage?: string
): ActionResult {
  const isLastQuestion = currentQ >= totalQuestions - 1;
  const closing = closingMessage || DEFAULT_CLOSING_MESSAGE;

  let action = initialAction;

  // Rule 1: Enforce followup limit - force NEXT if exceeded
  if (action === 'FOLLOWUP' && followupCount >= maxFollowups) {
    action = 'NEXT';
  }

  // Rule 2: END / shouldEndInterview
  if (action === 'END' || action === 'shouldEndInterview') {
    return {
      followupCount: 0,
      currentQuestion: currentQ,
      shouldContinue: false,
      status: 'COMPLETED',
      response: `${smartResponse}\n\n${closing}`,
    };
  }

  // Rule 3: FOLLOWUP (not exceeded limit)
  if (action === 'FOLLOWUP') {
    return {
      followupCount: followupCount + 1,
      currentQuestion: currentQ,
      shouldContinue: true,
      response: smartResponse,
    };
  }

  // Rule 4: STAY (re-ask same question) — also increments followup to prevent infinite loops
  if (action === 'STAY') {
    return {
      followupCount: followupCount + 1,
      currentQuestion: currentQ,
      shouldContinue: true,
      response: smartResponse,
    };
  }

  // Rule 5: NEXT — advance to next question or complete
  if (isLastQuestion) {
    return {
      followupCount: 0,
      currentQuestion: currentQ + 1,
      shouldContinue: false,
      status: 'COMPLETED',
      response: `${smartResponse}\n\n${closing}`,
    };
  }

  return {
    followupCount: 0,
    currentQuestion: currentQ + 1,
    shouldContinue: true,
    response: smartResponse,
  };
}

function buildFallbackResponse(
  content: TemplateContent,
  currentQ: number,
  newResponses: NewResponses
): Partial<InterviewState> & NodeOutput {
  const nextQuestion = content.questions[currentQ + 1];
  const isLastQuestion = currentQ >= content.questions.length - 1;

  if (isLastQuestion) {
    return {
      responses: newResponses,
      currentQuestion: currentQ + 1,
      followupCount: 0,
      shouldContinue: false,
      response: content.closingMessage || DEFAULT_CLOSING_MESSAGE,
    };
  }

  return {
    responses: newResponses,
    currentQuestion: currentQ + 1,
    followupCount: 0,
    shouldContinue: !!nextQuestion,
    response: nextQuestion || DEFAULT_CLOSING_MESSAGE,
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

    const handled = smartResult.shouldEndInterview
      ? routeAction('END', state.followupCount, state.maxFollowups, currentQ, content.questions.length, smartResult.response, content.closingMessage)
      : routeAction(smartResult.action, state.followupCount, state.maxFollowups, currentQ, content.questions.length, smartResult.response, content.closingMessage);

    return {
      responses: newResponses,
      ...handled,
    };
  } catch (e) {
    info('Smart response generation failed, falling back to next question', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return buildFallbackResponse(content, currentQ, newResponses);
}
