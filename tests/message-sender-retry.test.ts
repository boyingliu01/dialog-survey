import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioural cover for `DingTalkMessageSender`.
 *
 * The existing `dingtalk-services.test.ts` only greps the source for method
 * names, so none of the batch/retry logic was ever executed by a test. That
 * matters here: the token-expiry retry is what keeps a 100-user batch from
 * failing wholesale when the cached token has aged out, and a mutant that dropped
 * one of the two expiry errcodes survived every existing test.
 */

const getAccessToken = vi.fn();
const invalidateToken = vi.fn();

vi.mock('../src/integrations/dingtalk/token-manager.js', () => ({
  tokenManager: {
    getAccessToken: () => getAccessToken() as Promise<string>,
    invalidateToken: () => {
      invalidateToken();
    },
  },
}));

const { DingTalkMessageSender } = await import('../src/integrations/dingtalk/message-sender.js');

const ok = (task_id: number | string) => ({
  errcode: 0,
  errmsg: 'ok',
  task_id,
});

describe('DingTalkMessageSender', () => {
  beforeEach(() => {
    getAccessToken.mockReset().mockResolvedValue('tok');
    invalidateToken.mockReset();
    vi.stubEnv('DINGTALK_AGENT_ID', 'agent-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('token expiry', () => {
    it.each([400014, 40014])('retries once after errcode %i and then succeeds', async (code) => {
      // Both codes mean "the token is stale": the batch was fine, only the
      // credential was. Dropping either one turns a recoverable send into a
      // whole-batch failure.
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          json: async () => ({ errcode: code, errmsg: 'token expired' }),
        } as Response)
        .mockResolvedValueOnce({ json: async () => ok(42) } as Response);

      const result = await new DingTalkMessageSender().sendTextMessage(['u1'], 'hello');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(invalidateToken).toHaveBeenCalledTimes(1);
      expect(result.successCount).toBe(1);
      expect(result.failedUserIds).toEqual([]);
      expect(result.taskId).toBe('42');
    });

    it('gives up after three expiry responses and reports every user as failed', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        json: async () => ({ errcode: 400014, errmsg: 'expired' }),
      } as Response);

      const result = await new DingTalkMessageSender().sendTextMessage(['u1', 'u2'], 'hello');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(0);
      expect(result.failedUserIds).toEqual(['u1', 'u2']);
    });
  });

  describe('failures', () => {
    it('reports a non-zero errcode against every user in the batch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        json: async () => ({ errcode: 88, errmsg: 'rate limited' }),
      } as Response);

      const result = await new DingTalkMessageSender().sendTextMessage(['u1', 'u2'], 'hello');

      expect(result.successCount).toBe(0);
      expect(result.failedUserIds).toEqual(['u1', 'u2']);
      expect(result.errors).toEqual([
        { userId: 'u1', error: 'rate limited' },
        { userId: 'u2', error: 'rate limited' },
      ]);
      // A business error is not retried -- only an expired token is.
      expect(invalidateToken).not.toHaveBeenCalled();
    });

    it('fails the batch without calling DingTalk when the agent id is missing', async () => {
      vi.stubEnv('DINGTALK_AGENT_ID', '');
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const result = await new DingTalkMessageSender().sendTextMessage(['u1'], 'hello');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.failedUserIds).toEqual(['u1']);
      expect(result.errors?.[0].error).toContain('DINGTALK_AGENT_ID');
    });
  });

  describe('batches', () => {
    it('splits over the 100-user limit and totals the results', async () => {
      // 250 users = 3 batches. The task id must come from the LAST batch that
      // reported one, and the per-batch failures must all be collected.
      const batchSizes: number[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(((_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body)) as { userid_list: string };
        const size = body.userid_list.split(',').length;
        batchSizes.push(size);
        return Promise.resolve({ json: async () => ok(size) } as Response);
      }) as typeof fetch);

      const users = Array.from({ length: 250 }, (_, i) => `u${i}`);
      const result = await new DingTalkMessageSender().sendTextMessage(users, 'hello');

      expect(batchSizes).toEqual([100, 100, 50]);
      expect(result.successCount).toBe(250);
      expect(result.failedUserIds).toEqual([]);
      expect(result.taskId).toBe('50');
    }, 10_000);

    it('sends an empty batch list as an empty success, not a failure', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const result = await new DingTalkMessageSender().sendTextMessage([], 'hello');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);
      expect(result.failedUserIds).toEqual([]);
    });
  });
});
