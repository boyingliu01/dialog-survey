import { describe, expect, it, vi } from 'vitest';
import { planningNode } from '../src/core/nodes/planning.js';
import type { InterviewState } from '../src/core/types/index.js';

const mockFindById = vi.fn().mockResolvedValue(null);

vi.mock('../src/repositories/template.repository.js', () => {
  return {
    TemplateRepository: class {
      findById = mockFindById;
      async findAll() {
        return [];
      }
    },
  };
});

describe('planningNode', () => {
  const baseState: InterviewState = {
    userId: 'user-123',
    interviewId: 'interview-123',
    templateId: 'default',
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

  it('should return invitation prompt as response', async () => {
    const result = await planningNode(baseState);

    expect(result.response).toBe(
      '您好！欢迎参与本次访谈。您的回答对我们非常重要，请根据提示回答问题即可。\n\n请简单介绍一下您的工作经历？'
    );
    expect(result.shouldContinue).toBe(true);
    expect(result.currentQuestion).toBe(0);
  });

  /**
   * @test REQ-003-4-01
   * @intent 验证Planning节点将开场问题添加到消息数组中
   */
  it('should add first question message to messages array', async () => {
    const result = await planningNode(baseState);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBe(
      '您好！欢迎参与本次访谈。您的回答对我们非常重要，请根据提示回答问题即可。'
    );
    expect(result.messages[0].timestamp).toBeDefined();
  });

  /**
   * @test REQ-003-4-01
   * @intent 验证Planning节点保留现有消息
   */
  it('should preserve existing messages', async () => {
    const stateWithMessages = {
      ...baseState,
      messages: [{ role: 'user', content: 'Hello', timestamp: new Date() }],
    };

    const result = await planningNode(stateWithMessages);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
  });

  /**
   * @test REQ-003-4-01
   * @intent 验证Planning节点在没有指定模板时使用默认模板
   */
  it('should use default template when templateId is undefined', async () => {
    const stateWithoutTemplate = { ...baseState, templateId: undefined };
    const result = await planningNode(stateWithoutTemplate);

    expect(result.response).toBe(
      '您好！欢迎参与本次访谈。您的回答对我们非常重要，请根据提示回答问题即可。\n\n请简单介绍一下您的工作经历？'
    );
    expect(result.shouldContinue).toBe(true);
  });

  /**
   * @test REQ-003-4-01
   * @intent 验证Planning节点将当前问题索引设置为0
   */
  it('should set currentQuestion to 0', async () => {
    const state = { ...baseState, currentQuestion: 5 };
    const result = await planningNode(state);

    expect(result.currentQuestion).toBe(0);
  });

  it('should handle template with empty questions array gracefully', async () => {
    mockFindById.mockResolvedValueOnce({
      id: 'template-empty',
      content: JSON.stringify({
        name: 'Empty Template',
        invitationPrompt: '欢迎！',
        questions: [],
      }),
    });

    const state = { ...baseState, templateId: 'template-empty' };
    const result = await planningNode(state);

    expect(result.response).toContain('欢迎！');
    expect(result.response).not.toContain('undefined');
    expect(result.shouldContinue).toBe(true);
  });
});
