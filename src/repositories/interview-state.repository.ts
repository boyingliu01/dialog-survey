import { PrismaClient, InterviewStatus } from '@prisma/client';
import type { InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';

export class StatePersistenceError extends Error {
  constructor(
    message: string,
    public readonly code: 'VERSION_CONFLICT' | 'TRANSACTION_ERROR' | 'NOT_FOUND',
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'StatePersistenceError';
  }
}

export interface SaveStateOptions {
  interviewId: string;
  state: InterviewState;
  version: number;
}

export interface LoadStateOptions {
  interviewId: string;
  userId: string;
}

const MAX_RETRIES = 3;

export class InterviewStateRepository {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Save interview state with optimistic locking
   * Uses version field to prevent dirty writes
   */
  async saveState(options: SaveStateOptions, retryCount = 0): Promise<void> {
    const { interviewId, state, version } = options;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Check current version
        const interview = await tx.interview.findUnique({
          where: { id: interviewId },
        });

        if (!interview) {
          throw new StatePersistenceError(
            `Interview not found: ${interviewId}`,
            'NOT_FOUND',
            false
          );
        }

        if (interview.version !== version) {
          throw new StatePersistenceError(
            `Version conflict: expected ${version}, got ${interview.version}`,
            'VERSION_CONFLICT',
            true
          );
        }

        // Update state with version increment
        await tx.interview.update({
          where: { id: interviewId, version },
          data: {
            status: state.status as InterviewStatus,
            currentQuestion: state.currentQuestion,
            followupCount: state.followupCount,
            version: { increment: 1 },
            messages: {
              deleteMany: { interviewId },
              create: state.messages.map((m) => ({
                role: m.role,
                content: m.content,
                isVoice: false,
              })),
            },
            responses: {
              deleteMany: { interviewId },
              create: state.responses.map((r) => ({
                questionId: r.questionId,
                content: r.content,
                isFollowup: r.isFollowup,
              })),
            },
          },
        });
      });

      info('State saved successfully', { interviewId, version });
    } catch (err) {
      if (err instanceof StatePersistenceError) {
        if (err.retryable && retryCount < MAX_RETRIES) {
          info('Retrying state save', {
            interviewId,
            retryCount: retryCount + 1,
          });
          return this.saveState(options, retryCount + 1);
        }
        if (err.code === 'VERSION_CONFLICT') {
          error('Optimistic lock conflict', { interviewId, version });
          throw err;
        }
      }
      error('Failed to save state', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new StatePersistenceError('Failed to save state', 'TRANSACTION_ERROR', false);
    }
  }

  /**
   * Load interview state from database
   */
  async loadState(options: LoadStateOptions): Promise<InterviewState | null> {
    const { interviewId, userId } = options;

    try {
      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          responses: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!interview || interview.userId !== userId) {
        return null;
      }

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
        currentQuestion: interview.currentQuestion,
        followupCount: interview.followupCount,
        maxFollowups: interview.maxFollowups,
        responses: interview.responses.map((r) => ({
          questionId: r.questionId,
          content: r.content,
          isFollowup: r.isFollowup,
        })),
        reportGenerated: !!interview.reportPath,
      };
    } catch (err) {
      error('Failed to load state', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Create new interview with initial state
   */
  async createInterview(userId: string, templateId: string): Promise<string> {
    const interview = await this.prisma.interview.create({
      data: {
        userId,
        templateId,
        status: 'PENDING',
        version: 1,
      },
    });
    return interview.id;
  }

  /**
   * Get interview version for optimistic locking
   */
  async getVersion(interviewId: string): Promise<number> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { version: true },
    });
    return interview?.version || 0;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
