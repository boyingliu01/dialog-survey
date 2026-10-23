import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @test REQ-200-STREAM-CREDENTIALS
 * @intent 证明 `fromEnv` 真的从 DINGTALK_APP_KEY/APP_SECRET 读到凭据，而不只是能构造出对象
 * @covers 凭据别名解析、robotCode 可选透传、缺少凭据时抛错
 *
 * The pre-existing `fromEnv` test asserted only `toBeInstanceOf`, so it passed
 * before and after the #200 fix. That is why Gate M scored this file at 53.5%
 * despite it being covered: the assertion could not tell the two behaviours
 * apart. Credentials are observed where they actually surface — in the request
 * body of the connection-token call.
 */

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 0;
    send(): void {}
    close(): void {
      this.readyState = 3;
      this.emit('close', 1000, Buffer.from(''));
    }
    terminate(): void {
      this.readyState = 3;
      this.emit('close', 1006, Buffer.from(''));
    }
  }
  return { WebSocket: FakeWebSocket };
});

const { DingTalkStreamClient } = await import('../src/integrations/dingtalk/stream-client.js');

const CREDENTIAL_ENV = [
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_ROBOT_CODE',
  'DINGTALK_AGENT_ID',
] as const;

const originalEnv = Object.fromEntries(CREDENTIAL_ENV.map((k) => [k, process.env[k]]));

function clearCredentialEnv(): void {
  for (const key of CREDENTIAL_ENV) delete process.env[key];
}

/** The JSON body handed to the gateway, i.e. the credentials actually used. */
async function capturedBody(client: InstanceType<typeof DingTalkStreamClient>): Promise<string> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ endpoint: 'wss://x', ticket: 't' }),
  });
  global.fetch = fetchMock;
  await client.getConnectionToken();
  const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
  return call[1].body;
}

describe('DingTalkStreamClient.fromEnv credentials', () => {
  beforeEach(() => {
    clearCredentialEnv();
  });

  afterEach(() => {
    for (const key of CREDENTIAL_ENV) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('reads DINGTALK_APP_KEY / DINGTALK_APP_SECRET', async () => {
    process.env['DINGTALK_APP_KEY'] = 'app-key-1';
    process.env['DINGTALK_APP_SECRET'] = 'app-secret-1';

    const body = await capturedBody(DingTalkStreamClient.fromEnv());

    expect(body).toContain('app-key-1');
    expect(body).toContain('app-secret-1');
  });

  it('still reads the legacy DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET', async () => {
    process.env['DINGTALK_CLIENT_ID'] = 'legacy-key';
    process.env['DINGTALK_CLIENT_SECRET'] = 'legacy-secret';

    const body = await capturedBody(DingTalkStreamClient.fromEnv());

    expect(body).toContain('legacy-key');
    expect(body).toContain('legacy-secret');
  });

  it('prefers the APP_KEY spelling when both are set', async () => {
    process.env['DINGTALK_APP_KEY'] = 'winner-key';
    process.env['DINGTALK_APP_SECRET'] = 'winner-secret';
    process.env['DINGTALK_CLIENT_ID'] = 'loser-key';
    process.env['DINGTALK_CLIENT_SECRET'] = 'loser-secret';

    const body = await capturedBody(DingTalkStreamClient.fromEnv());

    expect(body).toContain('winner-key');
    expect(body).not.toContain('loser-key');
  });

  it('throws when no credentials are configured', () => {
    // Booting without credentials is a supported read-only mode, so this must
    // fail loudly at construction rather than connecting with empty strings.
    expect(() => DingTalkStreamClient.fromEnv()).toThrow(/clientId is required/);
  });

  it('throws when only the key is configured', () => {
    process.env['DINGTALK_APP_KEY'] = 'lonely-key';

    expect(() => DingTalkStreamClient.fromEnv()).toThrow(/clientSecret is required/);
  });

  it('carries DINGTALK_ROBOT_CODE through', async () => {
    process.env['DINGTALK_APP_KEY'] = 'k';
    process.env['DINGTALK_APP_SECRET'] = 's';
    process.env['DINGTALK_ROBOT_CODE'] = 'robot-9';

    const client = DingTalkStreamClient.fromEnv();

    expect((client as unknown as { config: { robotCode?: string } }).config.robotCode).toBe(
      'robot-9'
    );
  });

  it('leaves robotCode undefined when it is not configured', () => {
    process.env['DINGTALK_APP_KEY'] = 'k';
    process.env['DINGTALK_APP_SECRET'] = 's';

    const client = DingTalkStreamClient.fromEnv();

    expect(
      (client as unknown as { config: { robotCode?: string } }).config.robotCode
    ).toBeUndefined();
  });

  it('ignores the retired DINGTALK_AGENT_ID', () => {
    process.env['DINGTALK_APP_KEY'] = 'k';
    process.env['DINGTALK_APP_SECRET'] = 's';
    process.env['DINGTALK_AGENT_ID'] = 'agent-1';

    const client = DingTalkStreamClient.fromEnv();

    // The field was removed from the config interface; it must not resurface.
    expect(
      (client as unknown as { config: Record<string, unknown> }).config['agentId']
    ).toBeUndefined();
  });
});
