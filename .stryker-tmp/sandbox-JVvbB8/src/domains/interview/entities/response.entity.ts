// @ts-nocheck
export interface ResponseEntity {
  id: string;
  interviewId: string;
  questionId: string;
  content: string;
  isFollowup: boolean;
  followupDepth: number;
  createdAt: Date;
}

export function createResponse(params: {
  interviewId: string;
  questionId: string;
  content: string;
  isFollowup?: boolean;
  followupDepth?: number;
}): ResponseEntity {
  return {
    id: crypto.randomUUID(),
    interviewId: params.interviewId,
    questionId: params.questionId,
    content: params.content,
    isFollowup: params.isFollowup || false,
    followupDepth: params.followupDepth || 0,
    createdAt: new Date(),
  };
}
