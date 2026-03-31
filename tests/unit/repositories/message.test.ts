import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRepository, CreateMessageData } from '../../../src/repositories/message';
import { prisma } from '../../../src/db';

// Define enums locally since @prisma/client is mocked
const MessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;

// Mock Prisma client methods
vi.mock('../../../src/db', () => ({
  prisma: {
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('MessageRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new message', async () => {
      const mockData: CreateMessageData = {
        interviewId: 'test-interview-1',
        role: MessageRole.USER,
        content: 'Hello, how are you?',
        messageType: 'text',
      };
      const mockResult = { id: 'test-id-1', ...mockData };
      (prisma.message.create as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.create(mockData);

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });

    it('should create a message with default type if not provided', async () => {
      const mockData: CreateMessageData = {
        interviewId: 'test-interview-1',
        role: MessageRole.ASSISTANT,
        content: 'I am doing well, thank you!',
      };
      const mockResult = { id: 'test-id-1', ...mockData, messageType: 'text' };
      (prisma.message.create as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.create(mockData);

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findById', () => {
    it('should find a message by ID', async () => {
      const mockId = 'test-id-1';
      const mockResult = { id: mockId, interviewId: 'test-interview-1' };
      (prisma.message.findUnique as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findById(mockId);

      expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: mockId },
        include: { interview: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findByInterviewId', () => {
    it('should find all messages for an interview', async () => {
      const mockInterviewId = 'test-interview-1';
      const mockResult = [
        { id: 'test-id-1', interviewId: mockInterviewId },
        { id: 'test-id-2', interviewId: mockInterviewId },
      ];
      (prisma.message.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findByInterviewId(mockInterviewId);

      expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { interviewId: mockInterviewId },
        include: { interview: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
        skip: 0,
      });
      expect(result).toEqual(mockResult);
    });

    it('should find messages with pagination', async () => {
      const mockInterviewId = 'test-interview-1';
      const mockLimit = 5;
      const mockOffset = 2;
      const mockResult = [{ id: 'test-id-3', interviewId: mockInterviewId }];
      (prisma.message.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findByInterviewId(
        mockInterviewId,
        mockLimit,
        mockOffset
      );

      expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { interviewId: mockInterviewId },
        include: { interview: true },
        orderBy: { createdAt: 'asc' },
        take: mockLimit,
        skip: mockOffset,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findByUserId', () => {
    it('should find messages by user ID', async () => {
      const mockUserId = 'test-user-1';
      const mockResult = [{ id: 'test-id-1', interview: { userId: mockUserId } }];
      (prisma.message.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findByUserId(mockUserId);

      expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { interview: { userId: mockUserId } },
        include: { interview: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(mockResult);
    });

    it('should find messages by user ID and interview status', async () => {
      const mockUserId = 'test-user-1';
      const mockStatus = 'COMPLETED';
      const mockResult = [
        { id: 'test-id-1', interview: { userId: mockUserId, status: mockStatus } },
      ];
      (prisma.message.findMany as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findByUserId(mockUserId, mockStatus);

      expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { interview: { userId: mockUserId, status: mockStatus } },
        include: { interview: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('update', () => {
    it('should update a message', async () => {
      const mockId = 'test-id-1';
      const mockData = { content: 'Updated message content' };
      const mockResult = { id: mockId, interviewId: 'test-interview-1', ...mockData };
      (prisma.message.update as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.update(mockId, mockData);

      expect(prisma.message.update).toHaveBeenCalledTimes(1);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: mockId },
        data: mockData,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('delete', () => {
    it('should delete a message', async () => {
      const mockId = 'test-id-1';
      (prisma.message.delete as vi.Mock).mockResolvedValue({ id: mockId });

      await MessageRepository.delete(mockId);

      expect(prisma.message.delete).toHaveBeenCalledTimes(1);
      expect(prisma.message.delete).toHaveBeenCalledWith({
        where: { id: mockId },
      });
    });
  });

  describe('deleteByInterviewId', () => {
    it('should delete all messages for an interview', async () => {
      const mockInterviewId = 'test-interview-1';
      (prisma.message.deleteMany as vi.Mock).mockResolvedValue({ count: 3 });

      await MessageRepository.deleteByInterviewId(mockInterviewId);

      expect(prisma.message.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { interviewId: mockInterviewId },
      });
    });
  });

  describe('exists', () => {
    it('should return true if message exists', async () => {
      const mockId = 'test-id-1';
      (prisma.message.count as vi.Mock).mockResolvedValue(1);

      const result = await MessageRepository.exists(mockId);

      expect(prisma.message.count).toHaveBeenCalledTimes(1);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { id: mockId },
      });
      expect(result).toBe(true);
    });

    it('should return false if message does not exist', async () => {
      const mockId = 'test-id-1';
      (prisma.message.count as vi.Mock).mockResolvedValue(0);

      const result = await MessageRepository.exists(mockId);

      expect(prisma.message.count).toHaveBeenCalledTimes(1);
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { id: mockId },
      });
      expect(result).toBe(false);
    });
  });

  describe('findLatest', () => {
    it('should find latest message by interview ID', async () => {
      const mockInterviewId = 'test-interview-1';
      const mockResult = {
        id: 'test-id-1',
        interviewId: mockInterviewId,
        role: MessageRole.USER,
        content: 'Last message',
        createdAt: new Date('2024-01-02'),
      };
      (prisma.message.findFirst as vi.Mock).mockResolvedValue(mockResult);

      const result = await MessageRepository.findLatest(mockInterviewId);

      expect(prisma.message.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { interviewId: mockInterviewId },
        include: { interview: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null if no messages found', async () => {
      const mockInterviewId = 'test-interview-1';
      (prisma.message.findFirst as vi.Mock).mockResolvedValue(null);

      const result = await MessageRepository.findLatest(mockInterviewId);

      expect(result).toBeNull();
    });
  });
});
