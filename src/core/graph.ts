import { AnalysisService } from '../services/analysis.service.js';
import { PlanCompletionService } from '../services/plan-completion.service.js';
import { getDb } from '../utils/db.js';
import { error, info } from '../utils/logger.js';
import type { PrismaClient } from '../utils/prisma-client.js';
import { interviewingNode } from './nodes/interviewing.js';
import { planningNode } from './nodes/planning.js';
import { DEFAULT_CLOSING_MESSAGE, type InterviewState, type NodeInput } from './types/index.js';

export interface GraphResult {
  response: string;
  nextState: InterviewState;
}

/**
 * How the turn was reached. `firstTurn` is decided by the caller from the state
 * it loaded, *before* it flips the status to `PROCESSING` for two-phase
 * persistence.
 *
 * This must not be inferred from `initialState.status`: the caller persists
 * `PROCESSING` before the graph runs, so a first message would arrive with
 * `PROCESSING` and skip `planningNode` entirely — the greeting never rendered
 * and the opening message was stored as the answer to question 1.
 */
export interface GraphRunOptions {
  firstTurn?: boolean;
}

/** States in which user input is processed. Anything else is a no-op turn. */
const PROCESSABLE_STATUSES = new Set(['ACTIVE', 'WAITING', 'PROCESSING']);

function mergeState(state: InterviewState, update: Partial<InterviewState>): InterviewState {
  return { ...state, ...update };
}

/** Kick off report generation without blocking the reply. */
function scheduleAnalysis(interviewId: string | undefined, prisma?: PrismaClient): void {
  if (!interviewId) return;
  setImmediate(() => {
    const analysisService = new AnalysisService(prisma || getDb());
    analysisService.analyzeInterview(interviewId).catch((e) => {
      error('Async analysis failed', {
        interviewId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  });
}

/**
 * Re-evaluate the interview's plan once the interview finishes (issue #202).
 *
 * Fire-and-forget, and deliberately a separate `setImmediate` from
 * `scheduleAnalysis`: plan completion only cares that the interview reached
 * COMPLETED, so report generation failing must not also abort the plan
 * bookkeeping (and vice versa). `getDb()` is called *inside* the try because it
 * throws synchronously when DATABASE_URL is missing — an uncaught throw there
 * would escape the deferred callback and take the process down mid-turn.
 */
function schedulePlanCompletion(interviewId: string | undefined, prisma?: PrismaClient): void {
  if (!interviewId) return;
  setImmediate(() => {
    try {
      new PlanCompletionService(prisma || getDb())
        .reconcileAfterInterviewCompleted(interviewId)
        .catch((e) => {
          error('Plan completion failed', {
            interviewId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
    } catch (e) {
      error('Plan completion failed', {
        interviewId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

export async function runInterviewGraph(
  initialState: InterviewState,
  input: NodeInput,
  prisma?: PrismaClient,
  options: GraphRunOptions = {}
): Promise<GraphResult> {
  // Phase 1: Initialize (only on the first turn). `options.firstTurn` is the
  // authoritative signal; the status check stays as a fallback for callers that
  // hand over a genuinely PENDING state.
  const isFirstTurn = options.firstTurn ?? initialState.status === 'PENDING';
  if (isFirstTurn) return runPlanningTurn(initialState, prisma);

  // Guard: skip non-active states
  if (!PROCESSABLE_STATUSES.has(initialState.status)) return noOpTurn(initialState);

  // Phase 2: Process user input
  const content = input.content?.trim();
  if (!content) return emptyMessageTurn(initialState);

  return runInterviewingTurn(initialState, content, prisma);
}

/** A turn that returns `state` unchanged with a canned reply. */
function noOpTurn(state: InterviewState, response = DEFAULT_CLOSING_MESSAGE): GraphResult {
  return { response, nextState: state };
}

/** The greeting turn: `planningNode` asks the first question. */
async function runPlanningTurn(state: InterviewState, prisma?: PrismaClient): Promise<GraphResult> {
  const result = await planningNode(state, prisma);
  return {
    response: result.response || DEFAULT_CLOSING_MESSAGE,
    nextState: mergeState(state, result),
  };
}

/**
 * A message-less turn, answered with an explicit prompt.
 *
 * Not a no-op: returning the state unchanged would leave the caller believing a
 * turn was processed, while the user saw nothing. The prompt is a fixed string
 * because this path has no state to personalise from -- it is reached when the
 * content was blank, so there is nothing to respond TO.
 */
function emptyMessageTurn(state: InterviewState): GraphResult {
  return noOpTurn(state, '请发送消息开始访谈。');
}

/** The answering turn: `interviewingNode` scores the input and asks the next question. */
async function runInterviewingTurn(
  state: InterviewState,
  content: string,
  prisma?: PrismaClient
): Promise<GraphResult> {
  const result = await interviewingNode(state, {
    content,
    ...(prisma != null ? { prisma } : {}),
  });
  const nextState = mergeState(state, result);

  info('[DIAG] interviewingNode result', {
    status: nextState.status,
    shouldContinue: result.shouldContinue,
    currentQ: nextState.currentQuestion,
    responsePreview: (result.response || '').substring(0, 50),
  });

  if (result.shouldContinue === false) {
    scheduleAnalysis(state.interviewId, prisma);
    schedulePlanCompletion(state.interviewId, prisma);
  }

  return {
    response: result.response || DEFAULT_CLOSING_MESSAGE,
    nextState,
  };
}
