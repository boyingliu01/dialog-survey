import { PrismaClient } from '@prisma/client';
import type { InterviewState } from '../core/types/index.js';
import { error, info } from '../utils/logger.js';
import { mapInterviewToInterviewState } from './interview-state-mapper.js';

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

  constructor(prisma: PrismaClient) {
    if (!prisma) {
      throw new Error('PrismaClient is required for InterviewStateRepository');
    }
    this.prisma = prisma;
  }

  async saveState(options: SaveStateOptions, retryCount = 0): Promise<void> {
    const { interviewId, state, version } = options;

    try {
      await this.prisma.$transaction(async (tx) => {
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

        await tx.interview.update({
          where: { id: interviewId, version },
          data: {
            status: state.status,
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

  async loadState(options: LoadStateOptions): Promise<InterviewState | null> {
    const { interviewId, userId } = options;
    return this._loadStateWithMessages(interviewId, userId, 'Failed to load state');
  }

  async loadFullState(interviewId: string, userId: string): Promise<InterviewState | null> {
    return this._loadStateWithMessages(interviewId, userId, 'Failed to load full state');
  }

  /** Shared logic for loading state with messages (DRY) */
  private async _loadStateWithMessages(
    interviewId: string,
    userId: string,
    errorMsg: string
  ): Promise<InterviewState | null> {
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

      return mapInterviewToInterviewState(interview);
    } catch (err) {
      error(errorMsg, {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async saveFullState(
    interviewId: string,
    state: InterviewState
  ): Promise<{ success: boolean; newVersion: number }> {
    try {
      const updatedInterview = await this.prisma.$transaction(async (tx) => {
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

        if (interview.version !== state.originalVersion) {
          throw new StatePersistenceError(
            `Version conflict: expected ${state.originalVersion}, got ${interview.version}`,
            'VERSION_CONFLICT',
            true
          );
        }

        if (state.pendingMessages.length > 0) {
          await tx.message.createMany({
            data: state.pendingMessages.map((m) => ({
              interviewId,
              role: m.role,
              content: m.content,
              isVoice: m.isVoice,
            })),
          });
        }

        if (state.pendingResponses.length > 0) {
          await tx.response.createMany({
            data: state.pendingResponses.map((r) => ({
              interviewId,
              questionId: r.questionId,
              content: r.content,
              isFollowup: r.isFollowup,
            })),
          });
        }

        const updated = await tx.interview.update({
          where: { id: interviewId, version: state.originalVersion },
          data: {
            status: state.status,
            currentQuestion: state.currentQuestion,
            followupCount: state.followupCount,
            version: { increment: 1 },
          },
        });

        return updated;
      });

      state.version = updatedInterview.version;
      state.originalVersion = updatedInterview.version;
      state.pendingMessages = [];
      state.pendingResponses = [];

      info('Full state saved successfully', {
        interviewId,
        version: updatedInterview.version,
      });

      return { success: true, newVersion: updatedInterview.version };
    } catch (err) {
      if (err instanceof StatePersistenceError) {
        error('State persistence error', {
          interviewId,
          code: err.code,
          message: err.message,
        });
        throw err;
      }
      error('Failed to save full state', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new StatePersistenceError('Failed to save full state', 'TRANSACTION_ERROR', false);
    }
  }

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

  async getVersion(interviewId: string): Promise<number> {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { version: true },
    });
    return interview?.version || 0;
  }

  async findActiveInterview(userId: string): Promise<InterviewState | null> {
    const interview = await this.prisma.interview.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'WAITING', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!interview) {
      return null;
    }

    return mapInterviewToInterviewState(interview);
  }

  async findCompletedInterview(
    userId: string
  ): Promise<{ completedAt: Date; templateId: string } | null> {
    const interview = await this.prisma.interview.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, templateId: true },
    });
    if (!interview) return null;
    return { completedAt: interview.updatedAt, templateId: interview.templateId };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
