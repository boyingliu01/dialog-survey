// @ts-nocheck
export interface InterviewEntity {
  id: string;
  userId: string;
  templateId: string;
  status: InterviewStatus;
  currentQuestion: number;
  followupCount: number;
  maxFollowups: number;
}

export enum InterviewStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  WAITING = 'WAITING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export function createInterview(params: {
  userId: string;
  templateId: string;
}): InterviewEntity {
  return {
    id: crypto.randomUUID(),
    userId: params.userId,
    templateId: params.templateId,
    status: InterviewStatus.PENDING,
    currentQuestion: 0,
    followupCount: 0,
    maxFollowups: 2,
  };
}
