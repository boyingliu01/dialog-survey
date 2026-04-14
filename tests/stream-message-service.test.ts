import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  StreamMessageService,
  parseStreamMessage,
  sendReply,
} from '../src/services/stream-message.service.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import { runInterviewGraph } from '../src/core/graph.js';

vi.mock('../src/core/graph.js', () => ({
  runInterviewGraph: vi.fn(),
}));

vi.mock('../src/repositories/interview-state.repository.js', () => ({
  InterviewStateRepository: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('StreamMessageService', () => {
  let service: StreamMessageService;
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findActiveInterview: vi.fn(),
      createInterview: vi.fn(),
      loadFullState: vi.fn(),
      saveFullState: vi.fn(),
    };

    vi.mocked(InterviewStateRepository).mockImplementation(() => mockRepo);
    service = new StreamMessageService(mockRepo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseStreamMessage', () => {
    it('should parse valid message correctly', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-001',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Hello world' }),
          sessionWebhook: 'https://webhook.example.com/session',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result).toEqual({
        userId: 'user-123',
        content: 'Hello world',
        sessionWebhook: 'https://webhook.example.com/session',
        messageId: 'msg-001',
      });
    });

    it('should return null for invalid JSON data', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-002',
          time: '2024-01-01T00:00:00Z',
        },
        data: 'invalid json',
      };

      const result = service.parseStreamMessage(message);

      expect(result).toBeNull();
    });

    it('should return null for invalid content JSON', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-003',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: 'not json',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result).toBeNull();
    });

    it('should handle empty senderStaffId', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-004',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          content: JSON.stringify({ content: 'Hello' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.userId).toBe('');
      expect(result?.content).toBe('Hello');
    });

    it('should handle empty content field', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-005',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({}),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.content).toBe('');
    });

    it('should handle missing sessionWebhook', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-006',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Hello' }),
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.sessionWebhook).toBe('');
    });
  });

  describe('sendReply', () => {
    it('should send reply successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.sendReply('https://webhook.example.com', 'Test reply');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://webhook.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: 'Test reply' },
        }),
      });
    });

    it('should return false for empty webhook URL', async () => {
      const result = await service.sendReply('', 'Test reply');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await service.sendReply('https://webhook.example.com', 'Test reply');

      expect(result).toBe(false);
    });

    it('should return false when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.sendReply('https://webhook.example.com', 'Test reply');

      expect(result).toBe(false);
    });
  });

  describe('processStreamMessage', () => {
    const baseState: InterviewState = {
      userId: 'user-123',
      interviewId: 'interview-123',
      templateId: 'default-template',
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
    };

    it('should return error for invalid message format', async () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-001',
          time: '2024-01-01T00:00:00Z',
        },
        data: 'invalid',
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid message format');
    });

    it('should return error for missing userId', async () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-002',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: '',
          content: JSON.stringify({ content: 'Hello' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });

    it('should return error for missing content', async () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-003',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });

    it('should create new interview when no active interview found', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(null);
      mockRepo.createInterview.mockResolvedValueOnce('interview-new');
      mockRepo.saveFullState.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '请简单介绍一下您的工作经历？',
        nextState: {
          ...baseState,
          interviewId: 'interview-new',
          status: 'ACTIVE',
        },
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-004',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '你好' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('请简单介绍一下您的工作经历？');
      expect(mockRepo.createInterview).toHaveBeenCalledWith('user-123', 'default-template');
      expect(mockRepo.saveFullState).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should process message with existing interview', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(baseState);
      mockRepo.saveFullState.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '下一个问题',
        nextState: { ...baseState, currentQuestion: 1 },
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-005',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '我的回答' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('下一个问题');
      expect(mockRepo.findActiveInterview).toHaveBeenCalledWith('user-123');
      expect(mockRepo.createInterview).not.toHaveBeenCalled();
    });

    it('should handle version conflict with retry', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);
      mockRepo.loadFullState.mockResolvedValue({
        ...baseState,
        version: 2,
        originalVersion: 2,
      });

      let saveCallCount = 0;
      mockRepo.saveFullState.mockImplementation(async () => {
        saveCallCount++;
        if (saveCallCount === 1) {
          throw new Error('Version conflict: expected 1, got 2');
        }
        return { success: true, newVersion: 3 };
      });

      vi.mocked(runInterviewGraph).mockResolvedValue({
        response: 'Retry response',
        nextState: baseState,
      });

      mockFetch.mockResolvedValue({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-retry',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Retry test' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockRepo.loadFullState).toHaveBeenCalled();
    });

    it('should return error when max retries exceeded', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);

      mockRepo.saveFullState.mockRejectedValue(new Error('Version conflict'));

      vi.mocked(runInterviewGraph).mockResolvedValue({
        response: 'Response',
        nextState: baseState,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-max',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Max retry test' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });

    it('should return error for non-version-conflict save errors', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);

      mockRepo.saveFullState.mockRejectedValue(new Error('Database connection failed'));

      vi.mocked(runInterviewGraph).mockResolvedValue({
        response: 'Response',
        nextState: baseState,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-db',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'DB error test' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should send reply when sessionWebhook is provided', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: 'Reply content',
        nextState: baseState,
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-reply',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Test' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      await service.processStreamMessage(message);

      expect(mockFetch).toHaveBeenCalledWith('https://webhook.example.com', expect.any(Object));
    });

    it('should not send reply when sessionWebhook is empty', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: 'No webhook reply',
        nextState: baseState,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-no-webhook',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Test' }),
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should accumulate pendingMessages correctly', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(baseState);
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 2,
      });

      const nextStateResult = {
        ...baseState,
        pendingMessages: [...baseState.pendingMessages],
      };
      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: 'Test response',
        nextState: nextStateResult,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-acc',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'User message' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      await service.processStreamMessage(message);

      expect(mockRepo.saveFullState).toHaveBeenCalled();
      const savedState = mockRepo.saveFullState.mock.calls[0][1];
      expect(savedState.pendingMessages).toBeDefined();
      expect(savedState.pendingMessages.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Exported functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('parseStreamMessage exported', () => {
    it('should parse valid message', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-001',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-export',
          content: JSON.stringify({ content: 'Exported test' }),
          sessionWebhook: 'https://webhook.export.com',
        }),
      };

      const result = parseStreamMessage(message);

      expect(result?.userId).toBe('user-export');
      expect(result?.content).toBe('Exported test');
    });

    it('should return null for invalid message', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-002',
          time: '2024-01-01T00:00:00Z',
        },
        data: 'bad',
      };

      const result = parseStreamMessage(message);

      expect(result).toBeNull();
    });
  });

  describe('sendReply exported', () => {
    it('should send reply successfully', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({ ok: true });

      const result = await sendReply('https://webhook.export.com', 'Exported reply');

      expect(result).toBe(true);
    });

    it('should return false for empty webhook', async () => {
      const result = await sendReply('', 'Exported reply');

      expect(result).toBe(false);
    });

    it('should handle fetch error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Export network error'));

      const result = await sendReply('https://webhook.export.com', 'Exported reply');

      expect(result).toBe(false);
    });
  });
});
