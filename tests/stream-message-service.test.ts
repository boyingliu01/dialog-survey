import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInterviewGraph } from '../src/core/graph.js';
import type { InterviewState } from '../src/core/types/index.js';
import { InterviewStateRepository } from '../src/repositories/interview-state.repository.js';
import {
  StreamMessageService,
  parseStreamMessage,
  sendReply,
} from '../src/services/stream-message.service.js';
import type { StreamMessage } from '../src/services/stream-message.service.js';

vi.mock('../src/core/graph.js', () => ({
  runInterviewGraph: vi.fn(),
}));

vi.mock('../src/repositories/interview-state.repository.js', () => ({
  InterviewStateRepository: vi.fn(),
}));

vi.mock('../src/repositories/template.repository.js', () => {
  const MockClass = class {
    findAll = vi.fn().mockResolvedValue([]);
    findById = vi.fn().mockResolvedValue(null);
  };
  return { TemplateRepository: MockClass };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('StreamMessageService', () => {
  let service: StreamMessageService;
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findActiveInterview: vi.fn(),
      findCompletedInterview: vi.fn().mockResolvedValue(null),
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
    /**
     * @test REQ-002-9-01
     * @intent 验证parseStreamMessage可以正确的从标准钉钉消息中提取必需字段(userId, content等)
     */
    it('should parse valid message with text.content format (real DingTalk format)', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-001',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello world' },
          msgtype: 'text',
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result).toEqual({
        userId: 'user-123',
        content: 'Hello world',
        sessionWebhook: 'https://oapi.dingtalk.com/session',
        messageId: 'msg-001',
      });
    });

    /**
     * @test REQ-002-9-01
     * @intent 验证parseStreamMessage可以从不同格式的消息中解析内容
     */
    it('should parse valid message with direct content field', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-002',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-456',
          content: 'Direct message',
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result).toEqual({
        userId: 'user-456',
        content: 'Direct message',
        sessionWebhook: 'https://oapi.dingtalk.com/session',
        messageId: 'msg-002',
      });
    });

    /**
     * @test REQ-002-9-01
     * @intent 验证当某些字段为空时解析功能的容错性
     */
    it('should parse message with empty content gracefully', () => {
      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: '/v1.0/im/bot/messages/get',
          messageId: 'msg-003',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-789',
          sessionWebhook: 'https://oapi.dingtalk.com/session',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result).toEqual({
        userId: 'user-789',
        content: '',
        sessionWebhook: 'https://oapi.dingtalk.com/session',
        messageId: 'msg-003',
      });
    });

    /**
     * @test REQ-002-9-02
     * @intent 验证parseStreamMessage返回null对于无效JSON数据
     */
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

    /**
     * @test REQ-002-9-01
     * @intent 验证解析非JSON字符串内容的能力
     */
    it('should parse content as plain string (no JSON parsing needed)', () => {
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

      expect(result?.content).toBe('not json');
    });

    /**
     * @test REQ-002-9-01
     * @intent 验证当发送者ID不存在时的处理方式
     */
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
          text: { content: 'Hello' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.userId).toBe('');
      expect(result?.content).toBe('Hello');
    });

    /**
     * @test REQ-002-9-01
     * @intent 验证当内容字段为空时的处理方式
     */
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
          text: { content: '' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.content).toBe('');
    });

    /**
     * @test REQ-002-9-01
     * @intent 验证当sessionWebhook字段缺失时的处理
     */
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
          text: { content: 'Hello' },
        }),
      };

      const result = service.parseStreamMessage(message);

      expect(result?.sessionWebhook).toBe('');
    });
  });

  describe('sendReply', () => {
    /**
     * @test REQ-002-9-03
     * @intent 验证sendReply可以通过会话Webhook发送消息并返回成功结果
     */
    it('should send reply successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.sendReply('https://oapi.dingtalk.com', 'Test reply');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://oapi.dingtalk.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: 'Test reply' },
        }),
      });
    });

    /**
     * @test REQ-002-9-04
     * @intent 验证当Webhook为空时sendReply应返回false
     */
    it('should return false for empty webhook URL', async () => {
      const result = await service.sendReply('', 'Test reply');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-05
     * @intent 验证当API返回非OK状态时sendReply应返回失败
     */
    it('should return false when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await service.sendReply('https://oapi.dingtalk.com', 'Test reply');

      expect(result).toBe(false);
    });

    /**
     * @test REQ-002-9-05
     * @intent 验证在fetch异常情况下sendReply应返回失败
     */
    it('should return false when fetch throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.sendReply('https://oapi.dingtalk.com', 'Test reply');

      expect(result).toBe(false);
    });
  });

  describe('processStreamMessage', () => {
    const baseState: InterviewState = {
      userId: 'user-123',
      interviewId: 'interview-123',
      templateId: 'test-template',
      status: 'ACTIVE',
      messages: [],
      currentQuestion: 0,
      followupCount: 0,
      maxFollowups: 2,
      nudgeCount: 0,
      responses: [],
      reportGenerated: false,
      version: 1,
      originalVersion: 1,
      pendingMessages: [],
      pendingResponses: [],
    };

    /**
     * @test REQ-002-9-02
     * @intent 验证无效消息格式的情况应返回错误
     */
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

    /**
     * @test REQ-002-9-06
     * @intent 验证缺少用户ID情况下的处理
     */
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
          text: { content: 'Hello' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证缺少内容字段情况下的处理
     */
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
          text: { content: '' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing userId or content');
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证创建新的面试记录流程
     */
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
          text: { content: '你好' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('请简单介绍一下您的工作经历？');
      expect(mockRepo.createInterview).toHaveBeenCalledWith('user-123', 'test-template');
      expect(mockRepo.saveFullState).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });

    /**
     * @test bugfix-use-pending-interview
     * @intent 修复Bug: 当用户已有预创建的PENDING访谈时，应使用它而非创建新的
     */
    it('should use pre-created PENDING interview instead of creating new one', async () => {
      const pendingState: InterviewState = {
        ...baseState,
        interviewId: 'pre-created-interview',
        templateId: 'plan-template-999',
        status: 'PENDING',
      };
      mockRepo.findActiveInterview.mockResolvedValueOnce(pendingState);
      mockRepo.saveFullState.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '您好！欢迎参与本次访谈。',
        nextState: {
          ...pendingState,
          status: 'ACTIVE',
        },
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-pending',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: '你好' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockRepo.createInterview).not.toHaveBeenCalled();
      expect(mockRepo.findActiveInterview).toHaveBeenCalledWith('user-123');
      const graphCallArg = vi.mocked(runInterviewGraph).mock.calls[0][0];
      expect(graphCallArg.interviewId).toBe('pre-created-interview');
      expect(graphCallArg.templateId).toBe('plan-template-999');
    });

    /**
     * @test bugfix-cooldown-blocks-restart-within-cooldown
     * @intent 验证用户在冷却期内发消息时被拦截，收到冷却提醒消息
     */
    it('should block message and send cooldown reply when recently completed interview exists', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(null);
      const completedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      vi.stubEnv('INTERVIEW_COOLDOWN_MINUTES', '30');
      mockRepo.findCompletedInterview = vi.fn().mockResolvedValueOnce({
        completedAt,
        templateId: 'template-1',
      });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-cooldown-block',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello again' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toContain('分钟');
      expect(mockRepo.createInterview).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
    });

    /**
     * @test bugfix-cooldown-allows-restart-after-cooldown
     * @intent 验证冷却期过后，用户可以正常开始新访谈
     */
    it('should allow new interview when cooldown has expired', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(null);
      const completedAt = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
      vi.stubEnv('INTERVIEW_COOLDOWN_MINUTES', '30');
      mockRepo.findCompletedInterview = vi.fn().mockResolvedValueOnce({
        completedAt,
        templateId: 'template-1',
      });
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
          messageId: 'msg-cooldown-expired',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello again' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockRepo.createInterview).toHaveBeenCalled();
    });

    /**
     * @test bugfix-cooldown-no-completed-interview
     * @intent 验证没有已完成访谈时正常创建新访谈（不触发冷却）
     */
    it('should create new interview normally when no completed interview exists', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(null);
      mockRepo.findCompletedInterview = vi.fn().mockResolvedValueOnce(null);
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
          messageId: 'msg-no-completed',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockRepo.createInterview).toHaveBeenCalled();
    });

    /**
     * @test bugfix-timeout-sends-nudge-on-first-timeout
     * @intent 验证首次超时发送提醒消息，不跳过问题
     */
    it('should send nudge message on first timeout without advancing question', async () => {
      const staleState = {
        ...baseState,
        status: 'ACTIVE' as const,
        currentQuestion: 0,
        nudgeCount: 0,
        messages: [
          {
            role: 'assistant' as const,
            content: '请介绍您的工作经历？',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
        ],
      };
      mockRepo.findActiveInterview.mockResolvedValueOnce(staleState);
      mockRepo.saveFullState.mockResolvedValueOnce({ success: true, newVersion: 2 });
      mockRepo.saveFullState.mockResolvedValueOnce({ success: true, newVersion: 3 });
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      vi.stubEnv('INTERVIEW_TIMEOUT_MAX_NUDGES', '3');

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '感谢您的回答，请继续...',
        nextState: { ...staleState, nudgeCount: 1 },
      });

      mockFetch.mockResolvedValue({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-timeout-nudge',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'Hello' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('感谢您的回答，请继续...');
      expect(mockFetch).toHaveBeenCalled();
      expect(runInterviewGraph).toHaveBeenCalled();
    });

    /**
     * @test bugfix-breakpoint-resume-on-timeout
     * @intent 验证超时用户回复时，nudge 为附带提醒而非替代处理 —— 用户输入应继续送入 LLM
     */
    it('should process user input AND send nudge side-effect on timeout, not block resume', async () => {
      const staleState = {
        ...baseState,
        status: 'ACTIVE' as const,
        currentQuestion: 2,
        nudgeCount: 0,
        messages: [
          {
            role: 'assistant' as const,
            content: '请分享一下您的工作经历？',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          },
        ],
      };
      mockRepo.findActiveInterview.mockResolvedValueOnce(staleState);
      mockRepo.saveFullState.mockResolvedValueOnce({ success: true, newVersion: 2 });
      mockRepo.saveFullState.mockResolvedValueOnce({ success: true, newVersion: 3 });
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');
      vi.stubEnv('INTERVIEW_TIMEOUT_MAX_NUDGES', '3');

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '感谢您的分享！下一个问题...',
        nextState: { ...staleState, currentQuestion: 3, nudgeCount: 1 },
      });

      mockFetch.mockResolvedValue({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-breakpoint-resume',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: '我在XX公司做了3年开发' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('感谢您的分享！下一个问题...');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(runInterviewGraph).toHaveBeenCalled();
    });

    /**
     * @test bugfix-timeout-no-timeout-when-active
     * @intent 验证正常回复时不触发超时
     */
    it('should process normally when not timed out', async () => {
      const activeState = {
        ...baseState,
        status: 'ACTIVE' as const,
        nudgeCount: 0,
        messages: [
          {
            role: 'assistant' as const,
            content: '请介绍您的工作经历？',
            timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
          },
        ],
      };
      mockRepo.findActiveInterview.mockResolvedValueOnce(activeState);
      mockRepo.saveFullState.mockResolvedValueOnce({ success: true, newVersion: 2 });
      vi.stubEnv('INTERVIEW_TIMEOUT_HOURS', '1');

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '感谢您的回答，下一个问题...',
        nextState: { ...activeState, currentQuestion: 1 },
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-not-timeout',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'My answer' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('感谢您的回答，下一个问题...');
      expect(mockRepo.saveFullState).toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证使用现有面试记录继续处理的流程
     */
    it('should process message with existing interview', async () => {
      mockRepo.findActiveInterview.mockResolvedValueOnce(baseState);
      mockRepo.saveFullState.mockResolvedValueOnce({
        success: true,
        newVersion: 2,
      });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '请简单介绍一下您的工作经历？',
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
          text: { content: '我的回答' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(result.response).toBe('请简单介绍一下您的工作经历？');
      expect(mockRepo.findActiveInterview).toHaveBeenCalledWith('user-123');
      expect(mockRepo.createInterview).not.toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证乐观锁版本冲突的重试机制
     */
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
          // First call: PROCESSING save - succeeds
          return { success: true, newVersion: 2 };
        }
        if (saveCallCount === 2) {
          // Second call: ACTIVE save - version conflict
          throw new Error('Version conflict: expected 2, got 3');
        }
        // Third call: retry ACTIVE save - succeeds
        return { success: true, newVersion: 4 };
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
          text: { content: 'Retry test' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockRepo.loadFullState).toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证版本冲突重试次数超限时的失败处理
     */
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
          text: { content: 'Max retry test' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version conflict');
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证不是版本冲突类型的保存错误直接返回
     */
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
          text: { content: 'DB error test' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    /**
     * @test REQ-002-9-03
     * @intent 验证sessionWebhook提供时自动发送回复的功能
     */
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
          text: { content: 'Test' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      await service.processStreamMessage(message);

      expect(mockFetch).toHaveBeenCalledWith('https://oapi.dingtalk.com', expect.any(Object));
    });

    /**
     * @test REQ-002-9-03
     * @intent 验证sessionWebhook为空时不发送回复的功能
     */
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
          text: { content: 'Test' },
        }),
      };

      const result = await service.processStreamMessage(message);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    /**
     * @test REQ-002-9-06
     * @intent 验证pendingMessages的正确积累方式
     */
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
          text: { content: 'User message' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      await service.processStreamMessage(message);

      expect(mockRepo.saveFullState).toHaveBeenCalled();
      const savedState = mockRepo.saveFullState.mock.calls[0][1];
      expect(savedState.pendingMessages).toBeDefined();
      expect(savedState.pendingMessages.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @test REQ-002-9-07
     * @intent 验证用户回复会被正确持久化到pendingResponses
     */
    it('should persist user response to pendingResponses', async () => {
      const existingState = {
        ...baseState,
        responses: [{ questionId: 'q0', content: 'First answer', isFollowup: false }],
      };
      mockRepo.findActiveInterview.mockResolvedValueOnce(existingState);
      mockRepo.saveFullState
        .mockResolvedValueOnce({ success: true, newVersion: 2 })
        .mockResolvedValueOnce({ success: true, newVersion: 3 });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '下一个问题',
        nextState: {
          ...existingState,
          currentQuestion: 1,
          responses: [
            ...existingState.responses,
            { questionId: 'q1', content: 'My answer', isFollowup: false },
          ],
        },
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const message: StreamMessage = {
        specVersion: '1.0',
        type: 'CALLBACK',
        headers: {
          topic: 'chat',
          messageId: 'msg-resp',
          time: '2024-01-01T00:00:00Z',
        },
        data: JSON.stringify({
          senderStaffId: 'user-123',
          text: { content: 'My answer' },
          sessionWebhook: 'https://oapi.dingtalk.com',
        }),
      };

      await service.processStreamMessage(message);

      expect(mockRepo.saveFullState).toHaveBeenCalled();
      const savedState = mockRepo.saveFullState.mock.calls[1][1];
      expect(savedState.pendingResponses).toBeDefined();
      expect(savedState.pendingResponses.length).toBeGreaterThanOrEqual(1);
      expect(savedState.pendingResponses).toContainEqual({
        questionId: 'q1',
        content: 'My answer',
        isFollowup: false,
      });
    });
  });

  describe('Breakpoint Resume (PROCESSING state)', () => {
    const processingState: InterviewState = {
      userId: 'user-123',
      interviewId: 'interview-123',
      templateId: 'default',
      status: 'PROCESSING',
      messages: [],
      currentQuestion: 2,
      followupCount: 1,
      maxFollowups: 2,
      nudgeCount: 0,
      responses: [
        { questionId: 'q0', content: '回答1', isFollowup: false },
        { questionId: 'q1', content: '回答2', isFollowup: false },
      ],
      reportGenerated: false,
      version: 5,
      originalVersion: 5,
      pendingMessages: [{ role: 'user', content: '我的回答', isVoice: false }],
      pendingResponses: [],
    };

    const makeNextState = (currentQ: number, version: number): InterviewState => ({
      userId: 'user-123',
      interviewId: 'interview-123',
      templateId: 'default',
      status: 'ACTIVE',
      messages: [],
      currentQuestion: currentQ,
      followupCount: 0,
      maxFollowups: 2,
      nudgeCount: 0,
      responses: [
        { questionId: 'q0', content: '回答1', isFollowup: false },
        { questionId: 'q1', content: '回答2', isFollowup: false },
        { questionId: 'q2', content: '新消息', isFollowup: false },
      ],
      reportGenerated: false,
      version,
      originalVersion: version,
      pendingMessages: [],
      pendingResponses: [],
    });

    it('should detect PROCESSING and silently resume', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(processingState);
      mockRepo.saveFullState.mockResolvedValue({ success: true, newVersion: 6 });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '好的我们继续',
        nextState: makeNextState(3, 6),
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.processStreamMessage(
        {
          data: JSON.stringify({
            senderStaffId: 'user-123',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send',
            text: { content: '继续回答' },
          }),
          headers: { messageId: 'msg-1' },
        } as any,
        0
      );

      expect(result.success).toBe(true);
      expect(mockRepo.saveFullState).toHaveBeenCalledTimes(2);
    });

    it('should transition PROCESSING to ACTIVE after success', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(processingState);
      mockRepo.saveFullState
        .mockResolvedValueOnce({ success: true, newVersion: 6 })
        .mockResolvedValueOnce({ success: true, newVersion: 7 });

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '回复',
        nextState: makeNextState(3, 7),
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.processStreamMessage(
        {
          data: JSON.stringify({
            senderStaffId: 'user-123',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send',
            text: { content: '新消息' },
          }),
          headers: { messageId: 'msg-2' },
        } as any,
        0
      );

      expect(result.success).toBe(true);
      expect(mockRepo.saveFullState).toHaveBeenLastCalledWith(
        'interview-123',
        expect.objectContaining({ status: 'ACTIVE' })
      );
    });

    it('saveFullState failure keeps PROCESSING for next recovery', async () => {
      mockRepo.findActiveInterview.mockResolvedValue(processingState);
      mockRepo.saveFullState
        .mockResolvedValueOnce({ success: true, newVersion: 6 })
        .mockRejectedValueOnce(new Error('DB write failed'));

      vi.mocked(runInterviewGraph).mockResolvedValueOnce({
        response: '回复',
        nextState: makeNextState(3, 7),
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.processStreamMessage(
        {
          data: JSON.stringify({
            senderStaffId: 'user-123',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send',
            text: { content: '消息' },
          }),
          headers: { messageId: 'msg-3' },
        } as any,
        0
      );

      expect(result.success).toBe(false);
    });
  });
});

describe('Exported functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('parseStreamMessage exported', () => {
    /**
     * @test REQ-002-9-01
     * @intent 验证导出的parseStreamMessage函数可以解析有效的消息
     */
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
          text: { content: 'Exported test' },
          sessionWebhook: 'https://webhook.export.com',
        }),
      };

      const result = parseStreamMessage(message);

      expect(result?.userId).toBe('user-export');
      expect(result?.content).toBe('Exported test');
    });

    /**
     * @test REQ-002-9-02
     * @intent 验证导出的parseStreamMessage函数对于无效消息返回null
     */
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
    /**
     * @test REQ-002-9-03
     * @intent 验证导出的sendReply函数可以成功发送回复
     */
    it('should send reply successfully', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const result = await sendReply('https://webhook.export.com', 'Exported reply');

      expect(result).toBe(true);
    });

    /**
     * @test REQ-002-9-04
     * @intent 验证导出的sendReply函数对空webhook返回false
     */
    it('should return false for empty webhook', async () => {
      const result = await sendReply('', 'Exported reply');

      expect(result).toBe(false);
    });

    /**
     * @test REQ-002-9-05
     * @intent 验证导出的sendReply函数在fetch错误时返回false
     */
    it('should handle fetch error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Export network error'));

      const result = await sendReply('https://webhook.export.com', 'Exported reply');

      expect(result).toBe(false);
    });
  });
});
