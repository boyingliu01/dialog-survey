import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DingTalkClient, dingTalkCredentialsFromEnv } from '../src/integrations/dingtalk/client.js';
import { DingTalkTokenManager } from '../src/integrations/dingtalk/token-manager.js';

const CREDENTIAL_KEYS = [
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
] as const;

/** Start every case from a known-empty credential environment. */
function clearCredentials(): void {
  for (const key of CREDENTIAL_KEYS) vi.stubEnv(key, '');
}

function readCredentials(client: DingTalkClient): { appKey: string; appSecret: string } {
  return client as unknown as { appKey: string; appSecret: string };
}

/**
 * Issue #197: the installer writes DINGTALK_CLIENT_ID/SECRET, so reading only
 * DINGTALK_APP_KEY/SECRET signed every request with an empty key and `gettoken`
 * failed with errcode 40035 while the token manager succeeded in the same
 * process — the two call sites disagreed about which env names exist.
 */
describe('DingTalk credential resolution (issue #197)', () => {
  beforeEach(clearCredentials);
  afterEach(() => vi.unstubAllEnvs());

  describe('dingTalkCredentialsFromEnv', () => {
    it('prefers the APP_KEY/APP_SECRET spelling when both are present', () => {
      vi.stubEnv('DINGTALK_APP_KEY', 'app-key');
      vi.stubEnv('DINGTALK_APP_SECRET', 'app-secret');
      vi.stubEnv('DINGTALK_CLIENT_ID', 'client-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'client-secret');

      expect(dingTalkCredentialsFromEnv()).toEqual({
        appKey: 'app-key',
        appSecret: 'app-secret',
      });
    });

    it('falls back to CLIENT_ID/CLIENT_SECRET — the installer default', () => {
      vi.stubEnv('DINGTALK_CLIENT_ID', 'client-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'client-secret');

      expect(dingTalkCredentialsFromEnv()).toEqual({
        appKey: 'client-id',
        appSecret: 'client-secret',
      });
    });

    it('returns empty strings when nothing is configured', () => {
      expect(dingTalkCredentialsFromEnv()).toEqual({ appKey: '', appSecret: '' });
    });

    it('resolves each half independently', () => {
      vi.stubEnv('DINGTALK_APP_KEY', 'app-key');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'client-secret');

      expect(dingTalkCredentialsFromEnv()).toEqual({
        appKey: 'app-key',
        appSecret: 'client-secret',
      });
    });
  });

  describe('DingTalkClient.fromEnv', () => {
    it('uses CLIENT_ID/CLIENT_SECRET when only those are set', () => {
      vi.stubEnv('DINGTALK_CLIENT_ID', 'installer-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'installer-secret');

      const creds = readCredentials(DingTalkClient.fromEnv());

      expect(creds.appKey).toBe('installer-id');
      expect(creds.appSecret).toBe('installer-secret');
    });

    it('passes the resolved appKey to gettoken', async () => {
      vi.stubEnv('DINGTALK_CLIENT_ID', 'installer-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'installer-secret');
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'tok', expires_in: 7200 }),
      } as Response);

      const client = DingTalkClient.fromEnv();
      const getAccessToken = (
        client as unknown as { getAccessToken: () => Promise<string> }
      ).getAccessToken.bind(client);
      await getAccessToken();

      // The regression surfaced as errcode 40035 ("缺少参数 corpid or appkey"),
      // i.e. an empty appkey in the URL. Assert the real credential is there.
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('appkey=installer-id'),
        expect.anything()
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.not.stringContaining('appkey=&'),
        expect.anything()
      );
      mockFetch.mockRestore();
    });

    it('still honours the legacy APP_KEY spelling', () => {
      vi.stubEnv('DINGTALK_APP_KEY', 'legacy-id');
      vi.stubEnv('DINGTALK_APP_SECRET', 'legacy-secret');

      const creds = readCredentials(DingTalkClient.fromEnv());

      expect(creds.appKey).toBe('legacy-id');
      expect(creds.appSecret).toBe('legacy-secret');
    });
  });

  describe('DingTalkTokenManager agrees with the client', () => {
    it('accepts the installer-default credential names', async () => {
      vi.stubEnv('DINGTALK_CLIENT_ID', 'installer-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'installer-secret');
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok', access_token: 'tok', expires_in: 7200 }),
      } as Response);

      await expect(new DingTalkTokenManager().getAccessToken()).resolves.toBe('tok');
      // The token manager fetches a bare URL (no RequestInit), so match the
      // first argument only.
      const [calledUrl] = mockFetch.mock.calls[0] as [string];
      expect(calledUrl).toContain('appkey=installer-id');
      mockFetch.mockRestore();
    });

    it('both entry points resolve the same credentials', () => {
      vi.stubEnv('DINGTALK_CLIENT_ID', 'same-id');
      vi.stubEnv('DINGTALK_CLIENT_SECRET', 'same-secret');

      const fromEnv = readCredentials(DingTalkClient.fromEnv());

      expect(fromEnv.appKey).toBe(dingTalkCredentialsFromEnv().appKey);
      expect(fromEnv.appSecret).toBe(dingTalkCredentialsFromEnv().appSecret);
    });
  });
});
