import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { ScheduledTask } from 'node-cron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DestroyableScheduledTask = Pick<ScheduledTask, 'destroy'>;
type AuditCallback = () => Promise<void>;
type StreamHandler = (message: unknown) => void;
type CompleteApplicationResources = {
  readonly activeTasks: ReadonlySet<Promise<unknown>>;
  readonly disconnect: () => Promise<void>;
  readonly getScheduledTask: () => DestroyableScheduledTask | undefined;
  readonly getStream: () => { readonly disconnect: () => void | Promise<void> } | undefined;
  readonly messageTasks: ReadonlySet<Promise<unknown>>;
};
type CreateApplicationCleanup = (resources: CompleteApplicationResources) => () => Promise<void>;
type CreateSignalHandler = (dependencies: {
  readonly app: { readonly close: () => Promise<void> };
  readonly exit: (exitCode: number) => void;
  readonly log: {
    readonly error: (error: unknown) => void;
    readonly info: (message: string) => void;
  };
}) => (signal: string) => Promise<void>;
type BuiltServerApplication = { readonly fastify: FastifyInstance; readonly prisma: object };
type ServerLifecycleApi = {
  readonly buildApp: (options?: {
    readonly fastifyFactory?: (options: FastifyServerOptions) => FastifyInstance;
  }) => Promise<BuiltServerApplication>;
  readonly createFastify: (options: FastifyServerOptions) => FastifyInstance;
  readonly runPostListenStartup: (built: BuiltServerApplication) => Promise<void>;
  readonly startApplication: (dependencies: {
    readonly build: () => Promise<BuiltServerApplication>;
    readonly listenOptions: { readonly host: string; readonly port: number };
    readonly onCleanupError?: (error: unknown) => void;
    readonly postListen: (built: BuiltServerApplication) => Promise<void>;
  }) => Promise<StartupApp>;
};

const lifecycle = vi.hoisted(() => ({
  auditCallbacks: [] as AuditCallback[],
  cleanupOldLogs: vi.fn<() => Promise<void>>(),
  createVerifyApiKeyError: undefined as Error | undefined,
  disconnect: vi.fn<() => Promise<void>>(),
  processMessage: vi.fn<() => Promise<void>>(),
  staticPluginError: undefined as Error | undefined,
  nextDestroyError: undefined as Error | undefined,
  onDestroy: undefined as (() => void) | undefined,
  onStreamDisconnect: undefined as (() => void) | undefined,
  scheduledTasks: [] as DestroyableScheduledTask[],
  streamConnect: vi.fn<() => Promise<void>>(),
  streamDisconnect: vi.fn<() => Promise<void>>(),
  streamClosing: false,
  streamHandlers: new Map<string, StreamHandler>(),
  streamOnError: undefined as Error | undefined,
}));

vi.mock('@fastify/static', () => ({
  default: (_instance: FastifyInstance, _options: object, done: (error?: Error) => void): void => {
    done(lifecycle.staticPluginError);
  },
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((_expression: string, callback: AuditCallback) => {
      const task: DestroyableScheduledTask = {
        destroy: vi.fn(() => {
          lifecycle.onDestroy?.();
          if (lifecycle.nextDestroyError) return Promise.reject(lifecycle.nextDestroyError);
          return undefined;
        }),
      };
      lifecycle.auditCallbacks.push(callback);
      lifecycle.scheduledTasks.push(task);
      return task;
    }),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function FakePrismaClient() {
    return {
      $disconnect: lifecycle.disconnect,
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      interview: { findMany: vi.fn().mockResolvedValue([]) },
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
}));

vi.mock('../src/services/audit-cleanup.service.js', () => ({
  AuditCleanupService: class FakeAuditCleanupService {
    cleanupOldLogs(): Promise<void> {
      return lifecycle.cleanupOldLogs();
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

    async disconnect(): Promise<void> {
      lifecycle.streamClosing = true;
      lifecycle.streamHandlers.delete('message');
      lifecycle.onStreamDisconnect?.();
      await lifecycle.streamDisconnect();
    }

    on(event: string, handler: StreamHandler): void {
      if (lifecycle.streamOnError) throw lifecycle.streamOnError;
      lifecycle.streamHandlers.set(event, (message) => {
        if (!lifecycle.streamClosing) handler(message);
      });
    }
  },
}));

vi.mock('../src/services/stream-message.service.js', () => ({
  processStreamMessage: lifecycle.processMessage,
}));

vi.mock('../src/utils/security.js', () => ({
  securityMiddleware: vi.fn().mockResolvedValue(undefined),
  createVerifyApiKey: vi.fn(() => {
    if (lifecycle.createVerifyApiKeyError) throw lifecycle.createVerifyApiKeyError;
    return vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('../src/utils/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

async function buildFreshApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../src/server.js');
  const { fastify } = await buildApp();
  return fastify;
}

function hasCompleteApplicationCleanup(
  lifecycleModule: object
): lifecycleModule is { readonly createApplicationCleanup: CreateApplicationCleanup } {
  return (
    'createApplicationCleanup' in lifecycleModule &&
    typeof lifecycleModule.createApplicationCleanup === 'function'
  );
}

async function loadCompleteApplicationCleanup(): Promise<CreateApplicationCleanup> {
  const lifecycleModule = await import('../src/server-lifecycle.js');
  if (!hasCompleteApplicationCleanup(lifecycleModule)) {
    throw new Error('Expected complete application cleanup API');
  }
  return lifecycleModule.createApplicationCleanup;
}

function hasServerLifecycleApi(serverModule: object): serverModule is ServerLifecycleApi {
  return (
    'buildApp' in serverModule &&
    typeof serverModule.buildApp === 'function' &&
    'createFastify' in serverModule &&
    typeof serverModule.createFastify === 'function' &&
    'runPostListenStartup' in serverModule &&
    typeof serverModule.runPostListenStartup === 'function' &&
    'startApplication' in serverModule &&
    typeof serverModule.startApplication === 'function'
  );
}

async function loadServerLifecycleApi(): Promise<ServerLifecycleApi> {
  const serverModule = await import('../src/server.js');
  if (!hasServerLifecycleApi(serverModule)) {
    throw new Error('Expected server lifecycle test API');
  }
  return serverModule;
}

function hasSignalHandlerFactory(
  lifecycleModule: object
): lifecycleModule is { readonly createSignalHandler: CreateSignalHandler } {
  return (
    'createSignalHandler' in lifecycleModule &&
    typeof lifecycleModule.createSignalHandler === 'function'
  );
}

describe('server resource lifecycle', () => {
  beforeEach(() => {
    lifecycle.auditCallbacks.length = 0;
    lifecycle.scheduledTasks.length = 0;
    lifecycle.createVerifyApiKeyError = undefined;
    lifecycle.cleanupOldLogs.mockReset().mockResolvedValue(undefined);
    lifecycle.disconnect.mockReset().mockResolvedValue(undefined);
    lifecycle.nextDestroyError = undefined;
    lifecycle.onDestroy = undefined;
    lifecycle.onStreamDisconnect = undefined;
    lifecycle.processMessage.mockReset().mockResolvedValue(undefined);
    lifecycle.staticPluginError = undefined;
    lifecycle.streamConnect.mockReset().mockResolvedValue(undefined);
    lifecycle.streamDisconnect.mockReset().mockResolvedValue(undefined);
    lifecycle.streamClosing = false;
    lifecycle.streamHandlers.clear();
    lifecycle.streamOnError = undefined;
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32));
    vi.stubEnv('SESSION_SALT', 'b'.repeat(32));
    vi.stubEnv('DINGTALK_CLIENT_ID', 'test-client-id');
    vi.stubEnv('DINGTALK_CLIENT_SECRET', 'test-client-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('disconnects Prisma when construction fails before cron creation', async () => {
    vi.stubEnv('SESSION_SECRET', 'short');

    const { buildApp } = await import('../src/server.js');
    await expect(buildApp()).rejects.toThrow('SESSION_SECRET must be at least 32 characters');

    expect(lifecycle.scheduledTasks).toHaveLength(0);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('destroys cron and disconnects Prisma when construction fails after cron creation', async () => {
    const setupError = new Error('route setup failed');
    lifecycle.createVerifyApiKeyError = setupError;

    const { buildApp } = await import('../src/server.js');
    await expect(buildApp()).rejects.toBe(setupError);

    expect(lifecycle.scheduledTasks[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves the construction error when cron and Prisma cleanup also fail', async () => {
    const setupError = new Error('route setup failed');
    lifecycle.createVerifyApiKeyError = setupError;
    lifecycle.nextDestroyError = new Error('destroy failed');
    lifecycle.disconnect.mockRejectedValue(new Error('disconnect failed'));

    const { buildApp } = await import('../src/server.js');
    await expect(buildApp()).rejects.toBe(setupError);

    expect(lifecycle.scheduledTasks[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('waits for an active audit cleanup before disconnecting Prisma', async () => {
    let finishCleanup: (() => void) | undefined;
    lifecycle.cleanupOldLogs.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    let signalDestroy: (() => void) | undefined;
    const destroyStarted = new Promise<void>((resolve) => {
      signalDestroy = resolve;
    });
    lifecycle.onDestroy = () => signalDestroy?.();
    const app = await buildFreshApp();
    const activeCleanup = lifecycle.auditCallbacks[0]?.();
    if (!activeCleanup) throw new Error('Expected an audit cleanup callback');

    const close = app.close();
    await destroyStarted;

    expect(lifecycle.scheduledTasks[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).not.toHaveBeenCalled();

    finishCleanup?.();
    await Promise.all([activeCleanup, close]);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('destroys cron and disconnects Prisma exactly once across repeated close calls', async () => {
    const app = await buildFreshApp();

    await app.close();
    await app.close();

    expect(lifecycle.scheduledTasks[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates a Prisma disconnect failure from normal close', async () => {
    const disconnectError = new Error('disconnect failed');
    lifecycle.disconnect.mockRejectedValue(disconnectError);
    const app = await buildFreshApp();

    const closeError = await app.close().catch((error: unknown) => error);
    expect(closeError).toBeInstanceOf(AggregateError);
    if (!(closeError instanceof AggregateError)) throw new Error('Expected AggregateError');
    expect(closeError.errors).toEqual([disconnectError]);
    expect(lifecycle.scheduledTasks[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('retains every cleanup failure in an AggregateError', async () => {
    const streamError = new Error('stream failed');
    const cronError = new Error('cron failed');
    const taskError = new Error('task failed');
    const databaseError = new Error('database failed');
    const createApplicationCleanup = await loadCompleteApplicationCleanup();
    const cleanup = createApplicationCleanup({
      activeTasks: new Set([Promise.reject(taskError)]),
      disconnect: vi.fn().mockRejectedValue(databaseError),
      getScheduledTask: () => ({ destroy: vi.fn().mockRejectedValue(cronError) }),
      getStream: () => ({ disconnect: vi.fn(() => Promise.reject(streamError)) }),
      messageTasks: new Set(),
    });

    const closeError = await cleanup().catch((error: unknown) => error);

    expect(closeError).toBeInstanceOf(AggregateError);
    if (!(closeError instanceof AggregateError)) throw new Error('Expected AggregateError');
    expect(closeError.errors).toEqual([streamError, cronError, taskError, databaseError]);
  });

  it('disconnects the application-owned stream on app close', async () => {
    vi.stubEnv('DINGTALK_AGENT_ID', 'test-agent-id');
    const serverModule = await loadServerLifecycleApi();
    const built = await serverModule.buildApp();
    await serverModule.runPostListenStartup(built);

    await built.fastify.close();

    expect(lifecycle.streamDisconnect).toHaveBeenCalledTimes(1);
  });

  it('awaits active message processing before disconnecting Prisma', async () => {
    vi.stubEnv('DINGTALK_AGENT_ID', 'test-agent-id');
    let finishMessage: (() => void) | undefined;
    lifecycle.processMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishMessage = resolve;
        })
    );
    const serverModule = await loadServerLifecycleApi();
    const built = await serverModule.buildApp();
    await serverModule.runPostListenStartup(built);
    const messageHandler = lifecycle.streamHandlers.get('message');
    if (!messageHandler) throw new Error('Expected stream message handler');
    messageHandler({ headers: { messageId: 'message-1', topic: 'topic' } });

    let signalStreamDisconnect: (() => void) | undefined;
    const streamDisconnected = new Promise<void>((resolve) => {
      signalStreamDisconnect = resolve;
    });
    let finishSocketClose: (() => void) | undefined;
    const socketClosed = new Promise<void>((resolve) => {
      finishSocketClose = resolve;
    });
    lifecycle.streamDisconnect.mockReturnValue(socketClosed);
    lifecycle.onStreamDisconnect = () => signalStreamDisconnect?.();
    const close = built.fastify.close();
    await streamDisconnected;

    expect(lifecycle.streamDisconnect).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).not.toHaveBeenCalled();
    messageHandler({ headers: { messageId: 'late-message', topic: 'topic' } });
    expect(lifecycle.processMessage).toHaveBeenCalledTimes(1);
    finishSocketClose?.();
    await Promise.resolve();
    expect(lifecycle.disconnect).not.toHaveBeenCalled();
    finishMessage?.();
    await close;
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects a partially initialized stream while preserving startup error', async () => {
    vi.stubEnv('DINGTALK_AGENT_ID', 'test-agent-id');
    const startupError = new Error('stream handler setup failed');
    lifecycle.streamOnError = startupError;
    const serverModule = await loadServerLifecycleApi();

    await expect(
      serverModule.startApplication({
        build: serverModule.buildApp,
        listenOptions: { host: '127.0.0.1', port: 0 },
        postListen: serverModule.runPostListenStartup,
      })
    ).rejects.toBe(startupError);

    expect(lifecycle.streamDisconnect).toHaveBeenCalledTimes(1);
    expect(lifecycle.disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes Fastify when the earliest plugin registration fails', async () => {
    const pluginError = new Error('static plugin failed');
    lifecycle.staticPluginError = pluginError;
    const onClose = vi.fn();
    const serverModule = await loadServerLifecycleApi();

    await expect(
      serverModule.buildApp({
        fastifyFactory: (options) => {
          const app = serverModule.createFastify(options);
          app.addHook('onClose', onClose);
          return app;
        },
      })
    ).rejects.toBe(pluginError);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

type StartupApp = Pick<FastifyInstance, 'close' | 'listen'>;

type StartupDependencies = {
  readonly build: () => Promise<{ readonly fastify: StartupApp }>;
  readonly listenOptions: { readonly host: string; readonly port: number };
  readonly onCleanupError?: (error: unknown) => void;
  readonly postListen: (built: { readonly fastify: StartupApp }) => Promise<void>;
};

type StartApplication = (dependencies: StartupDependencies) => Promise<StartupApp>;

type ShutdownApplication = (
  app: Pick<FastifyInstance, 'close'>,
  signal: string,
  log: {
    readonly error: (error: unknown) => void;
    readonly info: (message: string) => void;
  }
) => Promise<number>;

function hasStartApplication(
  serverModule: object
): serverModule is { readonly startApplication: StartApplication } {
  return 'startApplication' in serverModule && typeof serverModule.startApplication === 'function';
}

async function loadStartApplication(): Promise<StartApplication> {
  const serverModule = await import('../src/server.js');
  if (!hasStartApplication(serverModule)) {
    throw new Error('Expected server module to export startApplication');
  }
  return serverModule.startApplication;
}

function hasShutdownApplication(
  lifecycleModule: object
): lifecycleModule is { readonly shutdownApplication: ShutdownApplication } {
  return (
    'shutdownApplication' in lifecycleModule &&
    typeof lifecycleModule.shutdownApplication === 'function'
  );
}

async function loadShutdownApplication(): Promise<ShutdownApplication> {
  const serverModule = await import('../src/server-lifecycle.js');
  if (!hasShutdownApplication(serverModule)) {
    throw new Error('Expected lifecycle module to export shutdownApplication');
  }
  return serverModule.shutdownApplication;
}

describe('production startup lifecycle', () => {
  it('closes the built app before propagating a listen rejection', async () => {
    const listenError = new Error('listen failed');
    const app: StartupApp = {
      listen: vi.fn().mockRejectedValue(listenError),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const startApplication = await loadStartApplication();

    await expect(
      startApplication({
        build: vi.fn().mockResolvedValue({ fastify: app }),
        listenOptions: { host: '127.0.0.1', port: 0 },
        postListen: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toBe(listenError);

    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('closes the listening app before propagating a post-listen failure', async () => {
    const startupError = new Error('post-listen failed');
    const app: StartupApp = {
      listen: vi.fn().mockResolvedValue('http://127.0.0.1'),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const startApplication = await loadStartApplication();

    await expect(
      startApplication({
        build: vi.fn().mockResolvedValue({ fastify: app }),
        listenOptions: { host: '127.0.0.1', port: 0 },
        postListen: vi.fn().mockRejectedValue(startupError),
      })
    ).rejects.toBe(startupError);

    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('preserves a startup error when app cleanup also fails', async () => {
    const startupError = new Error('post-listen failed');
    const app: StartupApp = {
      listen: vi.fn().mockResolvedValue('http://127.0.0.1'),
      close: vi.fn().mockRejectedValue(new Error('close failed')),
    };
    const startApplication = await loadStartApplication();

    await expect(
      startApplication({
        build: vi.fn().mockResolvedValue({ fastify: app }),
        listenOptions: { host: '127.0.0.1', port: 0 },
        postListen: vi.fn().mockRejectedValue(startupError),
      })
    ).rejects.toBe(startupError);

    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('logs the cleanup aggregate while preserving a partial stream startup error', async () => {
    const startupError = new Error('stream setup failed');
    const cleanupError = new AggregateError([new Error('stream disconnect failed')]);
    const onCleanupError = vi.fn();
    const app: StartupApp = {
      listen: vi.fn().mockResolvedValue('http://127.0.0.1'),
      close: vi.fn().mockRejectedValue(cleanupError),
    };
    const startApplication = await loadStartApplication();

    await expect(
      startApplication({
        build: vi.fn().mockResolvedValue({ fastify: app }),
        listenOptions: { host: '127.0.0.1', port: 0 },
        onCleanupError,
        postListen: vi.fn().mockRejectedValue(startupError),
      })
    ).rejects.toBe(startupError);

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError);
  });

  it('preserves the primary error when the cleanup observer throws', async () => {
    const primaryError = new Error('startup failed');
    const app = { close: vi.fn().mockRejectedValue(new Error('close failed')) };
    const { closePreservingPrimaryError } = await import('../src/server-lifecycle.js');

    await expect(
      closePreservingPrimaryError(app, primaryError, () => {
        throw new Error('observer failed');
      })
    ).rejects.toBe(primaryError);
  });
});

describe('graceful shutdown lifecycle', () => {
  it('logs shutdown and returns zero after a clean close', async () => {
    const app = { close: vi.fn().mockResolvedValue(undefined) };
    const log = { error: vi.fn(), info: vi.fn() };
    const shutdownApplication = await loadShutdownApplication();

    const exitCode = await shutdownApplication(app, 'SIGTERM', log);

    expect(log.info).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully');
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });

  it('logs close failure and returns nonzero', async () => {
    const shutdownError = new Error('disconnect failed');
    const app = { close: vi.fn().mockRejectedValue(shutdownError) };
    const log = { error: vi.fn(), info: vi.fn() };
    const shutdownApplication = await loadShutdownApplication();

    const exitCode = await shutdownApplication(app, 'SIGINT', log);

    expect(log.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully');
    expect(log.error).toHaveBeenCalledWith(shutdownError);
    expect(exitCode).toBe(1);
  });

  it('coalesces concurrent signal handlers onto one shutdown promise', async () => {
    let finishClose: (() => void) | undefined;
    const app = {
      close: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishClose = resolve;
          })
      ),
    };
    const exit = vi.fn();
    const log = { error: vi.fn(), info: vi.fn() };
    const lifecycleModule = await import('../src/server-lifecycle.js');
    if (!hasSignalHandlerFactory(lifecycleModule)) {
      throw new Error('Expected lifecycle module to export createSignalHandler');
    }
    const handleSignal = lifecycleModule.createSignalHandler({ app, exit, log });

    const first = handleSignal('SIGTERM');
    const second = handleSignal('SIGINT');
    finishClose?.();
    await Promise.all([first, second]);

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('removes owned signal listeners when the application closes', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const closeListeners: Array<() => void> = [];
    const staleListeners: Array<() => void> = [];
    const target = {
      off: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
      on: vi.fn((event: string, listener: () => void) => {
        const eventListeners = listeners.get(event) ?? new Set<() => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        staleListeners.push(listener);
      }),
    };
    const app = {
      close: vi.fn().mockResolvedValue(undefined),
      server: {
        once: vi.fn((_event: 'close', listener: () => void) => closeListeners.push(listener)),
      },
    };
    const exit = vi.fn();
    const log = { error: vi.fn(), info: vi.fn() };
    const lifecycleModule = await import('../src/server-lifecycle.js');
    if (
      !('registerSignalHandlers' in lifecycleModule) ||
      typeof lifecycleModule.registerSignalHandlers !== 'function'
    ) {
      throw new Error('Expected lifecycle module to export registerSignalHandlers');
    }

    lifecycleModule.registerSignalHandlers({ app, exit, log, target });
    const firstCloseListeners = closeListeners.splice(0);
    for (const listener of firstCloseListeners) listener();
    lifecycleModule.registerSignalHandlers({ app, exit, log, target });

    expect(listeners.get('SIGTERM')).toHaveLength(1);
    expect(listeners.get('SIGINT')).toHaveLength(1);
    for (const listener of staleListeners.slice(0, 2)) listener();
    await Promise.resolve();
    await Promise.resolve();
    const secondCloseListeners = closeListeners.splice(0);
    for (const listener of secondCloseListeners) listener();

    expect(target.off).toHaveBeenCalledTimes(4);
    expect(exit).not.toHaveBeenCalled();
  });
});
