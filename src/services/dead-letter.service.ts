import { PrismaClient } from '@prisma/client';
import { info } from '../utils/logger.js';

const prisma = new PrismaClient();

export async function recordAnalysisFailure(
  interviewId: string,
  errorType: string,
  errorMessage: string
): Promise<void> {
  try {
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
  } finally {
    await prisma.$disconnect();
  }
}

export async function getFailedAnalyses() {
  try {
    return prisma.analysisFailure.findMany({
      where: { retried: false },
      orderBy: { createdAt: 'asc' },
    });
  } finally {
    await prisma.$disconnect();
  }
}
