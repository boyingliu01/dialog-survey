/**
 * A production image prunes devDependencies (issue #210), which removes
 * `pino-pretty`. The logger config asked Pino to load it whenever NODE_ENV was
 * not `production`, so a container started without NODE_ENV set died at boot
 * with "unable to determine transport target for 'pino-pretty'" — a startup
 * failure caused entirely by a missing cosmetic formatter.
 *
 * The fix is `isPackageResolvable`, which `createLoggerConfig` consults before
 * naming that transport. These tests cover the predicate itself plus the
 * non-production startup path, which is the path that used to break.
 *
 * Deliberately NOT mocked: `vi.mock('node:module')` does not intercept the
 * `createRequire` that `src/server.ts` binds at import time, so a mocked test
 * passes whether or not the guard exists. An earlier draft of this file made
 * exactly that mistake. The pruned-image case is proved separately, in
 * tests/prune-runtime-deps.test.ts, against the real removed package.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Test doubles, not credentials. `'a'.repeat(32)` is the convention used across
// this suite: the app only checks length (>= 32 chars), and a repeated character
// has no entropy for a secret scanner to flag. The salt must decode to 16 bytes
// of hex, so it is 32 zeroes.
const SESSION_SECRET = 'a'.repeat(32);
const SESSION_SALT = '0'.repeat(32);

async function buildAppFresh(): Promise<
  Awaited<ReturnType<typeof import('../src/server.js').buildApp>>
> {
  vi.resetModules();
  const { buildApp } = await import('../src/server.js');
  return buildApp();
}

describe('isPackageResolvable (issue #210)', () => {
  it('returns true for an installed dependency', async () => {
    const { isPackageResolvable } = await import('../src/server.js');
    expect(isPackageResolvable('pino')).toBe(true);
  });

  it('returns false for a package that is not installed', async () => {
    const { isPackageResolvable } = await import('../src/server.js');
    expect(isPackageResolvable('a-package-that-does-not-exist-210')).toBe(false);
  });

  it('returns false rather than throwing for a malformed specifier', async () => {
    // A guard that throws here would reintroduce the boot failure it prevents.
    const { isPackageResolvable } = await import('../src/server.js');
    expect(() => isPackageResolvable('')).not.toThrow();
    expect(isPackageResolvable('')).toBe(false);
  });
});

describe('non-production startup (issue #210 regression)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SESSION_SECRET', SESSION_SECRET);
    vi.stubEnv('SESSION_SALT', SESSION_SALT);
    // buildApp() constructs the Prisma client, which throws without a
    // connection string. This suite never talks to a database — it only needs
    // the URL to be present so the client can be constructed — so a stub keeps
    // it runnable in CI, where the unit-test job exports no DATABASE_URL.
    // The host is unroutable on purpose: nothing may ever connect through it.
    vi.stubEnv('DATABASE_URL', 'postgresql://stub@127.0.0.1:1/stub');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('builds the app when NODE_ENV is not production', async () => {
    // This is the path that selected the pino-pretty transport. It must succeed
    // whether or not pino-pretty is present, which is what the guard provides.
    const { fastify } = await buildAppFresh();
    expect(fastify.log).toBeDefined();
    expect(() => fastify.log.info('non-production logger works')).not.toThrow();
    await fastify.close();
  });
});
