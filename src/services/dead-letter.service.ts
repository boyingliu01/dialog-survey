import type { PrismaClient } from '@prisma/client';
import { info } from '../utils/logger.js';

export async function recordAnalysisFailure(
  prisma: PrismaClient,
  interviewId: string,
  errorType: string,
  errorMessage: string
): Promise<void> {
  await prisma.analysisFailure.upsert({
    where: {
      interviewId_errorType: { interviewId, errorType },
    },
    create: {
      interviewId,
      errorType,
      errorMessage,
      retried: false,
      retryCount: 0,
    },
    update: {},
  });
  info('Analysis failure recorded', { interviewId, errorType });
}

export async function getFailedAnalyses(prisma: PrismaClient) {
  return prisma.analysisFailure.findMany({
    where: { retried: false },
    orderBy: { createdAt: 'asc' },
  });
}
