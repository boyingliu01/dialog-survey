import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterviewStateRepository,
  StatePersistenceError,
} from '../src/repositories/interview-state.repository.js';

describe('InterviewStateRepository', () => {
  let repository: InterviewStateRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((callback) => callback(mockPrisma)),
      interview: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      $disconnect: vi.fn(),
    };
    repository = new InterviewStateRepository(mockPrisma as unknown as PrismaClient);
  });

  it('should throw if no PrismaClient is provided', () => {
    expect(() => new (InterviewStateRepository as any)(undefined)).toThrow();
    expect(() => new (InterviewStateRepository as any)()).toThrow();
  });

  describe('loadState', () => {
    /**
     * @test REQ-003-9-04
     * @intent 验证加载状态时如果找不到访谈则返回null的情况
     */
    it('should return null when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const result = await repository.loadState({
        interviewId: 'invalid-id',
        userId: 'user-1',
      });

      expect(result).toBeNull();
    });

    /**
     * @test REQ-003-9-02
     * @intent 验证加载状态时如果用户ID不匹配则返回null的情况
     */
    it('should return null when userId does not match', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        userId: 'different-user',
        templateId: 'template-1',
        status: 'PENDING',
        currentQuestion: 0,
        followupCount: 0,
        maxFollowups: 2,
        version: 1,
        messages: [],
        responses: [],
        reportPath: null,
      });

      const result = await repository.loadState({
        interviewId: 'interview-1',
        userId: 'user-1',
      });

      expect(result).toBeNull();
    });

    /**
     * @test REQ-003-9-05
     * @intent 验证加载状态功能正常返回找到的状态
     */
    it('should return state when found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        userId: 'user-1',
        templateId: 'template-1',
        status: 'ACTIVE',
        currentQuestion: 1,
        followupCount: 2,
        maxFollowups: 2,
        version: 3,
        messages: [{ role: 'user', content: 'Hello', createdAt: new Date() }],
        responses: [{ questionId: 'q1', content: 'Answer 1', isFollowup: false }],
        reportPath: null,
      });

      const result = await repository.loadState({
        interviewId: 'interview-1',
        userId: 'user-1',
      });

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-1');
      expect(result?.status).toBe('ACTIVE');
      expect(result?.currentQuestion).toBe(1);
      expect(result?.followupCount).toBe(2);
    });
  });

  describe('getVersion', () => {
    /**
     * @test REQ-003-9-01
     * @intent 验证获取版本号的功能
     */
    it('should return version number', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({ version: 5 });

      const version = await repository.getVersion('interview-1');

      expect(version).toBe(5);
    });

    /**
     * @test REQ-003-9-01
     * @intent 验证在未找到记录时获取版本号返回0
     */
    it('should return 0 when not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const version = await repository.getVersion('invalid-id');

      expect(version).toBe(0);
    });
  });

  describe('createInterview', () => {
    /**
     * @test REQ-003-9-01
     * @intent 验证创建访谈的方法并返回ID的功能
     */
    it('should create interview and return id', async () => {
      mockPrisma.interview.create.mockResolvedValue({ id: 'new-interview-id' });

      const id = await repository.createInterview('user-1', 'template-1');

      expect(id).toBe('new-interview-id');
      expect(mockPrisma.interview.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          templateId: 'template-1',
          status: 'PENDING',
          version: 1,
        },
      });
    });
  });

  describe('saveState', () => {
    /**
     * @test REQ-003-9-03
     * @intent 验证保存状态时如果访谈不存在则抛出NOT_FOUND异常
     */
    it('should throw NOT_FOUND when interview does not exist', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      await expect(
        repository.saveState({
          interviewId: 'invalid-id',
          state: {
            userId: 'user-1',
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
            nudgeCount: 0,
            interviewId: 'invalid-id',
          },
          version: 1,
        })
      ).rejects.toThrow(StatePersistenceError);
    });

    /**
     * @test REQ-003-9-03
     * @intent 验证保存状态时如果版本冲突则抛出VERSION_CONFLICT异常
     */
    it('should throw VERSION_CONFLICT when version mismatches', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        version: 5,
      });

      await expect(
        repository.saveState({
          interviewId: 'interview-1',
          state: {
            userId: 'user-1',
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
            nudgeCount: 0,
            interviewId: 'interview-1',
          },
          version: 3,
        })
      ).rejects.toThrow();
    });

    it('should throw VERSION_CONFLICT when version mismatches', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({
        id: 'interview-1',
        version: 5,
      });

      await expect(
        repository.saveState({
          interviewId: 'interview-1',
          state: {
            userId: 'user-1',
            status: 'ACTIVE',
            messages: [],
            currentQuestion: 0,
            followupCount: 0,
            maxFollowups: 2,
            responses: [],
            reportGenerated: false,
            version: 3,
            originalVersion: 3,
            pendingMessages: [],
            pendingResponses: [],
            nudgeCount: 0,
          },
          version: 3,
        })
      ).rejects.toThrow();
    });
  });
});
