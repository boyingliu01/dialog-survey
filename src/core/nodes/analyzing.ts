import { InterviewState, NodeOutput } from '../types/index.js';
import { AnalysisService } from '../../services/analysis.service.js';
import { info, error } from '../../utils/logger.js';

export async function analyzingNode(
  state: InterviewState
): Promise<Partial<InterviewState> & NodeOutput> {
  if (!state.interviewId) {
    return {
      status: 'COMPLETED',
      reportGenerated: false,
      response: '访谈已完成，感谢您的参与！',
      shouldContinue: false,
    };
  }

  const interviewId = state.interviewId;

  setImmediate(async () => {
    try {
      info('Starting async analysis', { interviewId });

      const analysisService = new AnalysisService();
      const result = await analysisService.analyzeInterview(interviewId);

      info('Async analysis completed', {
        interviewId,
        keyFindingsCount: result.report.keyFindings.length,
      });
    } catch (e) {
      error('Async analysis failed', {
        interviewId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return {
    status: 'COMPLETED',
    reportGenerated: true,
    response: '访谈已完成，感谢您的参与！报告生成中，请稍后查看。',
    shouldContinue: false,
  };
}
