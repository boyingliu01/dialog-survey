import { InterviewState, NodeOutput } from '../types/index.js';

export async function analyzingNode(
  _state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  return {
    status: 'COMPLETED',
    reportGenerated: true,
    response: '正在生成分析报告...',
    shouldContinue: false,
  };
}
