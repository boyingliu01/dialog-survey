import { InterviewState, NodeOutput } from '../types/index.js';

export async function completedNode(
  _state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  return {
    status: 'COMPLETED',
    response: '访谈已完成。感谢您的参与！',
    shouldContinue: false,
  };
}
