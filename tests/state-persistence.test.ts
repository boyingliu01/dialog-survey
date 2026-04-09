import { PrismaClient } from '@prisma/client';
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

  describe('loadState', () => {
    it('should return null when interview not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const result = await repository.loadState({
        interviewId: 'invalid-id',
        userId: 'user-1',
      });

      expect(result).toBeNull();
    });

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
    it('should return version number', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue({ version: 5 });

      const version = await repository.getVersion('interview-1');

      expect(version).toBe(5);
    });

    it('should return 0 when not found', async () => {
      mockPrisma.interview.findUnique.mockResolvedValue(null);

      const version = await repository.getVersion('invalid-id');

      expect(version).toBe(0);
    });
  });

  describe('createInterview', () => {
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
          },
          version: 1,
        })
      ).rejects.toThrow(StatePersistenceError);
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
          },
          version: 3,
        })
      ).rejects.toThrow();
    });
  });
});
