import { z } from 'zod';

/**
 * InterviewState - 多轮对话完整状态
 *
 * 关键字段说明:
 * - version: 当前数据库版本号 (每次保存后更新)
 * - originalVersion: 加载时的版本号 (用于乐观锁检查，不应被 LangGraph 节点修改)
 * - pendingMessages: 待保存的消息列表 (事务提交前累积)
 * - pendingResponses: 待保存的回复列表 (事务提交前累积)
 */
export const InterviewStateSchema = z.object({
  userId: z.string(),
  templateId: z.string().optional(),
  interviewId: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'WAITING', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  userName: z.string().optional(),
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
  // 多轮对话状态管理字段
  version: z.number().default(1), // 当前数据库版本号 (required for optimistic locking)
  originalVersion: z.number().default(1), // 加载时版本号 (用于乐观锁检查)
  pendingMessages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        isVoice: z.boolean().default(false),
      })
    )
    .default([]), // 待保存消息列表
  pendingResponses: z
    .array(
      z.object({
        questionId: z.string(),
        content: z.string(),
        isFollowup: z.boolean().default(false),
      })
    )
    .default([]), // 待保存回复列表
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
