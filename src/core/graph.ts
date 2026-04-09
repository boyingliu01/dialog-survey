import { analyzingNode } from './nodes/analyzing.js';
import { completedNode } from './nodes/completed.js';
import { interviewingNode } from './nodes/interviewing.js';
import { planningNode } from './nodes/planning.js';
import { InterviewState, NodeInput, NodeOutput } from './types/index.js';

export async function runInterviewGraph(
  initialState: InterviewState,
  input: NodeInput
): Promise<NodeOutput> {
  let state: InterviewState = { ...initialState };
  let output: NodeOutput = {};

  if (state.status === 'PENDING') {
    const result = await planningNode(state);
    state = { ...state, ...result } as InterviewState;
    output = { ...output, ...result };
  }

  if (input.content) {
    const result = await interviewingNode(state, { content: input.content });
    state = { ...state, ...result } as InterviewState;
    output = { ...output, ...result };
  }

  if (!output.shouldContinue) {
    const result = await analyzingNode(state);
    state = { ...state, ...result } as InterviewState;
    output = { ...output, ...result };

    if (state.status === 'COMPLETED') {
      await completedNode(state);
    }
  }

  return {
    response: output.response,
    shouldContinue: output.shouldContinue,
    nextQuestion: output.nextQuestion,
  };
}
