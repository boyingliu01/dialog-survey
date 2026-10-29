import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The lockfile must not pin every dependency to one third-party registry.
 *
 * `npm ci` fetches the exact `resolved` URL recorded in `package-lock.json`.
 * Neither `npm config set registry` nor `NPM_CONFIG_REGISTRY` rewrites those
 * URLs for lockfileVersion 3, so once a mirror is baked in, the only way to
 * build behind a network that cannot reach it is to hand-edit the lockfile —
 * which is exactly the trap that made a Docker build look like a network
 * failure (issue #212: 899/899 entries pointed at registry.npmmirror.com).
 *
 * The rule is not "npmjs only forever" — it is "only the official registry, and
 * no single mirror". Acceleration belongs on the machine (`npm ci --registry=…`
 * or `~/.npmrc`), never in a committed lock.
 */

const ROOT = process.cwd();
const OFFICIAL_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com']);

type LockEntry = { version?: string; resolved?: string; engines?: Record<string, string> };
type Lockfile = { lockfileVersion: number; packages: Record<string, LockEntry> };

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as Lockfile;
const entries = Object.entries(lock.packages).filter(([key]) => key !== '');

function hostOf(url: string): string {
  return new URL(url).host;
}

describe('package-lock.json stays portable (issue #212)', () => {
  it('is a lockfileVersion 3 tree with resolved URLs', () => {
    expect(lock.lockfileVersion).toBe(3);
    expect(entries.length).toBeGreaterThan(500);
  });

  it('resolves every package from the official registry and nowhere else', () => {
    const offenders = new Map<string, string[]>();
    for (const [name, entry] of entries) {
      if (!entry.resolved) continue;
      const host = hostOf(entry.resolved);
      if (OFFICIAL_HOSTS.has(host)) continue;
      offenders.set(host, [...(offenders.get(host) ?? []), name]);
    }

    // A mirror host means the build cannot reach it from everywhere, and
    // `--registry` cannot override it. Report the host, not just a count: the
    // whole diagnostic value of this test is naming what got pinned.
    expect(
      [...offenders.entries()].map(([host, names]) => `${host} (${names.length} packages)`)
    ).toEqual([]);
  });

  it('uses https for every resolved URL', () => {
    const insecure = entries
      .filter(([, entry]) => entry.resolved && !entry.resolved.startsWith('https://'))
      .map(([name, entry]) => `${name}: ${entry.resolved}`);

    expect(insecure).toEqual([]);
  });

  it('keeps the repository .npmrc pointed at the official registry', () => {
    // The lockfile is generated from whatever registry is configured, so a
    // mirror in .npmrc re-poisons it on the next `npm install`.
    const npmrc = readFileSync(join(ROOT, '.npmrc'), 'utf8');
    const registryLine = npmrc
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('registry='));

    expect(registryLine).toBe('registry=https://registry.npmjs.org/');
  });

  it('records the dependency override that removes the node>=22 cookie', () => {
    // Issue #213: @fastify/cookie 11.1.1+ depends on cookie@2, whose
    // engines.node is >=22, while the image ran node:20. The override pins the
    // last 11.1.x that still uses cookie@1. If someone drops it, the runtime
    // tree silently gains a package that declares an unsupported runtime.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      overrides?: Record<string, string>;
    };

    expect(pkg.overrides?.['@fastify/cookie']).toBe('11.1.0');
  });
});
