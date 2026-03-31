import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterviewRepository, CreateInterviewData } from '../../../src/repositories/interview';
import { prisma } from '../../../src/db';

// Define enums locally since @prisma/client is mocked
const InterviewStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

// Mock Prisma client methods
vi.mock('../../../src/db', () => ({
  prisma: {
    interview: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('InterviewRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new interview', async () => {
      const mockData: CreateInterviewData = {
        sessionId: 'test-session-1',
        userId: 'test-user-1',
        templateId: 'test-template-1',
        topic: 'Test Topic',
      };
      const mockResult = { id: 'test-id-1', ...mockData, status: InterviewStatus.IN_PROGRESS };
      (prisma.interview.create as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.create(mockData);

      expect(prisma.interview.create).toHaveBeenCalledTimes(1);
      expect(prisma.interview.create).toHaveBeenCalledWith({
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findById', () => {
    it('should find an interview by ID', async () => {
      const mockId = 'test-id-1';
      const mockResult = { id: mockId, sessionId: 'test-session-1' };
      (prisma.interview.findUnique as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findById(mockId);

      expect(prisma.interview.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findUnique).toHaveBeenCalledWith({
        where: { id: mockId },
        include: { messages: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findBySessionId', () => {
    it('should find an interview by session ID', async () => {
      const mockSessionId = 'test-session-1';
      const mockResult = { id: 'test-id-1', sessionId: mockSessionId };
      (prisma.interview.findUnique as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findBySessionId(mockSessionId);

      expect(prisma.interview.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findUnique).toHaveBeenCalledWith({
        where: { sessionId: mockSessionId },
        include: { messages: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findByUserId', () => {
    it('should find interviews by user ID', async () => {
      const mockUserId = 'test-user-1';
      const mockResult = [{ id: 'test-id-1', userId: mockUserId }];
      (prisma.interview.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findByUserId(mockUserId);

      expect(prisma.interview.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockResult);
    });

    it('should find interviews by user ID and status', async () => {
      const mockUserId = 'test-user-1';
      const mockStatus = InterviewStatus.COMPLETED;
      const mockResult = [{ id: 'test-id-1', userId: mockUserId, status: mockStatus }];
      (prisma.interview.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findByUserId(mockUserId, mockStatus);

      expect(prisma.interview.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, status: mockStatus },
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findAll', () => {
    it('should find all interviews with default parameters', async () => {
      const mockResult = [{ id: 'test-id-1' }, { id: 'test-id-2' }];
      (prisma.interview.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findAll();

      expect(prisma.interview.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findMany).toHaveBeenCalledWith({
        where: {},
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
        skip: 0,
      });
      expect(result).toEqual(mockResult);
    });

    it('should find all interviews with status and pagination', async () => {
      const mockStatus = InterviewStatus.IN_PROGRESS;
      const mockLimit = 10;
      const mockOffset = 5;
      const mockResult = [{ id: 'test-id-1', status: mockStatus }];
      (prisma.interview.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findAll(mockStatus, mockLimit, mockOffset);

      expect(prisma.interview.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findMany).toHaveBeenCalledWith({
        where: { status: mockStatus },
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
        take: mockLimit,
        skip: mockOffset,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('update', () => {
    it('should update an interview', async () => {
      const mockId = 'test-id-1';
      const mockData = { status: InterviewStatus.COMPLETED, topic: 'Updated Topic' };
      const mockResult = { id: mockId, ...mockData };
      (prisma.interview.update as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.update(mockId, mockData);

      expect(prisma.interview.update).toHaveBeenCalledTimes(1);
      expect(prisma.interview.update).toHaveBeenCalledWith({
        where: { id: mockId },
        data: mockData,
        include: { messages: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('delete', () => {
    it('should delete an interview', async () => {
      const mockId = 'test-id-1';
      (prisma.interview.delete as vi.Mock).mockResolvedValue({ id: mockId });

      await InterviewRepository.delete(mockId);

      expect(prisma.interview.delete).toHaveBeenCalledTimes(1);
      expect(prisma.interview.delete).toHaveBeenCalledWith({
        where: { id: mockId },
      });
    });
  });

  describe('countByStatus', () => {
    it('should count interviews by status', async () => {
      const mockStatus = InterviewStatus.COMPLETED;
      const mockCount = 5;
      (prisma.interview.count as vi.Mock).mockResolvedValue(mockCount);

      const result = await InterviewRepository.countByStatus(mockStatus);

      expect(prisma.interview.count).toHaveBeenCalledTimes(1);
      expect(prisma.interview.count).toHaveBeenCalledWith({
        where: { status: mockStatus },
      });
      expect(result).toEqual(mockCount);
    });
  });

  describe('exists', () => {
    it('should return true if interview exists', async () => {
      const mockId = 'test-id-1';
      (prisma.interview.count as vi.Mock).mockResolvedValue(1);

      const result = await InterviewRepository.exists(mockId);

      expect(prisma.interview.count).toHaveBeenCalledTimes(1);
      expect(prisma.interview.count).toHaveBeenCalledWith({
        where: { id: mockId },
      });
      expect(result).toBe(true);
    });

    it('should return false if interview does not exist', async () => {
      const mockId = 'test-id-1';
      (prisma.interview.count as vi.Mock).mockResolvedValue(0);

      const result = await InterviewRepository.exists(mockId);

      expect(prisma.interview.count).toHaveBeenCalledTimes(1);
      expect(prisma.interview.count).toHaveBeenCalledWith({
        where: { id: mockId },
      });
      expect(result).toBe(false);
    });
  });

  describe('findActiveByUserId', () => {
    it('should find active interview by user ID', async () => {
      const mockUserId = 'test-user-1';
      const mockResult = {
        id: 'test-id-1',
        userId: mockUserId,
        status: InterviewStatus.IN_PROGRESS,
      };
      (prisma.interview.findFirst as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.findActiveByUserId(mockUserId);

      expect(prisma.interview.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.interview.findFirst).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          status: InterviewStatus.IN_PROGRESS,
        },
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null if no active interview found', async () => {
      const mockUserId = 'test-user-1';
      (prisma.interview.findFirst as vi.Mock).mockResolvedValue(null);

      const result = await InterviewRepository.findActiveByUserId(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('updateHistory', () => {
    it('should update conversation history', async () => {
      const mockId = 'test-id-1';
      const mockHistory = { messages: ['hello'] };
      const mockResult = { id: mockId, conversationHistory: mockHistory };
      (prisma.interview.update as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.updateHistory(mockId, mockHistory);

      expect(prisma.interview.update).toHaveBeenCalledTimes(1);
      expect(prisma.interview.update).toHaveBeenCalledWith({
        where: { id: mockId },
        data: { conversationHistory: mockHistory },
        include: { messages: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('complete', () => {
    it('should complete an interview with report', async () => {
      const mockId = 'test-id-1';
      const mockData = {
        report: 'Final report',
        reportPath: '/path/to/report.md',
        extractedInfo: { key: 'value' },
      };
      const mockResult = {
        id: mockId,
        status: InterviewStatus.COMPLETED,
        ...mockData,
      };
      (prisma.interview.update as vi.Mock).mockResolvedValue(mockResult);

      const result = await InterviewRepository.complete(mockId, mockData);

      expect(prisma.interview.update).toHaveBeenCalledTimes(1);
      expect(prisma.interview.update).toHaveBeenCalledWith({
        where: { id: mockId },
        data: {
          status: InterviewStatus.COMPLETED,
          report: mockData.report,
          reportPath: mockData.reportPath,
          extractedInfo: mockData.extractedInfo,
        },
        include: { messages: true },
      });
      expect(result).toEqual(mockResult);
    });
  });
});
