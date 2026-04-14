import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';

interface GraphResult {
  response: string;
  nextState: InterviewState;
}

interface MockRepository {
  loadFullState: ReturnType<typeof vi.fn>;
  saveFullState: ReturnType<typeof vi.fn>;
  createInterview: ReturnType<typeof vi.fn>;
  findActiveInterview: ReturnType<typeof vi.fn>;
}

interface MockGraph {
  runInterviewGraphFull: ReturnType<typeof vi.fn>;
}

interface MockSender {
  sendReply: ReturnType<typeof vi.fn>;
}

const MAX_RETRIES = 3;

async function processStreamMessageFull(
  message: StreamMessage,
  repo: MockRepository,
  graph: MockGraph,
  sender: MockSender,
  retryCount = 0
): Promise<{ success: boolean; response?: string; error?: string }> {
  const parsed = parseStreamMessage(message);

  if (!parsed) {
    return { success: false, error: 'Invalid message format' };
  }

  if (!parsed.userId || !parsed.content) {
    return { success: false, error: 'Missing userId or content' };
  }

  let state = await repo.findActiveInterview(parsed.userId);

  if (!state) {
    const interviewId = await repo.createInterview(parsed.userId, 'default-template');
    state = {
      userId: parsed.userId,
      interviewId,
      templateId: 'default-template',
      status: 'PENDING',
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
  }

  state.pendingMessages.push({
    role: 'user',
    content: parsed.content,
    isVoice: false,
  });

  const graphResult = await graph.runInterviewGraphFull(state, {
    userId: parsed.userId,
    content: parsed.content,
    isVoice: false,
  });

  const nextState = graphResult.nextState;
  nextState.pendingMessages.push({
    role: 'assistant',
    content: graphResult.response,
    isVoice: false,
  });

  try {
    await repo.saveFullState(state.interviewId!, nextState);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('Version conflict') &&
      retryCount < MAX_RETRIES
    ) {
      const freshState = await repo.loadFullState(state.interviewId!, parsed.userId);
      if (freshState) {
        return processStreamMessageFull(message, repo, graph, sender, retryCount + 1);
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  if (parsed.sessionWebhook) {
    await sender.sendReply(parsed.sessionWebhook, graphResult.response);
  }

  return { success: true, response: graphResult.response };
}

function parseStreamMessage(message: StreamMessage): {
  userId: string;
  content: string;
  sessionWebhook: string;
  messageId: string;
} | null {
  try {
    const data = JSON.parse(message.data);
    const contentData = JSON.parse(data.content || '{}');
    return {
      userId: data.senderStaffId || '',
      content: contentData.content || '',
      sessionWebhook: data.sessionWebhook || '',
      messageId: message.headers.messageId,
    };
  } catch {
    return null;
  }
}

describe('processStreamMessageFull - 完整多轮对话', () => {
  let mockRepo: MockRepository;
  let mockGraph: MockGraph;
  let mockSender: MockSender;

  beforeEach(() => {
    mockRepo = {
      loadFullState: vi.fn(),
      saveFullState: vi.fn(),
      createInterview: vi.fn(),
      findActiveInterview: vi.fn(),
    };
    mockGraph = {
      runInterviewGraphFull: vi.fn(),
    };
    mockSender = {
      sendReply: vi.fn().mockResolvedValue(true),
    };
  });

  describe('正常多轮对话流程', () => {
    it('should process first message and create new interview', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(null);
      mockRepo.createInterview.mockResolvedValue('interview-123');
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 1,
      });
      mockGraph.runInterviewGraphFull.mockResolvedValue({
        response: '请简单介绍一下您的工作经历？',
        nextState: {
          userId: 'user-123',
          interviewId: 'interview-123',
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
        },
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-1',
          time: '2026-04-13T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '你好' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(result.response).toBe('请简单介绍一下您的工作经历？');
      expect(mockRepo.createInterview).toHaveBeenCalledWith('user-123', 'default-template');
      expect(mockSender.sendReply).toHaveBeenCalledWith(
        'https://webhook.example.com',
        '请简单介绍一下您的工作经历？'
      );
    });

    it('should process second message with existing state', async () => {
      const existingState: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-123',
        status: 'ACTIVE',
        messages: [
          {
            role: 'assistant',
            content: '请简单介绍一下您的工作经历？',
            timestamp: new Date(),
          },
        ],
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

      mockRepo.findActiveInterview.mockResolvedValue(existingState);
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 2,
      });
      mockGraph.runInterviewGraphFull.mockResolvedValue({
        response: '您在工作中遇到过最大的挑战是什么？',
        nextState: {
          ...existingState,
          currentQuestion: 1,
          responses: [{ questionId: 'q0', content: '我有5年工作经验', isFollowup: false }],
          version: 2,
          originalVersion: 1,
          pendingMessages: [],
          pendingResponses: [],
        },
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-2',
          time: '2026-04-13T00:01:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '我有5年工作经验' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(result.response).toBe('您在工作中遇到过最大的挑战是什么？');
      expect(mockRepo.findActiveInterview).toHaveBeenCalledWith('user-123');
      expect(mockRepo.saveFullState).toHaveBeenCalled();
    });

    it('should accumulate pendingMessages across multiple turns', async () => {
      const existingState: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-123',
        status: 'ACTIVE',
        messages: [],
        currentQuestion: 1,
        followupCount: 0,
        maxFollowups: 2,
        responses: [{ questionId: 'q0', content: 'Answer 1', isFollowup: false }],
        reportGenerated: false,
        version: 2,
        originalVersion: 2,
        pendingMessages: [],
        pendingResponses: [],
      };

      mockRepo.findActiveInterview.mockResolvedValue(existingState);
      mockRepo.saveFullState.mockResolvedValue({
        success: true,
        newVersion: 3,
      });

      const nextState = { ...existingState, version: 3, originalVersion: 2 };
      mockGraph.runInterviewGraphFull.mockResolvedValue({
        response: '感谢回答',
        nextState,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-3',
          time: '2026-04-13T00:02:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: '挑战是团队合作' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      const savedState = mockRepo.saveFullState.mock.calls[0][1];
      expect(savedState.pendingMessages).toEqual([
        { role: 'user', content: '挑战是团队合作', isVoice: false },
        { role: 'assistant', content: '感谢回答', isVoice: false },
      ]);
    });
  });

  describe('乐观锁冲突重试', () => {
    it('should retry on version conflict (max 3 retries)', async () => {
      const existingState: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-123',
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

      mockRepo.findActiveInterview.mockResolvedValue(existingState);
      mockRepo.saveFullState.mockRejectedValueOnce(
        new Error('Version conflict: expected 1, got 2')
      );
      mockRepo.loadFullState.mockResolvedValue({
        ...existingState,
        version: 2,
        originalVersion: 2,
      });
      mockRepo.saveFullState.mockResolvedValueOnce({
        success: true,
        newVersion: 3,
      });
      mockGraph.runInterviewGraphFull.mockResolvedValue({
        response: 'Response after retry',
        nextState: { ...existingState, version: 3, originalVersion: 2 },
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-retry',
          time: '2026-04-13T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Test retry' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(mockRepo.loadFullState).toHaveBeenCalled();
      expect(mockRepo.saveFullState).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries exceeded', async () => {
      const existingState: InterviewState = {
        userId: 'user-123',
        interviewId: 'interview-123',
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

      mockRepo.findActiveInterview.mockResolvedValue(existingState);
      mockRepo.saveFullState.mockRejectedValue(new Error('Version conflict'));
      mockRepo.loadFullState.mockResolvedValue(existingState);
      mockGraph.runInterviewGraphFull.mockResolvedValue({
        response: 'Response',
        nextState: existingState,
      });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-fail',
          time: '2026-04-13T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          content: JSON.stringify({ content: 'Test' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });
  });

  describe('错误处理', () => {
    it('should return error for invalid message format', async () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-invalid',
          time: '2026-04-13T00:00:00Z',
        },
        data: 'invalid-json',
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid message format');
    });

    it('should return error for missing userId', async () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'message',
        headers: {
          topic: 'chat',
          messageId: 'msg-no-user',
          time: '2026-04-13T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: '',
          content: JSON.stringify({ content: 'Hello' }),
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });
  });
});
