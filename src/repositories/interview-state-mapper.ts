import type { InterviewState } from '../core/types/index.js';

/**
 * Maps a Prisma Interview entity (with included messages/responses) to an InterviewState.
 * Duplicated across loadState, loadFullState, and findActiveInterview — extracted for DRY.
 */
export function mapInterviewToInterviewState(interview: {
  userId: string;
  templateId: string;
  id: string;
  status: string;
  currentQuestion: number | null;
  followupCount: number;
  maxFollowups: number;
  nudgeCount: number;
  reportPath: string | null;
  version: number;
  userName?: string | null;
  messages: Array<{
    role: string;
    content: string;
    createdAt: Date;
  }>;
  responses: Array<{
    questionId: string;
    content: string;
    isFollowup: boolean;
  }>;
}): InterviewState {
  return {
    userId: interview.userId,
    templateId: interview.templateId,
    interviewId: interview.id,
    status: interview.status as InterviewState['status'],
    messages: interview.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      timestamp: m.createdAt,
    })),
    currentQuestion: interview.currentQuestion ?? 0,
    followupCount: interview.followupCount,
    maxFollowups: interview.maxFollowups,
    nudgeCount: interview.nudgeCount,
    responses: interview.responses.map((r) => ({
      questionId: r.questionId,
      content: r.content,
      isFollowup: r.isFollowup,
    })),
    reportGenerated: !!interview.reportPath,
    version: interview.version,
    originalVersion: interview.version,
    pendingMessages: [],
    pendingResponses: [],
    userName: interview.userName ?? undefined,
  };
}
