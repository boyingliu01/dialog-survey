import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewState } from '../src/core/types/index.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';
import { parseStreamMessage } from '../src/services/stream-message.service.js';

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

  let state: InterviewState | null = (await (
    repo.findActiveInterview as unknown as (...args: unknown[]) => unknown
  )(parsed.userId)) as InterviewState | null;

  if (!state) {
    const interviewId = (await (repo.createInterview as unknown as (...args: unknown[]) => unknown)(
      parsed.userId,
      'test-template'
    )) as string;
    state = {
      userId: parsed.userId,
      interviewId,
      templateId: 'test-template',
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
      nudgeCount: 0,
    };
  }

  state.pendingMessages.push({
    role: 'user',
    content: parsed.content,
  });

  const graphResult = (await (
    graph.runInterviewGraphFull as unknown as (...args: unknown[]) => unknown
  )(state, {
    userId: parsed.userId,
    content: parsed.content,
  })) as { nextState: InterviewState; response: string };

  const nextState = graphResult.nextState;
  nextState.pendingMessages.push({
    role: 'assistant',
    content: graphResult.response,
  });

  try {
    if (!state.interviewId) {
      return { success: false, error: 'Missing interviewId' };
    }
    await (repo.saveFullState as unknown as (...args: unknown[]) => unknown)(
      state.interviewId,
      nextState
    );
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('Version conflict') &&
      retryCount < MAX_RETRIES
    ) {
      if (!state.interviewId) {
        return { success: false, error: 'Missing interviewId' };
      }
      const freshState = (await (repo.loadFullState as unknown as (...args: unknown[]) => unknown)(
        state.interviewId,
        parsed.userId
      )) as InterviewState | null;
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
    await (sender.sendReply as unknown as (...args: unknown[]) => unknown)(
      parsed.sessionWebhook,
      graphResult.response
    );
  }

  return { success: true, response: graphResult.response };
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
    /**
     * @test REQ-002-9-06
     * @intent 验证初次消息处理和新面试创建的功能
     */
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
          nudgeCount: 0,
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
          text: { content: '你好' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(result.response).toBe('请简单介绍一下您的工作经历？');
      expect(mockRepo.createInterview).toHaveBeenCalledWith('user-123', 'test-template');
      expect(mockSender.sendReply).toHaveBeenCalledWith(
        'https://webhook.example.com',
        '请简单介绍一下您的工作经历？'
      );
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证使用现有状态处理第二条消息的功能
     */
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
        nudgeCount: 0,
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
          nudgeCount: 0,
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
          text: { content: '我有5年工作经验' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(result.response).toBe('您在工作中遇到过最大的挑战是什么？');
      expect(mockRepo.findActiveInterview).toHaveBeenCalledWith('user-123');
      expect(mockRepo.saveFullState).toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证多次交谈中pendingMessages积累的功能
     */
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
        nudgeCount: 0,
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
          text: { content: '挑战是团队合作' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      const savedState = mockRepo.saveFullState.mock.calls[0][1];
      expect(savedState.pendingMessages).toEqual([
        { role: 'user', content: '挑战是团队合作' },
        { role: 'assistant', content: '感谢回答' },
      ]);
    });
  });

  describe('乐观锁冲突重试', () => {
    /**
     * @test REQ-002-9-06
     * @intent 验证版本冲突时最多重试三次的机制
     */
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
        nudgeCount: 0,
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
          text: { content: 'Test retry' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(true);
      expect(mockRepo.loadFullState).toHaveBeenCalled();
      expect(mockRepo.saveFullState).toHaveBeenCalledTimes(2);
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证重试次数超过限制时返回错误的功能
     */
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
        nudgeCount: 0,
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
          text: { content: 'Test' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });
  });

  describe('错误处理', () => {
    /**
     * @test REQ-002-9-02
     * @intent 验证无效消息格式时返回错误的功能
     */
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

    /**
     * @test REQ-002-9-06
     * @intent 验证没有用户ID时返回错误的功能
     */
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
          text: { content: 'Hello' },
          sessionWebhook: 'https://webhook.example.com',
        }),
      };

      const result = await processStreamMessageFull(message, mockRepo, mockGraph, mockSender);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });
  });
});
