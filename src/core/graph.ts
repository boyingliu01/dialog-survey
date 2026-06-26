import type { PrismaClient } from '@prisma/client';
import { AnalysisService } from '../services/analysis.service.js';
import { getDb } from '../utils/db.js';
import { error } from '../utils/logger.js';
import { interviewingNode } from './nodes/interviewing.js';
import { planningNode } from './nodes/planning.js';
import { DEFAULT_CLOSING_MESSAGE, type InterviewState, type NodeInput } from './types/index.js';

export interface GraphResult {
  response: string;
  nextState: InterviewState;
}

function mergeState(state: InterviewState, update: Partial<InterviewState>): InterviewState {
  return { ...state, ...update };
}

export async function runInterviewGraph(
  initialState: InterviewState,
  input: NodeInput,
  prisma?: PrismaClient
): Promise<GraphResult> {
  // Phase 1: Initialize (only on first call)
  if (initialState.status === 'PENDING') {
    const result = await planningNode(initialState, prisma);
    return {
      response: result.response || DEFAULT_CLOSING_MESSAGE,
      nextState: mergeState(initialState, result),
    };
  }

  // Guard: skip non-active states
  if (initialState.status !== 'ACTIVE' && initialState.status !== 'WAITING' && initialState.status !== 'PROCESSING') {
    return {
      response: DEFAULT_CLOSING_MESSAGE,
      nextState: initialState,
    };
  }

  // Phase 2: Process user input
  if (input.content?.trim()) {
    const result = await interviewingNode(initialState, {
      content: input.content,
      ...(prisma != null ? { prisma } : {}),
    });

    const nextState = mergeState(initialState, result);

    // If interview completed, trigger async analysis (fire-and-forget)
    if (result.shouldContinue === false && initialState.interviewId) {
      setImmediate(() => {
        const interviewId = initialState.interviewId;
        if (!interviewId) return;
        const analysisService = new AnalysisService(prisma || getDb());
        analysisService.analyzeInterview(interviewId).catch((e) => {
          error('Async analysis failed', {
            interviewId: initialState.interviewId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      });
    }

    return {
      response: result.response || DEFAULT_CLOSING_MESSAGE,
      nextState,
    };
  }

  // Empty message guard
  return {
    response: '请发送消息开始访谈。',
    nextState: initialState,
  };
}
