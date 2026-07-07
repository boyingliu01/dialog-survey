import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import {
  InterviewStateRepository,
  StatePersistenceError,
} from '../src/repositories/interview-state.repository.js';

const mockInterview = {
  id: 'interview-123',
  userId: 'user-123',
  templateId: 'template-1',
  status: 'ACTIVE',
  version: 5,
  currentQuestion: 2,
  followupCount: 1,
  maxFollowups: 2,
  reportPath: null,
  userName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
  messages: [
    {
      id: 'm1',
      interviewId: 'interview-123',
      role: 'assistant',
      content: 'hello',
      isVoice: false,
      voiceText: null,
      messageId: null,
      createdAt: new Date(),
    },
  ],
  responses: [
    {
      id: 'r1',
      interviewId: 'interview-123',
      questionId: 'q0',
      content: 'answer',
      isFollowup: false,
      createdAt: new Date(),
    },
  ],
};

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    userId: 'user-123',
    templateId: 'template-1',
    interviewId: 'interview-123',
    status: 'ACTIVE',
    messages: [{ role: 'assistant', content: 'hello', timestamp: new Date() }],
    currentQuestion: 2,
    followupCount: 1,
    maxFollowups: 2,
    responses: [{ questionId: 'q0', content: 'answer', isFollowup: false }],
    reportGenerated: false,
    version: 5,
    originalVersion: 5,
    pendingMessages: [],
    pendingResponses: [],
    nudgeCount: 0,
    ...overrides,
  };
}

describe('InterviewStateRepository', () => {
  let repository: InterviewStateRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      interview: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      message: { createMany: vi.fn() },
      response: { createMany: vi.fn() },
      $transaction: vi.fn((cb: (tx: any) => any) => cb(mockPrisma)),
      $disconnect: vi.fn(),
    };
    repository = new InterviewStateRepository(mockPrisma as unknown as PrismaClient);
  });

  describe('constructor', () => {
    it('should throw if no PrismaClient is provided', () => {
      expect(() => new (InterviewStateRepository as any)(undefined)).toThrow(
        'PrismaClient is required for InterviewStateRepository'
      );
      expect(() => new (InterviewStateRepository as any)()).toThrow(
        'PrismaClient is required for InterviewStateRepository'
      );
    });
  });

  describe('saveState', () => {
    it('should save state successfully', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({ ...mockInterview, version: 6 });

      await expect(
        repository.saveState({ interviewId: 'interview-123', state: makeState(), version: 5 })
      ).resolves.toBeUndefined();

      expect(mockPrisma.interview.update).toHaveBeenCalledWith({
        where: { id: 'interview-123', version: 5 },
        data: {
          status: 'ACTIVE',
          currentQuestion: 2,
          followupCount: 1,
          maxFollowups: 2,
          version: { increment: 1 },
          messages: {
            deleteMany: { interviewId: 'interview-123' },
            create: [{ role: 'assistant', content: 'hello', isVoice: false }],
          },
          responses: {
            deleteMany: { interviewId: 'interview-123' },
            create: [{ questionId: 'q0', content: 'answer', isFollowup: false }],
          },
        },
      });
    });

    it('should throw TRANSACTION_ERROR when interview does not exist', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const err = await repository
        .saveState({ interviewId: 'invalid-id', state: makeState(), version: 1 })
        .catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('TRANSACTION_ERROR');
      expect(err.retryable).toBe(false);
    });

    it('should throw VERSION_CONFLICT when version mismatches', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const err = await repository
        .saveState({ interviewId: 'interview-123', state: makeState({ version: 3 }), version: 3 })
        .catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(err.retryable).toBe(true);
    });

    it('should retry on VERSION_CONFLICT up to MAX_RETRIES', async () => {
      const findUnique = vi.fn().mockResolvedValue(mockInterview);
      mockPrisma.interview.findUnique = findUnique;

      const err = await repository
        .saveState({ interviewId: 'interview-123', state: makeState({ version: 3 }), version: 3 })
        .catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('VERSION_CONFLICT');
      // 1 initial + 3 retries = 4 calls
      expect(findUnique).toHaveBeenCalledTimes(4);
    });

    it('should propagate non-StatePersistenceError as TRANSACTION_ERROR', async () => {
      mockPrisma.interview.findUnique.mockRejectedValue(new Error('db connection lost'));

      const err = await repository
        .saveState({ interviewId: 'interview-123', state: makeState(), version: 5 })
        .catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('TRANSACTION_ERROR');
      expect(err.retryable).toBe(false);
    });
  });

  describe('loadState', () => {
    it('should return state when found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const result = await repository.loadState({
        interviewId: 'interview-123',
        userId: 'user-123',
      });

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.currentQuestion).toBe(2);
      expect(result?.messages).toHaveLength(1);
      expect(result?.responses).toHaveLength(1);
    });

    it('should return null when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const result = await repository.loadState({
        interviewId: 'invalid-id',
        userId: 'user-123',
      });

      expect(result).toBeNull();
    });

    it('should return null when userId does not match', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const result = await repository.loadState({
        interviewId: 'interview-123',
        userId: 'wrong-user',
      });

      expect(result).toBeNull();
    });

    it('should return null on Prisma error', async () => {
      mockPrisma.interview.findUnique.mockRejectedValue(new Error('db error'));

      const result = await repository.loadState({
        interviewId: 'interview-123',
        userId: 'user-123',
      });

      expect(result).toBeNull();
    });
  });

  describe('loadFullState', () => {
    it('should return state with messages and responses', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const result = await repository.loadFullState('interview-123', 'user-123');

      expect(result).not.toBeNull();
      expect(result?.messages).toHaveLength(1);
      expect(result?.responses).toHaveLength(1);
      expect(result?.version).toBe(5);
    });

    it('should return null when not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const result = await repository.loadFullState('invalid-id', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('saveFullState', () => {
    it('should save full state and return success with newVersion', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({ ...mockInterview, version: 6 });

      const state = makeState({
        pendingMessages: [{ role: 'user' as const, content: 'new message', isVoice: false }],
        pendingResponses: [{ questionId: 'q1', content: 'new answer', isFollowup: false }],
      });

      const result = await repository.saveFullState('interview-123', state);

      expect(result).toEqual({ success: true, newVersion: 6 });
      expect(mockPrisma.message.createMany).toHaveBeenCalledWith({
        data: [
          { interviewId: 'interview-123', role: 'user', content: 'new message', isVoice: false },
        ],
      });
      expect(mockPrisma.response.createMany).toHaveBeenCalledWith({
        data: [
          {
            interviewId: 'interview-123',
            questionId: 'q1',
            content: 'new answer',
            isFollowup: false,
          },
        ],
      });
      expect(state.version).toBe(6);
      expect(state.originalVersion).toBe(6);
      expect(state.pendingMessages).toHaveLength(0);
      expect(state.pendingResponses).toHaveLength(0);
    });

    it('should throw NOT_FOUND when interview does not exist', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const err = await repository.saveFullState('invalid-id', makeState()).catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.retryable).toBe(false);
    });

    it('should throw VERSION_CONFLICT when originalVersion mismatches', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);

      const state = makeState({ originalVersion: 3 });

      const err = await repository.saveFullState('interview-123', state).catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('VERSION_CONFLICT');
      expect(err.retryable).toBe(true);
    });

    it('should skip createMany when no pending messages or responses', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(mockInterview);
      mockPrisma.interview.update.mockResolvedValue({ ...mockInterview, version: 6 });

      await repository.saveFullState('interview-123', makeState());

      expect(mockPrisma.message.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.response.createMany).not.toHaveBeenCalled();
    });

    it('should wrap non-StatePersistenceError as TRANSACTION_ERROR', async () => {
      mockPrisma.interview.findUnique.mockRejectedValue(new Error('db error'));

      const err = await repository.saveFullState('interview-123', makeState()).catch((e) => e);

      expect(err).toBeInstanceOf(StatePersistenceError);
      expect(err.code).toBe('TRANSACTION_ERROR');
    });
  });

  describe('createInterview', () => {
    it('should create interview and return id', async () => {
      mockPrisma.interview.create.mockResolvedValue({ id: 'new-id' });

      const id = await repository.createInterview('user-123', 'template-1');

      expect(id).toBe('new-id');
      expect(mockPrisma.interview.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          templateId: 'template-1',
          status: 'PENDING',
          version: 1,
        },
      });
    });
  });

  describe('getVersion', () => {
    it('should return version number', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({ version: 5 });

      const version = await repository.getVersion('interview-123');

      expect(version).toBe(5);
    });

    it('should return 0 when not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const version = await repository.getVersion('invalid-id');

      expect(version).toBe(0);
    });
  });

  describe('findActiveInterview', () => {
    it('should return state when active interview found', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(mockInterview);

      const result = await repository.findActiveInterview('user-123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.status).toBe('ACTIVE');
      expect(mockPrisma.interview.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: { in: ['ACTIVE', 'PROCESSING', 'WAITING', 'PENDING'] },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          responses: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    it('should return null when no active interview', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);

      const result = await repository.findActiveInterview('user-123');

      expect(result).toBeNull();
    });
  });

  describe('findCompletedInterview', () => {
    /**
     * @test bugfix-findCompletedInterview-returns-completed
     * @intent 验证findCompletedInterview能找到COMPLETED状态的访谈，
     *        返回updatedAt和templateId用于冷却期检查
     */
    it('should return completed interview with updatedAt and templateId', async () => {
      const completedInterview = {
        ...mockInterview,
        status: 'COMPLETED',
        updatedAt: new Date('2026-06-25T10:00:00Z'),
        templateId: 'template-42',
      };
      mockPrisma.interview.findFirst.mockResolvedValue(completedInterview);

      const result = await repository.findCompletedInterview('user-123');

      expect(result).not.toBeNull();
      expect(result?.completedAt).toEqual(new Date('2026-06-25T10:00:00Z'));
      expect(result?.templateId).toBe('template-42');
      expect(mockPrisma.interview.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-123', status: 'COMPLETED' },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, templateId: true },
      });
    });

    /**
     * @test bugfix-findCompletedInterview-returns-null
     * @intent 验证无COMPLETED访谈时返回null（不阻塞新访谈创建）
     */
    it('should return null when no completed interview exists', async () => {
      mockPrisma.interview.findFirst.mockResolvedValue(null);

      const result = await repository.findCompletedInterview('user-123');

      expect(result).toBeNull();
    });

    /**
     * @test bugfix-findCompletedInterview-respects-order
     * @intent 验证有多个COMPLETED访谈时返回最新的一个（by updatedAt desc）
     */
    it('should return most recent completed interview', async () => {
      const newer = {
        ...mockInterview,
        id: 'interview-newer',
        status: 'COMPLETED',
        updatedAt: new Date('2026-06-25T12:00:00Z'),
        templateId: 'template-new',
      };
      mockPrisma.interview.findFirst.mockResolvedValue(newer);

      const result = await repository.findCompletedInterview('user-123');

      expect(result?.completedAt).toEqual(new Date('2026-06-25T12:00:00Z'));
      expect(result?.templateId).toBe('template-new');
    });
  });
});
