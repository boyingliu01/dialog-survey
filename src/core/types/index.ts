import { z } from 'zod';

export const InterviewStateSchema = z.object({
  userId: z.string(),
  templateId: z.string().optional(),
  interviewId: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      timestamp: z.date().optional(),
    })
  ),
  currentQuestion: z.number().default(0),
  followupCount: z.number().default(0),
  maxFollowups: z.number().default(2),
  responses: z.array(
    z.object({
      questionId: z.string(),
      content: z.string(),
      isFollowup: z.boolean().default(false),
    })
  ),
  reportGenerated: z.boolean().default(false),
});

export type InterviewState = z.infer<typeof InterviewStateSchema>;

export interface NodeInput {
  userId: string;
  content: string;
  isVoice: boolean;
}

export interface NodeOutput {
  response?: string;
  shouldContinue?: boolean;
  nextQuestion?: string;
}
