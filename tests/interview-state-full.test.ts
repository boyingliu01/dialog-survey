import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient, InterviewStatus } from '@prisma/client';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';

describe('InterviewStateRepository - saveFullState (完整多轮对话)', () => {
  let repository: InterviewStateRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(),
      interview: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      message: {
        createMany: vi.fn(),
      },
      response: {
        createMany: vi.fn(),
      },
      $disconnect: vi.fn(),
    };
    repository = new InterviewStateRepository(mockPrisma as unknown as PrismaClient);
  });

  describe('saveFullState - 正常保存', () => {
    it('should save state with pendingMessages in a single transaction', async () => {
      const state: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-456',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [
          { role: 'user', content: 'Hello', isVoice: false },
          { role: 'assistant', content: 'Hi there!', isVoice: false },
        ],
        pendingResponses: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          interview: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'interview-456',
              version: 1,
              userId: 'user-123',
            }),
            update: vi.fn().mockResolvedValue({
              id: 'interview-456',
              version: 2,
              status: 'ACTIVE',
            }),
          },
          message: {
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          response: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return callback(mockTx);
      });

      const result = await repository.saveFullState('interview-456', state);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    });

    it('should save pendingResponses in the same transaction', async () => {
      const state: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-456',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 1,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [{ questionId: 'q-1', content: 'Answer 1', isFollowup: true }],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          interview: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'interview-456',
              version: 1,
            }),
            update: vi.fn().mockResolvedValue({ version: 2 }),
          },
          message: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          response: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(mockTx);
      });

      const result = await repository.saveFullState('interview-456', state);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
    });

    it('should clear pendingMessages and pendingResponses after successful save', async () => {
      const state: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-456',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [{ role: 'user', content: 'Test', isVoice: false }],
        pendingResponses: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          interview: {
            findUnique: vi.fn().mockResolvedValue({ version: 1 }),
            update: vi.fn().mockResolvedValue({ version: 2 }),
          },
          message: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          response: {
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return callback(mockTx);
      });

      await repository.saveFullState('interview-456', state);

      expect(state.pendingMessages).toEqual([]);
      expect(state.pendingResponses).toEqual([]);
      expect(state.version).toBe(2);
      expect(state.originalVersion).toBe(2);
    });
  });

  describe('saveFullState - 乐观锁冲突', () => {
    it('should throw VERSION_CONFLICT error when version mismatch', async () => {
      const state: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-456',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [{ role: 'user', content: 'Test', isVoice: false }],
        pendingResponses: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          interview: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'interview-456',
              version: 3,
            }),
          },
        };
        return callback(mockTx);
      });

      await expect(repository.saveFullState('interview-456', state)).rejects.toThrow(
        'Version conflict'
      );
    });
  });

  describe('saveFullState - Interview 不存在', () => {
    it('should throw NOT_FOUND error when interview does not exist', async () => {
      const state: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-456',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          interview: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return callback(mockTx);
      });

      await expect(repository.saveFullState('interview-456', state)).rejects.toThrow(
        'Interview not found'
      );
    });
  });

  describe('loadFullState - 加载状态并初始化 pending 字段', () => {
    it('should load state and initialize pendingMessages/pendingResponses', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-456',
        userId: 'user-123',
        templateId: 'template-1',
        status: 'ACTIVE',
        version: 5,
        currentQuestion: 2,
        followupCount: 1,
        maxFollowups: 2,
        messages: [
          { role: 'user', content: 'Hello', createdAt: new Date() },
          { role: 'assistant', content: 'Hi', createdAt: new Date() },
        ],
        responses: [{ questionId: 'q-1', content: 'Answer', isFollowup: false }],
        reportPath: null,
      });

      const state = await repository.loadFullState('interview-456', 'user-123');

      expect(state).not.toBeNull();
      expect(state?.version).toBe(5);
      expect(state?.originalVersion).toBe(5);
      expect(state?.pendingMessages).toEqual([]);
      expect(state?.pendingResponses).toEqual([]);
      expect(state?.messages.length).toBe(2);
    });

    it('should return null when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const state = await repository.loadFullState('interview-456', 'user-123');

      expect(state).toBeNull();
    });

    it('should return null when userId mismatch', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-456',
        userId: 'other-user',
        version: 1,
      });

      const state = await repository.loadFullState('interview-456', 'user-123');

      expect(state).toBeNull();
    });
  });
});
