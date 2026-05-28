// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DingTalkMessageSender } from '../src/integrations/dingtalk/message-sender.js';

vi.mock('../src/integrations/dingtalk/token-manager.js', () => ({
  tokenManager: {
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    invalidateToken: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('DingTalkMessageSender', () => {
  let sender: DingTalkMessageSender;

  beforeEach(() => {
    vi.stubEnv('DINGTALK_AGENT_ID', 'test-agent-id');
    globalThis.fetch = vi.fn();
    sender = new DingTalkMessageSender();
  });

  it('should send text message to a single user', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0, task_id: 'task-123' }),
    } as Response);

    const result = await sender.sendTextMessage(['user1'], 'Hello interview');

    expect(result.taskId).toBe('task-123');
    expect(result.successCount).toBe(1);
    expect(result.failedUserIds).toEqual([]);
  });

  it('should split into batches when more than 100 users', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0, task_id: 'task-123' }),
    } as Response);

    const userIds = Array.from({ length: 150 }, (_, i) => `user${i}`);
    await sender.sendTextMessage(userIds, 'Batch test');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('should invalidate token on 400014 error and retry', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 400014 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, task_id: 't1' }),
      } as Response);

    const { tokenManager } = await import('../src/integrations/dingtalk/token-manager.js');
    const result = await sender.sendTextMessage(['user1'], 'Test');

    expect(tokenManager.invalidateToken).toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.successCount).toBe(1);
  });

  it('should record failed users on API error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 1, errmsg: 'bad request' }),
    } as Response);

    const result = await sender.sendTextMessage(['user1'], 'Test');

    expect(result.successCount).toBe(0);
    expect(result.failedUserIds).toEqual(['user1']);
  });

  it('should send action card message', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errcode: 0, task_id: 'card-1' }),
    } as Response);

    const result = await sender.sendActionCard(['user1'], {
      title: 'Interview',
      text: 'You are invited',
      singleTitle: 'Start',
      singleURL: 'https://example.com',
    });

    expect(result.successCount).toBe(1);
    expect(result.taskId).toBe('card-1');
  });

  it('should return errors when DINGTALK_AGENT_ID is missing', async () => {
    vi.unstubAllEnvs();

    const result = await sender.sendTextMessage(['user1'], 'Test');

    expect(result.successCount).toBe(0);
    expect(result.failedUserIds).toEqual(['user1']);
  });
});
