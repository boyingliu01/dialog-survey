import type { PrismaClient } from '@prisma/client';
import { analyzingNode } from './nodes/analyzing.js';
import { completedNode } from './nodes/completed.js';
import { interviewingNode } from './nodes/interviewing.js';
import { planningNode } from './nodes/planning.js';
import type { InterviewState, NodeInput, NodeOutput } from './types/index.js';

export interface GraphResult {
  response: string;
  nextState: InterviewState;
}

export async function runInterviewGraph(
  initialState: InterviewState,
  input: NodeInput,
  prisma?: PrismaClient
): Promise<GraphResult> {
  let state: InterviewState = { ...initialState };
  let output: NodeOutput = {};

  if (state.status === 'PENDING') {
    const result = await planningNode(state, prisma);
    state = { ...state, ...result } as InterviewState;
    output = { ...output, ...result };
  }

  if (input.content) {
    const result = await interviewingNode(state, {
      content: input.content,
      ...(prisma != null ? { prisma } : {}),
    });
    state = { ...state, ...result } as InterviewState;
    output = { ...output, ...result };
  }

  if (!output.shouldContinue) {
    const result = await analyzingNode(state, prisma);
    state = { ...state, ...result } as InterviewState;
    // Only use analyzingNode response if no response was set by interviewingNode
    if (!output.response) {
      output = { ...output, ...result };
    }

    if (state.status === 'COMPLETED') {
      await completedNode(state);
    }
  }

  return {
    response: output.response || '访谈已结束，非常感谢您拨冗参与！',
    nextState: state,
  };
}
