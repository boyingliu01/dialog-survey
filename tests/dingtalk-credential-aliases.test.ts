import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DingTalkClient, dingTalkCredentialsFromEnv } from '../src/integrations/dingtalk/client.js';
import { DingTalkStreamClient } from '../src/integrations/dingtalk/stream-client.js';

/**
 * @test REQ-DINGTALK-CRED-01
 * @intent 验证 REST 与 Stream 两侧接受同一套钉钉凭据环境变量名（APP_KEY/SECRET 与 CLIENT_ID/SECRET 互为别名）
 * @covers DINGTALK_APP_KEY/SECRET 可用、DINGTALK_CLIENT_ID/SECRET 可用、两者并存时优先 APP_KEY、Stream 与 REST 行为一致
 *
 * A deployment configured with `DINGTALK_APP_KEY`/`DINGTALK_APP_SECRET` (the
 * names DingTalk's own console uses) used to work for REST — which fell back —
 * while the Stream socket read only `DINGTALK_CLIENT_ID` and silently never
 * connected. Outbound messages went out; the bot received nothing. That looks
 * like a Stream/network problem rather than a config one, so these tests pin
 * the two call sites to the same resolver.
 */
const CRED_VARS = [
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
  'DINGTALK_ROBOT_CODE',
] as const;

function clearCredEnv(): void {
  for (const key of CRED_VARS) delete process.env[key];
}

/** fromEnv() keeps credentials private, so read them off a fresh instance. */
function streamCreds(): { clientId: unknown; clientSecret: unknown } {
  const client = DingTalkStreamClient.fromEnv() as unknown as {
    config: { clientId: unknown; clientSecret: unknown };
  };
  return { clientId: client.config.clientId, clientSecret: client.config.clientSecret };
}

describe('DingTalk credential resolution', () => {
  beforeEach(clearCredEnv);
  afterEach(clearCredEnv);

  describe('dingTalkCredentialsFromEnv', () => {
    it('reads the APP_KEY/APP_SECRET spelling', () => {
      process.env['DINGTALK_APP_KEY'] = 'app-key';
      process.env['DINGTALK_APP_SECRET'] = 'app-secret';

      expect(dingTalkCredentialsFromEnv()).toEqual({ appKey: 'app-key', appSecret: 'app-secret' });
    });

    it('reads the CLIENT_ID/CLIENT_SECRET spelling', () => {
      process.env['DINGTALK_CLIENT_ID'] = 'client-id';
      process.env['DINGTALK_CLIENT_SECRET'] = 'client-secret';

      expect(dingTalkCredentialsFromEnv()).toEqual({
        appKey: 'client-id',
        appSecret: 'client-secret',
      });
    });

    it('prefers APP_KEY when both spellings are set', () => {
      process.env['DINGTALK_APP_KEY'] = 'app-key';
      process.env['DINGTALK_CLIENT_ID'] = 'client-id';

      expect(dingTalkCredentialsFromEnv().appKey).toBe('app-key');
    });

    it('returns empty strings when nothing is configured', () => {
      expect(dingTalkCredentialsFromEnv()).toEqual({ appKey: '', appSecret: '' });
    });
  });

  describe('Stream client', () => {
    it('connects with credentials given as APP_KEY/APP_SECRET', () => {
      process.env['DINGTALK_APP_KEY'] = 'app-key';
      process.env['DINGTALK_APP_SECRET'] = 'app-secret';

      expect(streamCreds()).toEqual({ clientId: 'app-key', clientSecret: 'app-secret' });
    });

    it('connects with credentials given as CLIENT_ID/CLIENT_SECRET', () => {
      process.env['DINGTALK_CLIENT_ID'] = 'client-id';
      process.env['DINGTALK_CLIENT_SECRET'] = 'client-secret';

      expect(streamCreds()).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
    });

    it('resolves the same credentials as the REST client', () => {
      process.env['DINGTALK_APP_KEY'] = 'shared-key';
      process.env['DINGTALK_APP_SECRET'] = 'shared-secret';

      const rest = dingTalkCredentialsFromEnv();
      const stream = streamCreds();

      expect(stream.clientId).toBe(rest.appKey);
      expect(stream.clientSecret).toBe(rest.appSecret);
    });
  });

  describe('agentId is not carried by the clients', () => {
    /**
     * @test REQ-DINGTALK-CRED-02
     * @intent 验证客户端不再携带无人读取的 agentId 配置，避免调用方误以为它生效
     * @covers DingTalkClient.fromEnv 与 DingTalkStreamClient.fromEnv 不把 agentId 放进配置对象
     *
     * Only `message-sender.ts` needs agentId, and it reads the env var directly.
     * Both clients used to accept and then drop it.
     */
    it('keeps agentId out of the REST client options', () => {
      process.env['DINGTALK_APP_KEY'] = 'k';
      process.env['DINGTALK_APP_SECRET'] = 's';
      process.env['DINGTALK_AGENT_ID'] = 'agent-123';

      const client = DingTalkClient.fromEnv() as unknown as { options?: Record<string, unknown> };

      expect(JSON.stringify(client)).not.toContain('agent-123');
    });

    it('keeps agentId out of the Stream client config', () => {
      process.env['DINGTALK_APP_KEY'] = 'k';
      process.env['DINGTALK_APP_SECRET'] = 's';
      process.env['DINGTALK_AGENT_ID'] = 'agent-123';

      const client = DingTalkStreamClient.fromEnv() as unknown as {
        config: Record<string, unknown>;
      };

      expect(client.config).not.toHaveProperty('agentId');
    });

    it('still passes robotCode through on the Stream client', () => {
      process.env['DINGTALK_APP_KEY'] = 'k';
      process.env['DINGTALK_APP_SECRET'] = 's';
      process.env['DINGTALK_ROBOT_CODE'] = 'robot-9';

      const client = DingTalkStreamClient.fromEnv() as unknown as {
        config: Record<string, unknown>;
      };

      expect(client.config['robotCode']).toBe('robot-9');
    });
  });
});
