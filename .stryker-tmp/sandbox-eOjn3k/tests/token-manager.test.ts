// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DingTalkTokenManager } from '../src/integrations/dingtalk/token-manager.js';

vi.mock('../utils/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('DingTalkTokenManager', () => {
  let tokenManager: DingTalkTokenManager;

  beforeEach(() => {
    tokenManager = new DingTalkTokenManager();
    process.env.DINGTALK_CLIENT_ID = 'test_client_id';
    process.env.DINGTALK_CLIENT_SECRET = 'test_client_secret';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.DINGTALK_CLIENT_ID = undefined;
    process.env.DINGTALK_CLIENT_SECRET = undefined;
  });

  it('should fetch a new token when cache is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: 'ok',
        access_token: 'mock_access_token',
        expires_in: 7200,
      }),
    });

    const token = await tokenManager.getAccessToken();
    expect(token).toBe('mock_access_token');
  });

  it('should return cached token when not expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        errcode: 0,
        access_token: 'cached_token',
        expires_in: 7200,
      }),
    });

    const firstToken = await tokenManager.getAccessToken();
    expect(firstToken).toBe('cached_token');

    const secondToken = await tokenManager.getAccessToken();
    expect(secondToken).toBe('cached_token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent requests properly', async () => {
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: vi.fn().mockResolvedValue({
                  errcode: 0,
                  access_token: 'concurrent_token',
                  expires_in: 7200,
                }),
              }),
            10
          )
        )
    );

    const promises = [
      tokenManager.getAccessToken(),
      tokenManager.getAccessToken(),
      tokenManager.getAccessToken(),
    ];
    const tokens = await Promise.all(promises);

    expect(tokens).toEqual(['concurrent_token', 'concurrent_token', 'concurrent_token']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should invalidate token and fetch new one', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          errcode: 0,
          access_token: 'first_token',
          expires_in: 7200,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          errcode: 0,
          access_token: 'second_token',
          expires_in: 7200,
        }),
      });

    const firstToken = await tokenManager.getAccessToken();
    expect(firstToken).toBe('first_token');

    tokenManager.invalidateToken();

    const secondToken = await tokenManager.getAccessToken();
    expect(secondToken).toBe('second_token');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should throw error when environment variables are not set', async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete for proper removal
    delete process.env.DINGTALK_CLIENT_ID;
    // biome-ignore lint/performance/noDelete: process.env requires delete for proper removal
    delete process.env.DINGTALK_CLIENT_SECRET;

    await expect(tokenManager.getAccessToken()).rejects.toThrow(
      'DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET must be set in environment variables'
    );
  });
});
