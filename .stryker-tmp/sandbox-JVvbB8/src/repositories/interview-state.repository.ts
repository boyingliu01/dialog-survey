// @ts-nocheck
import { InterviewStatus, PrismaClient } from '@prisma/client';
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
        version: interview.version,
        originalVersion: interview.version,
        pendingMessages: [],
        pendingResponses: [],
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
   * Load full state for multi-turn conversation with version tracking
   * Initializes pendingMessages and pendingResponses arrays
   */
  async loadFullState(interviewId: string, userId: string): Promise<InterviewState | null> {
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
        version: interview.version,
        originalVersion: interview.version,
        pendingMessages: [],
        pendingResponses: [],
      };
    } catch (err) {
      error('Failed to load full state', {
        interviewId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Save full state with pending messages/responses in atomic transaction
   * Uses originalVersion for optimistic locking check
   * Returns new version after save
   */
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
            status: state.status as InterviewStatus,
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

  /**
   * Find active interview for a user (for multi-turn conversation)
   * Returns the most recent ACTIVE/WAITING interview
   */
  async findActiveInterview(userId: string): Promise<InterviewState | null> {
    const interview = await this.prisma.interview.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'WAITING'] },
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
      version: interview.version,
      originalVersion: interview.version,
      pendingMessages: [],
      pendingResponses: [],
    };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
