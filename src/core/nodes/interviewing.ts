import {
  addContinuityLeadIn,
  buildForcedNextTransition,
  generateSmartResponse,
} from '../../services/followup.service.js';
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
 *
 * This is the last word before the turn is persisted, so it is also the single
 * place that guarantees the reply and the advanced question index describe the
 * same question. A reply that re-asks the question being left (an over-limit
 * FOLLOWUP keeps the model's follow-up wording) must never travel with a pointer
 * that has already moved on: the interviewee answers what they were shown, and
 * on the next turn that answer is filed under the question after it (#200/#203).
 */
interface RouteActionInput {
  /** Status returned by the LLM for this turn (continue / end / …). */
  initialAction: string;
  /** Follow-ups already spent on the current question. */
  followupCount: number;
  /** Budget for follow-ups on any one question. */
  maxFollowups: number;
  /** Zero-based index of the question being answered. */
  currentQ: number;
  /** How many questions the plan has, used to detect the last one. */
  totalQuestions: number;
  /** The LLM's reply text for this turn. */
  smartResponse: string;
  opts?: {
    closingMessage?: string | undefined;
    shouldEndInterview?: boolean;
    nextQuestion?: string | undefined;
  };
}

function routeAction(input: RouteActionInput): ActionResult {
  const ctx = routeContextOf(input);

  // Ordered dispatch, not a table: the rules are exclusive but the ORDER carries
  // meaning (an explicit END outranks a NEXT that ran off the end), and guards make
  // that precedence readable in one screen.
  if (TERMINAL_ACTIONS.has(ctx.action) || ctx.shouldEndInterview) return completeEarly(ctx);
  if (REASK_ACTIONS.has(ctx.action)) return reaskSameQuestion(ctx);
  if (ctx.isLastQuestion) return completeAfterFinalAnswer(ctx);
  return advanceToNextQuestion(ctx);
}

/**
 * Resolve the inputs and the flags the rules share.
 *
 * The follow-up cap is applied HERE rather than in each rule, so no rule can
 * forget it and an uncooperative model cannot loop on one question forever.
 */
function routeContextOf(input: RouteActionInput): RouteContext {
  const opts = input.opts ?? {};
  const action = enforceFollowupLimit(input.initialAction, input.followupCount, input.maxFollowups);
  return {
    ...input,
    opts,
    action,
    isLastQuestion: input.currentQ >= input.totalQuestions - 1,
    // A FOLLOWUP the cap just rewrote into NEXT carries wording about the question
    // it wanted to re-ask, so it cannot be shown alongside the advanced pointer.
    coercedFromFollowup: action !== input.initialAction,
    closing: opts.closingMessage || DEFAULT_CLOSING_MESSAGE,
    shouldEndInterview: opts.shouldEndInterview ?? false,
  };
}

/** The resolved inputs a rule needs, plus the derived flags they share. */
type RouteContext = Omit<RouteActionInput, 'opts'> & {
  /** Always present here: `routeAction` defaults it before building the context. */
  opts: NonNullable<RouteActionInput['opts']>;
  action: string;
  isLastQuestion: boolean;
  coercedFromFollowup: boolean;
  closing: string;
  shouldEndInterview: boolean;
};

/**
 * Rule 2: end the interview where it stands.
 *
 * `smartResponse` is reused as a lead-in only when the model itself chose END. When
 * `shouldEndInterview` overrode a NEXT action, that text is a transition ("let's
 * move on to...") and pairing it with an ending reads as a promise never kept --
 * the next question it announces is never asked.
 */
function completeEarly(ctx: RouteContext): ActionResult {
  if (!ctx.isLastQuestion) {
    warn('User requested to end interview early (current question not last)', {
      currentQ: ctx.currentQ,
      totalQuestions: ctx.totalQuestions,
      remainingQuestions: ctx.totalQuestions - ctx.currentQ - 1,
    });
  }
  return completionResult(ctx, ctx.currentQ, ctx.action === 'END');
}

/** Rules 3-4: FOLLOWUP and STAY re-ask, so the turn continues without advancing. */
function reaskSameQuestion(ctx: RouteContext): ActionResult {
  return {
    followupCount: ctx.followupCount + 1,
    currentQuestion: ctx.currentQ,
    shouldContinue: true,
    response: ctx.smartResponse,
  };
}

/**
 * Rule 5a: this was the answer to the final question, so the interview completes.
 *
 * The model was told this is the last question, so its text is already a wrap-up
 * and stays as the lead-in. A coerced follow-up is not a wrap-up, so it is
 * replaced by the closing copy instead.
 */
function completeAfterFinalAnswer(ctx: RouteContext): ActionResult {
  return completionResult(ctx, ctx.currentQ + 1, !ctx.coercedFromFollowup);
}

/**
 * Rule 5b: advance to the next question.
 *
 * A coerced follow-up gets `buildForcedNextTransition` rather than being shown
 * beside the advanced pointer, because its wording is about the question it wanted
 * to re-ask.
 */
function advanceToNextQuestion(ctx: RouteContext): ActionResult {
  if (ctx.coercedFromFollowup) {
    warn('Follow-up cap reached, replacing follow-up reply with the next question transition', {
      currentQ: ctx.currentQ,
      nextQ: ctx.currentQ + 1,
      followupCount: ctx.followupCount,
      maxFollowups: ctx.maxFollowups,
    });
    return {
      followupCount: 0,
      currentQuestion: ctx.currentQ + 1,
      shouldContinue: true,
      response: buildForcedNextTransition(ctx.opts.nextQuestion),
    };
  }

  return {
    followupCount: 0,
    currentQuestion: ctx.currentQ + 1,
    shouldContinue: true,
    // The model was told to acknowledge the previous answer before asking the
    // next one, but that compliance measured ~40% on a real interview. A reply
    // that is nothing but the question gets a neutral lead-in; anything with a
    // lead-in already is left exactly as written.
    response: addContinuityLeadIn(ctx.smartResponse, ctx.opts.nextQuestion),
  };
}

/** Build a COMPLETED result, keeping the model's lead-in only for a genuine end. */
function completionResult(
  ctx: RouteContext,
  nextQuestionIndex: number,
  isGenuineEnd: boolean
): ActionResult {
  return {
    followupCount: 0,
    currentQuestion: nextQuestionIndex,
    shouldContinue: false,
    status: 'COMPLETED',
    response: isGenuineEnd ? `${ctx.smartResponse}\n\n${ctx.closing}` : ctx.closing,
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

    const handled = routeAction({
      initialAction: smartResult.action,
      followupCount: state.followupCount,
      maxFollowups: state.maxFollowups,
      currentQ,
      totalQuestions: content.questions.length,
      smartResponse: smartResult.response,
      opts: {
        closingMessage: content.closingMessage,
        shouldEndInterview: smartResult.shouldEndInterview,
        nextQuestion,
      },
    });

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
