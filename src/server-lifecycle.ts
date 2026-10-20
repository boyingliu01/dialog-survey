import type { FastifyInstance } from 'fastify';
import type { ScheduledTask } from 'node-cron';

export type ApplicationResources = {
  readonly activeTasks: ReadonlySet<Promise<unknown>>;
  readonly disconnect: () => Promise<void>;
  readonly getScheduledTask: () => Pick<ScheduledTask, 'destroy'> | undefined;
  readonly getStream?: () => { readonly disconnect: () => void | Promise<void> } | undefined;
  readonly messageTasks?: ReadonlySet<Promise<unknown>>;
};

export type StartupApplication = Pick<FastifyInstance, 'close' | 'listen'>;

export type ShutdownLogger = {
  readonly error: (error: unknown) => void;
  readonly info: (message: string) => void;
};

export type SignalHandlerDependencies = {
  readonly app: { readonly close: () => Promise<void> };
  readonly exit: (exitCode: number) => void;
  readonly log: ShutdownLogger;
};

export type SignalTarget = {
  readonly off: (event: 'SIGINT' | 'SIGTERM', listener: () => void) => void;
  readonly on: (event: 'SIGINT' | 'SIGTERM', listener: () => void) => void;
};

export type StartupDependencies<TBuilt extends { readonly fastify: StartupApplication }> = {
  readonly build: () => Promise<TBuilt>;
  readonly listenOptions: { readonly host: string; readonly port: number };
  readonly onCleanupError?: (error: unknown) => void;
  readonly postListen: (built: TBuilt) => Promise<void>;
};

export function createApplicationCleanup(resources: ApplicationResources): () => Promise<void> {
  let cleanup: Promise<void> | undefined;

  return () => {
    cleanup ??= cleanupApplicationResources(resources);
    return cleanup;
  };
}

/** Collect rejections from a settled batch into the shared error list. */
function collectRejections(results: PromiseSettledResult<unknown>[], sink: unknown[]): void {
  for (const result of results) {
    if (result.status === 'rejected') sink.push(result.reason);
  }
}

/**
 * Run one cleanup step, recording (not throwing) its failure so the remaining
 * steps still run. Every resource tears down the same way, which is why this is
 * one helper rather than a repeated try/catch per resource.
 */
async function step(sink: unknown[], action: () => unknown): Promise<void> {
  try {
    await action();
  } catch (error) {
    sink.push(error);
  }
}

async function cleanupApplicationResources(resources: ApplicationResources): Promise<void> {
  const cleanupErrors: unknown[] = [];
  const stream = resources.getStream?.();
  const scheduledTask = resources.getScheduledTask();

  if (stream) {
    await step(cleanupErrors, () => stream.disconnect());
  }

  collectRejections(await Promise.allSettled([...(resources.messageTasks ?? [])]), cleanupErrors);

  if (scheduledTask) {
    await step(cleanupErrors, () => scheduledTask.destroy());
  }

  collectRejections(await Promise.allSettled([...resources.activeTasks]), cleanupErrors);

  await step(cleanupErrors, () => resources.disconnect());

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Application resource cleanup failed');
  }
}

export async function closePreservingPrimaryError(
  app: Pick<FastifyInstance, 'close'>,
  primaryError: unknown,
  onCleanupError?: (error: unknown) => void
): Promise<never> {
  try {
    await app.close();
  } catch (cleanupError) {
    try {
      onCleanupError?.(cleanupError);
    } catch {
      // Cleanup observers are diagnostics only; the primary error remains authoritative.
    }
  }
  throw primaryError;
}

export async function startApplication<TBuilt extends { readonly fastify: StartupApplication }>(
  dependencies: StartupDependencies<TBuilt>
): Promise<TBuilt['fastify']> {
  const built = await dependencies.build();

  try {
    await built.fastify.listen(dependencies.listenOptions);
    await dependencies.postListen(built);
    return built.fastify;
  } catch (startupError) {
    return closePreservingPrimaryError(built.fastify, startupError, dependencies.onCleanupError);
  }
}

export async function shutdownApplication(
  app: { readonly close: () => Promise<void> },
  signal: string,
  log: ShutdownLogger
): Promise<number> {
  log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await app.close();
    return 0;
  } catch (shutdownError) {
    log.error(shutdownError);
    return 1;
  }
}

export function createSignalHandler(
  dependencies: SignalHandlerDependencies
): (signal: string) => Promise<void> {
  let shutdown: Promise<void> | undefined;

  return (signal) => {
    shutdown ??= shutdownApplication(dependencies.app, signal, dependencies.log).then(
      (exitCode) => {
        dependencies.exit(exitCode);
      }
    );
    return shutdown;
  };
}

export function registerSignalHandlers(
  dependencies: SignalHandlerDependencies & {
    readonly app: SignalHandlerDependencies['app'] & {
      readonly server: { readonly once: (event: 'close', listener: () => void) => void };
    };
    readonly target: SignalTarget;
  }
): void {
  const handleSignal = createSignalHandler(dependencies);
  let active = true;
  const onSigterm = (): void => {
    if (active) void handleSignal('SIGTERM');
  };
  const onSigint = (): void => {
    if (active) void handleSignal('SIGINT');
  };
  dependencies.target.on('SIGTERM', onSigterm);
  dependencies.target.on('SIGINT', onSigint);
  dependencies.app.server.once('close', () => {
    active = false;
    dependencies.target.off('SIGTERM', onSigterm);
    dependencies.target.off('SIGINT', onSigint);
  });
}
