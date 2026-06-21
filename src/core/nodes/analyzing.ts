import type { PrismaClient } from '@prisma/client';
import { AnalysisService } from '../../services/analysis.service.js';
import { getDb } from '../../utils/db.js';
import { error, info } from '../../utils/logger.js';
import { InterviewState, NodeOutput } from '../types/index.js';

export async function analyzingNode(
  state: InterviewState,
  prisma?: PrismaClient
): Promise<Partial<InterviewState> & NodeOutput> {
  if (!state.interviewId) {
    return {
      status: 'COMPLETED',
      reportGenerated: false,
      response: '访谈已结束，非常感谢您拨冗参与！',
      shouldContinue: false,
    };
  }

  const interviewId = state.interviewId;

  setImmediate(async () => {
    try {
      info('Starting async analysis', { interviewId });

      const analysisService = new AnalysisService(prisma || getDb());
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
    response: '访谈已完成，非常感谢您拨冗参与！您的分享对我们很有价值，祝您一切顺利！',
    shouldContinue: false,
  };
}
