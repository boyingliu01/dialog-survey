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

  try {
    info('Starting analysis', { interviewId: state.interviewId });

    const analysisService = new AnalysisService();
    const result = await analysisService.analyzeInterview(state.interviewId);

    info('Analysis completed', {
      interviewId: state.interviewId,
      keyFindingsCount: result.report.keyFindings.length,
    });

    const summary =
      result.report.keyFindings.length > 0
        ? `\n\n关键发现：\n${result.report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
        : '';

    return {
      status: 'COMPLETED',
      reportGenerated: true,
      response: `访谈已完成，感谢您的参与！${summary}`,
      shouldContinue: false,
    };
  } catch (e) {
    error('Analysis failed', {
      interviewId: state.interviewId,
      error: e instanceof Error ? e.message : String(e),
    });

    return {
      status: 'COMPLETED',
      reportGenerated: false,
      response: '访谈已完成，感谢您的参与！报告生成遇到问题，请稍后查看。',
      shouldContinue: false,
    };
  }
}
