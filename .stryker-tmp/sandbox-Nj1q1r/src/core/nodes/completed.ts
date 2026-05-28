// @ts-nocheck
import { InterviewState, NodeOutput } from '../types/index.js';

export async function completedNode(
  _state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  return {
    status: 'COMPLETED',
    response: '访谈已结束，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！',
    shouldContinue: false,
  };
}
