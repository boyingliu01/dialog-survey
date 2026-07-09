import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DingTalkClient } from '../src/integrations/dingtalk/client.js';

describe('DingTalkClient.getUserIdByMobile', () => {
  let client: DingTalkClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DingTalkClient({ appKey: 'test-key', appSecret: 'test-secret' });
  });

  describe('getAccessToken', () => {
    it('should fetch and cache access token on first call', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      } as Response);

      // Access private method for testing
      const getAccessToken = (
        client as unknown as { getAccessToken: () => Promise<string> }
      ).getAccessToken.bind(client);
      const token = await getAccessToken();

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/gettoken?appkey=test-key&appsecret=test-secret'),
        expect.any(Object)
      );
    });

    it('should return cached token on subsequent calls', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          errcode: 0,
          errmsg: 'ok',
          access_token: 'test-token-123',
          expires_in: 7200,
        }),
      } as Response);

      const getAccessToken = (
        client as unknown as { getAccessToken: () => Promise<string> }
      ).getAccessToken.bind(client);
      await getAccessToken(); // First call - fetch
      await getAccessToken(); // Second call - cache

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when token API returns non-zero errcode', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errcode: 40014,
          errmsg: 'invalid app key',
        }),
      } as Response);

      const getAccessToken = (
        client as unknown as { getAccessToken: () => Promise<string> }
      ).getAccessToken.bind(client);
      await expect(getAccessToken()).rejects.toThrow('invalid app key');
    });
  });

  describe('getUserIdByMobile', () => {
    it('should return user info when mobile found', async () => {
      const mockFetch = vi.spyOn(global, 'fetch');
      // First call: get token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'token', expires_in: 7200 }),
      } as Response);
      // Second call: get user by mobile (v2 API: nested result.userid, no name field)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', result: { userid: 'user123' } }),
      } as Response);

      const result = await client.getUserIdByMobile('13800138000');

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.userId).toBe('user123');
        expect(result.name).toBe('');
      }
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return found: false when errcode is 60121 (user not found)', async () => {
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'token', expires_in: 7200 }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 60121, errmsg: 'user not found' }),
      } as Response);

      const result = await client.getUserIdByMobile('13800000000');
      expect(result.found).toBe(false);
    });

    it('should throw IntegrationError when API returns other errcode', async () => {
      const mockFetch = vi.spyOn(global, 'fetch');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'token', expires_in: 7200 }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 30001, errmsg: 'permission denied' }),
      } as Response);

      await expect(client.getUserIdByMobile('13800138000')).rejects.toThrow('permission denied');
    });

    it('should throw error when fetch fails (network error)', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getUserIdByMobile('13800138000')).rejects.toThrow('Network error');
    });
  });
});
