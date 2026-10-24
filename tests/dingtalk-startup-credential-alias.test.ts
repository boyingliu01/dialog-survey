import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @test REQ-DINGTALK-CRED-03
 * @intent 验证凭据别名（DINGTALK_APP_KEY/SECRET）在服务启动判定处同样生效，Stream 客户端会被真正创建并连接
 * @covers createDingTalkStreamClientOrWarn 与 isDingTalkConfigured 走共享解析器：APP_KEY/SECRET 视为已配置、CLIENT_ID/SECRET 仍可、都缺时保持只读启动
 *
 * #204 was fixed inside `DingTalkStreamClient.fromEnv`, but the server gates the
 * Stream client on its own env check before `fromEnv` is ever reached. With only
 * the alias set, `fromEnv` was never called, so the fix was unreachable in
 * production while every client-level test passed: the startup path took the
 * read-only branch and the bot stayed silent. These tests observe the gate by
 * whether a connection is attempted, not by log text.
 */

const lifecycle = vi.hoisted(() => ({
  disconnect: vi.fn<() => Promise<void>>(),
  interviewFindMany: vi.fn<() => Promise<unknown[]>>(),
  processMessage: vi.fn<() => Promise<void>>(),
  sendText: vi.fn<() => Promise<unknown>>(),
  scheduledTasks: [] as Array<{ destroy: () => Promise<void> | undefined }>,
  streamConnect: vi.fn<() => Promise<void>>(),
  streamDisconnect: vi.fn<() => Promise<void>>(),
  streamHandlers: new Map<string, (message: unknown) => void>(),
}));

vi.mock('@fastify/static', () => ({
  default: (_instance: unknown, _options: object, done: (error?: Error) => void): void => {
    done();
  },
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => {
      const task = { destroy: vi.fn(() => undefined) };
      lifecycle.scheduledTasks.push(task);
      return task;
    }),
  },
}));

vi.mock('../src/utils/prisma-client.js', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    PrismaClient: function FakePrismaClient() {
      return {
        $disconnect: lifecycle.disconnect,
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        interview: { findMany: lifecycle.interviewFindMany },
        interviewPlan: {
          create: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        template: {
          create: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
    },
  };
});

vi.mock('../src/services/audit-cleanup.service.js', () => ({
  AuditCleanupService: class FakeAuditCleanupService {
    cleanupOldLogs(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

vi.mock('../src/integrations/dingtalk/stream-client.js', () => ({
  DingTalkStreamClient: class FakeDingTalkStreamClient {
    static fromEnv(): FakeDingTalkStreamClient {
      return new FakeDingTalkStreamClient();
    }

    connect(): Promise<void> {
      return lifecycle.streamConnect();
    }

    disconnect(): Promise<void> {
      lifecycle.streamHandlers.delete('message');
      return lifecycle.streamDisconnect();
    }

    on(event: string, handler: (message: unknown) => void): void {
      lifecycle.streamHandlers.set(event, handler);
    }
  },
}));

vi.mock('../src/services/stream-message.service.js', () => ({
  processStreamMessage: lifecycle.processMessage,
}));

vi.mock('../src/integrations/dingtalk/message-sender.js', () => ({
  DingTalkMessageSender: class FakeDingTalkMessageSender {
    sendTextMessage(): Promise<unknown> {
      return lifecycle.sendText();
    }
  },
}));

const CRED_ENV = [
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'DINGTALK_CLIENT_ID',
  'DINGTALK_CLIENT_SECRET',
  'DINGTALK_AGENT_ID',
] as const;

interface BuiltServer {
  readonly fastify: { close: () => Promise<void> };
}

interface ServerApi {
  readonly buildApp: () => Promise<BuiltServer>;
  readonly runPostListenStartup: (built: BuiltServer) => Promise<void>;
}

async function loadServer(): Promise<ServerApi> {
  const serverModule = await import('../src/server.js');
  return serverModule as unknown as ServerApi;
}

describe('DingTalk credential aliases reach the startup gate', () => {
  beforeEach(() => {
    lifecycle.streamConnect.mockReset().mockResolvedValue(undefined);
    lifecycle.streamDisconnect.mockReset().mockResolvedValue(undefined);
    lifecycle.sendText.mockReset().mockResolvedValue({
      taskId: 'task-1',
      successCount: 1,
      failedUserIds: [],
    });
    lifecycle.interviewFindMany.mockReset().mockResolvedValue([]);
    lifecycle.processMessage.mockReset().mockResolvedValue(undefined);
    lifecycle.streamHandlers.clear();

    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32));
    vi.stubEnv('SESSION_SALT', 'b'.repeat(32));
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/dialog_survey_test');
    vi.stubEnv('DINGTALK_AGENT_ID', 'agent-1');
    vi.stubEnv('DISABLE_STARTUP_RESEND', '1');
    for (const key of CRED_ENV) {
      if (key !== 'DINGTALK_AGENT_ID') vi.stubEnv(key, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Start the app with the credentials currently stubbed and report the connect attempt. */
  async function startup(): Promise<{ connectCalls: number }> {
    const { buildApp, runPostListenStartup } = await loadServer();
    const built = await buildApp();
    await runPostListenStartup(built);
    await built.fastify.close();
    return { connectCalls: lifecycle.streamConnect.mock.calls.length };
  }

  it('connects the stream when only DINGTALK_APP_KEY/APP_SECRET are set', async () => {
    vi.stubEnv('DINGTALK_APP_KEY', 'app-key');
    vi.stubEnv('DINGTALK_APP_SECRET', 'app-secret');

    // The gate must not classify this deployment as credential-free: a bot that
    // never attempts the socket is exactly the silent failure #204 reported.
    expect(await startup()).toEqual({ connectCalls: 1 });
  });

  it('still connects the stream with the canonical CLIENT_ID/CLIENT_SECRET spelling', async () => {
    vi.stubEnv('DINGTALK_CLIENT_ID', 'client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'client-secret');

    expect(await startup()).toEqual({ connectCalls: 1 });
  });

  it('stays credential-free when no spelling is configured', async () => {
    expect(await startup()).toEqual({ connectCalls: 0 });
  });

  it('resends unsent messages for an APP_KEY-only deployment (issue #171 gate)', async () => {
    vi.stubEnv('DINGTALK_APP_KEY', 'app-key');
    vi.stubEnv('DINGTALK_APP_SECRET', 'app-secret');
    vi.stubEnv('DISABLE_STARTUP_RESEND', '');
    lifecycle.interviewFindMany.mockResolvedValue([
      {
        id: 'iv-1',
        userId: 'user-1',
        messages: [{ role: 'assistant', content: 'follow-up?' }],
      },
    ]);

    await startup();

    // isDingTalkConfigured() used to read the canonical names directly, so an
    // alias-configured deployment silently skipped the startup resend too.
    expect(lifecycle.sendText).toHaveBeenCalledTimes(1);
  });

  it('does not resend when the app credentials are missing even if agentId is set', async () => {
    vi.stubEnv('DISABLE_STARTUP_RESEND', '');
    lifecycle.interviewFindMany.mockResolvedValue([
      {
        id: 'iv-1',
        userId: 'user-1',
        messages: [{ role: 'assistant', content: 'follow-up?' }],
      },
    ]);

    await startup();

    expect(lifecycle.sendText).not.toHaveBeenCalled();
  });
});
