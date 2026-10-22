import { AnalysisService } from '../services/analysis.service.js';
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
  if (isFirstTurn) {
    const result = await planningNode(initialState, prisma);
    return {
      response: result.response || DEFAULT_CLOSING_MESSAGE,
      nextState: mergeState(initialState, result),
    };
  }

  // Guard: skip non-active states
  if (!PROCESSABLE_STATUSES.has(initialState.status)) {
    return {
      response: DEFAULT_CLOSING_MESSAGE,
      nextState: initialState,
    };
  }

  // Phase 2: Process user input
  if (!input.content?.trim()) {
    // Empty message guard
    return { response: '请发送消息开始访谈。', nextState: initialState };
  }

  const result = await interviewingNode(initialState, {
    content: input.content,
    ...(prisma != null ? { prisma } : {}),
  });

  const nextState = mergeState(initialState, result);

  info('[DIAG] interviewingNode result', {
    status: nextState.status,
    shouldContinue: result.shouldContinue,
    currentQ: nextState.currentQuestion,
    responsePreview: (result.response || '').substring(0, 50),
  });

  // If interview completed, trigger async analysis (fire-and-forget)
  if (result.shouldContinue === false) {
    scheduleAnalysis(initialState.interviewId, prisma);
  }

  return {
    response: result.response || DEFAULT_CLOSING_MESSAGE,
    nextState,
  };
}
