import { generateSmartResponse } from '../../services/followup.service.js';
import { info, warn } from '../../utils/logger.js';
import type { PrismaClient } from '../../utils/prisma-client.js';
import {
  DEFAULT_CLOSING_MESSAGE,
  type InterviewState,
  type NodeOutput,
  type TemplateContent,
} from '../types/index.js';
import { loadTemplateContent } from './template-utils.js';

type ResponseEntry = {
  questionId: string;
  content: string;
  isFollowup: boolean;
  // `| undefined` is explicit because `exactOptionalPropertyTypes` is on and the
  // schema's field is optional (states persisted before it existed lack the key).
  followupDepth?: number | undefined;
};
type NewResponses = ResponseEntry[];

interface ActionResult {
  followupCount: number;
  currentQuestion: number;
  shouldContinue: boolean;
  status?: InterviewState['status'];
  response: string;
}

/** Actions that re-ask the current question and burn one follow-up slot. */
const REASK_ACTIONS = new Set(['FOLLOWUP', 'STAY']);

/** Actions that end the interview regardless of position. */
const TERMINAL_ACTIONS = new Set(['END', 'shouldEndInterview']);

/**
 * Rule 1: enforce the follow-up cap. A FOLLOWUP past the limit degrades to
 * NEXT; STAY is left alone because it always re-asks by design.
 */
function enforceFollowupLimit(action: string, followupCount: number, maxFollowups: number): string {
  const overLimit = followupCount >= maxFollowups;
  if (action === 'FOLLOWUP' && overLimit) return 'NEXT';
  return action;
}

/**
 * Re-route the model's action once the follow-up cap is known.
 *
 * `shouldEndInterview` is passed alongside `initialAction` rather than folded into
 * it: the model's wording was written for the action it chose, so overwriting the
 * action with 'END' (the old approach) lost the only record of what the text
 * actually means.
 */
function routeAction(
  initialAction: string,
  followupCount: number,
  maxFollowups: number,
  currentQ: number,
  totalQuestions: number,
  smartResponse: string,
  closingMessage?: string,
  shouldEndInterview = false
): ActionResult {
  const isLastQuestion = currentQ >= totalQuestions - 1;
  const closing = closingMessage || DEFAULT_CLOSING_MESSAGE;

  // Two ways to finish: an explicit END keeps the pointer where it was, while a
  // NEXT that runs off the end advances past the final question.
  //
  // `smartResponse` is only reused as a lead-in when the model actually chose to
  // end. When `shouldEndInterview` overrode a NEXT action, that text is a
  // transition ("let's move on to...") and pairing it with an ending reads as a
  // promise never kept — the next question it announces is never asked.
  const completeAt = (nextQuestionIndex: number, isGenuineEnd: boolean): ActionResult => ({
    followupCount: 0,
    currentQuestion: nextQuestionIndex,
    shouldContinue: false,
    status: 'COMPLETED',
    response: isGenuineEnd ? `${smartResponse}\n\n${closing}` : closing,
  });

  const action = enforceFollowupLimit(initialAction, followupCount, maxFollowups);

  // Rule 2: END / shouldEndInterview — always complete the interview
  if (TERMINAL_ACTIONS.has(action) || shouldEndInterview) {
    if (!isLastQuestion) {
      warn('User requested to end interview early (current question not last)', {
        currentQ,
        totalQuestions,
        remainingQuestions: totalQuestions - currentQ - 1,
      });
    }
    // The lead-in survives only when the model itself said END; an override from
    // `shouldEndInterview` leaves text written for a different action.
    return completeAt(currentQ, action === 'END');
  }

  // Rules 3-4: FOLLOWUP and STAY both re-ask, incrementing the followup counter
  // so an uncooperative model cannot loop forever on the same question.
  if (REASK_ACTIONS.has(action)) {
    return {
      followupCount: followupCount + 1,
      currentQuestion: currentQ,
      shouldContinue: true,
      response: smartResponse,
    };
  }

  // Rule 5: NEXT — advance, or complete when this was the last question.
  // On the final question the model was told this is the last one, so its text is
  // already a wrap-up; keep it as the lead-in.
  if (isLastQuestion) return completeAt(currentQ + 1, true);

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
    {
      questionId: `q${currentQ}`,
      content: input.content,
      // A non-zero followupCount means the previous turn re-asked this question,
      // so this message answers the follow-up, not the question itself. Marking
      // everything `false` made follow-up answers indistinguishable from primary
      // ones in the report and in the export.
      isFollowup: state.followupCount > 0,
      followupDepth: state.followupCount,
    },
  ];

  try {
    const nextQuestion = content.questions[currentQ + 1];
    const smartResult = await generateSmartResponse(
      state,
      input.content,
      currentQuestion,
      nextQuestion,
      content.llmPromptTemplate,
      currentQ >= content.questions.length - 1,
      content.questions.length
    );

    info('Smart response generated', {
      currentQ,
      action: smartResult.action,
      response: smartResult.response.substring(0, 50),
    });

    info('[DIAG] routeAction input', {
      action: smartResult.action,
      shouldEndInterview: smartResult.shouldEndInterview,
      followupCount: state.followupCount,
      maxFollowups: state.maxFollowups,
      currentQ,
      totalQuestions: content.questions.length,
      isLastQuestion: currentQ >= content.questions.length - 1,
    });

    const handled = routeAction(
      smartResult.action,
      state.followupCount,
      state.maxFollowups,
      currentQ,
      content.questions.length,
      smartResult.response,
      content.closingMessage,
      smartResult.shouldEndInterview
    );

    info('[DIAG] routeAction result', {
      handledStatus: handled.status,
      handledShouldContinue: handled.shouldContinue,
      handledCurrentQ: handled.currentQuestion,
    });

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
