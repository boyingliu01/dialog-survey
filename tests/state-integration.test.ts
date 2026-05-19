import { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import {
  InterviewStateRepository,
  StatePersistenceError,
} from '../src/repositories/interview-state.repository.js';
import type { InterviewState } from '../src/core/types/index.js';

describe('InterviewStateRepository - Missing Coverage Tests', () => {
  let repository: InterviewStateRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((callback) => callback(mockPrisma)),
      interview: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
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

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadFullState', () => {
    /**
     * @test extended-loadFullState-exists
     * @intent 验证当访谈存在时loadFullState方法能正确加载状态
     */
    it('should return state when interview exists', async () => {
      const mockInterview = {
        id: 'interview-1',
        userId: 'test-user-1',
        templateId: 'template-1',
        status: 'ACTIVE',
        currentQuestion: 1,
        followupCount: 2,
        maxFollowups: 2,
        version: 3,
        messages: [{ role: 'user', content: 'Hello', createdAt: new Date() }],
        responses: [{ questionId: 'q1', content: 'Answer 1', isFollowup: false }],
        reportPath: null,
      };
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const result = await repository.loadFullState('interview-1', 'test-user-1');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('test-user-1');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.version).toBe(3);
      expect(Array.isArray(result?.pendingMessages)).toBe(true);
      expect(Array.isArray(result?.pendingResponses)).toBe(true);
      expect(result?.pendingMessages).toEqual([]);
      expect(result?.pendingResponses).toEqual([]);
    });

    /**
     * @test extended-loadFullState-not-found
     * @intent 验证当访谈不存在时loadFullState方法返回null
     */
    it('should return null when interview does not exist', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const result = await repository.loadFullState('non-existing-id', 'test-user-1');

      expect(result).toBeNull();
    });

    /**
     * @test extended-loadFullState-mismatch
     * @intent 验证当用户ID不匹配时loadFullState方法返回null
     */
    it('should return null when userId does not match', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        userId: 'different-user',
        templateId: 'template-1',
        status: 'ACTIVE',
        currentQuestion: 1,
        followupCount: 2,
        maxFollowups: 2,
        version: 3,
        messages: [],
        responses: [],
        reportPath: null,
      });

      const result = await repository.loadFullState('interview-1', 'test-user-1');

      expect(result).toBeNull();
    });
  });

  describe('saveFullState', () => {
    /**
     * @test extended-saveFullState-with-pending-messages
     * @intent 验证saveFullState能正确处理pendingMessages
     */
    it('should handle pendingMessages properly', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'existing-interview',
        version: 1,
      });
      mockPrisma.interview.update.mockResolvedValue({
        id: 'existing-interview',
        version: 2,
      });

      const mockState: InterviewState = {
        userId: 'test-user-1',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [
          {
            role: 'user',
            content: 'New message pending',
            isVoice: false,
          },
        ],
        pendingResponses: [],
        interviewId: 'existing-interview',
        templateId: 'test-template',
      };

      const result = await repository.saveFullState('existing-interview', mockState);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
      expect(mockPrisma.message.createMany).toHaveBeenCalledWith({
        data: [
          {
            interviewId: 'existing-interview',
            role: 'user',
            content: 'New message pending',
            isVoice: false,
          },
        ],
      });
      expect(mockState.pendingMessages).toEqual([]); // Cleared after save
    });

    /**
     * @test extended-saveFullState-with-pending-responses
     * @intent 验证saveFullState能正确处理pendingResponses
     */
    it('should handle pendingResponses properly', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'existing-interview',
        version: 1,
      });
      mockPrisma.interview.update.mockResolvedValue({
        id: 'existing-interview',
        version: 2,
      });

      const mockState: InterviewState = {
        userId: 'test-user-1',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 2,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [
          {
            questionId: 'q1',
            content: 'Pending response',
            isFollowup: false,
          },
        ],
        interviewId: 'existing-interview',
        templateId: 'test-template',
      };

      const result = await repository.saveFullState('existing-interview', mockState);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);
      expect(mockPrisma.response.createMany).toHaveBeenCalledWith({
        data: [
          {
            interviewId: 'existing-interview',
            questionId: 'q1',
            content: 'Pending response',
            isFollowup: false,
          },
        ],
      });
      expect(mockState.pendingResponses).toEqual([]); // Cleared after save
    });

    /**
     * @test extended-saveFullState-with-two-way-conflict
     * @intent 验证saveFullState在版本不匹配时抛出错误
     */
    it('should throw VERSION_CONFLICT when version mismatches', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'existing-interview',
        version: 5, // different from expected
      });

      const mockState: InterviewState = {
        userId: 'test-user-1',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 5,
        originalVersion: 1, // this mismatches what's in DB (should be 5)
        pendingMessages: [],
        pendingResponses: [],
        interviewId: 'existing-interview',
        templateId: 'test-template',
      };

      await expect(repository.saveFullState('existing-interview', mockState)).rejects.toThrow(
        StatePersistenceError
      );
    });
  });

  describe('findActiveInterview', () => {
    /**
     * @test extended-findActiveInterview-finds-active
     * @intent 验证findActiveInterview找到ACTIVE访谈
     */
    it('should find ACTIVE status interview for user', async () => {
      const mockInterview = {
        id: 'active-interview',
        userId: 'test-user-1',
        templateId: 'template-1',
        status: 'ACTIVE',
        currentQuestion: 1,
        followupCount: 2,
        maxFollowups: 2,
        version: 3,
        messages: [{ role: 'user', content: 'Hello', createdAt: new Date() }],
        responses: [{ questionId: 'q1', content: 'Answer 1', isFollowup: false }],
        reportPath: null,
      };
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);

      const result = await repository.findActiveInterview('test-user-1');

      expect(result).not.toBeNull();
      expect(result?.interviewId).toBe('active-interview');
      expect(result?.status).toBe('ACTIVE');
    });

    /**
     * @test extended-findActiveInterview-finds-waiting
     * @intent 验证findActiveInterview找到WAITING访谈
     */
    it('should find WAITING status interview for user', async () => {
      const mockInterview = {
        id: 'waiting-interview',
        userId: 'test-user-1',
        templateId: 'template-1',
        status: 'WAITING',
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        version: 1,
        messages: [],
        responses: [],
        reportPath: null,
      };
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);

      const result = await repository.findActiveInterview('test-user-1');

      expect(result).not.toBeNull();
      expect(result?.interviewId).toBe('waiting-interview');
      expect(result?.status).toBe('WAITING');
    });

    /**
     * @test extended-findActiveInterview-returns-null-if-none
     * @intent 验证findActiveInterview在无活跃访谈时返回null
     */
    it('should return null when no active interview exists', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);

      const result = await repository.findActiveInterview('test-user-1');

      expect(result).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should call prisma disconnect', async () => {
      await repository.disconnect();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('version conflict retries and errors in saveState', () => {
    /**
     * @test extended-saveState-max-retry-reached
     * @intent 验证版本冲突的最大重试次数机制
     */
    it('should retry on version conflict up to MAX_RETRIES then error', async () => {
      mockPrisma.interview.findUnique.mockImplementation(() => {
        return Promise.resolve({ id: 'existing-interview', version: 5 }); // higher than expected
      });

      const mockState: InterviewState = {
        userId: 'test-user-1',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 5,
        originalVersion: 1, // doesn't match DB
        pendingMessages: [],
        pendingResponses: [],
        interviewId: 'existing-interview',
        templateId: 'test-template',
      };

      await expect(
        repository.saveState({
          interviewId: 'existing-interview',
          state: mockState,
          version: 1,
        })
      ).rejects.toThrow(StatePersistenceError);

      // Verify retry behavior (1 initial + 3 retries max)
      expect(mockPrisma.interview.findUnique).toHaveBeenCalledTimes(4);
    });

    /**
     * @test extended-saveState-transaction-error-handling
     * @intent 验证事务错误被正确处理
     */
    it('should handle transaction errors appropriately', async () => {
      const unexpectedError = new Error('Database failure');

      mockPrisma.$transaction.mockImplementationOnce(() => {
        throw unexpectedError;
      });

      const mockState: InterviewState = {
        userId: 'test-user-1',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        responses: [],
        reportGenerated: false,
        version: 1,
        originalVersion: 1,
        pendingMessages: [],
        pendingResponses: [],
        interviewId: 'existing-interview',
        templateId: 'test-template',
      };

      await expect(
        repository.saveState({
          interviewId: 'existing-interview',
          state: mockState,
          version: 1,
        })
      ).rejects.to.be.instanceOf(StatePersistenceError);

      try {
        await repository.saveState({
          interviewId: 'existing-interview',
          state: mockState,
          version: 1,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(StatePersistenceError);
        if (error instanceof StatePersistenceError) {
          expect(error.code).toBe('TRANSACTION_ERROR');
          expect(error.retryable).toBe(false);
        }
      }
    });
  });
});
