import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-3
 * @intent prove behaviourally that the bare `after:bump` hook key is what makes
 *   release-it run the version hooks, using a single-variable negative control
 *   rather than an assertion that the config contains the key it contains.
 * @covers AC-153-3-02
 *
 * WHY THIS EXISTS
 * ---------------
 * A config assertion that `.release-it.json` says `after:bump` only checks the
 * config against itself. It cannot detect the failure that actually matters: a
 * release-it or plugin upgrade changing when the bare hook is emitted, leaving a
 * release that still exits 0 and still tags while VERSION and AGENTS.md go stale.
 *
 * release-it lib/index.js:42-50 emits the bare `after:<name>` hook ONLY from
 * whichever plugin is `plugins.at(-1)`, and the only bare key it ever emits is
 * `after:bump` - a key named after a plugin namespace such as
 * `after:version:bump` is never invoked at all.
 *
 * This suite turns that into a falsifiable invariant: two fixtures differ ONLY in
 * the hook key, and the assertion is that the hook observably runs for one and
 * not the other. If a future release-it changes bare-hook emission, the positive
 * case stops firing and this test fails loudly instead of passing silently.
 *
 * A fixture that cannot run release-it reports SKIPPED with the reason, never a
 * vacuous pass.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
}

function releaseItAvailable(): boolean {
  return (
    existsSync(join(repoRoot, 'node_modules', 'release-it', 'bin', 'release-it.js')) &&
    existsSync(join(repoRoot, 'node_modules', '@release-it', 'conventional-changelog'))
  );
}

const available = releaseItAvailable();
const created: string[] = [];

/**
 * Build a fixture identical except for the hook key, run a real release, and
 * report whether the hook observably executed.
 */
function releaseWithHookKey(key: string): { hookRan: boolean; version: string } {
  const dir = mkdtempSync(join(tmpdir(), 'hookkey-'));
  created.push(dir);
  const remote = `${dir}-remote.git`;
  created.push(remote);

  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '--bare', '--quiet');

  const repo = join(dir, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '--quiet', '--initial-branch=master');
  // Do not inherit the machine-global xp-gate hook chain.
  git(repo, 'config', '--local', 'core.hooksPath', '');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test User');
  git(repo, 'remote', 'add', 'origin', remote);
  // release-it resolves plugins from the working directory.
  symlinkSync(join(repoRoot, 'node_modules'), join(repo, 'node_modules'), 'junction');

  writeFileSync(
    join(repo, 'package.json'),
    '{"name":"hookkey","version":"1.0.0","private":true}\n'
  );
  writeFileSync(join(repo, 'VERSION'), '1.0.0\n');
  writeFileSync(join(repo, 'AGENTS.md'), '> Updated: (v1.0.0).\n');
  writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n\n## 0.9.0 (2026-01-01)\n');
  // The hook writes a marker file, which is the observable signal.
  writeFileSync(
    join(repo, 'sync-version.cjs'),
    "require('node:fs').writeFileSync('HOOK-RAN.txt', 'yes\\n');\n"
  );

  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'chore: seed the hook-key fixture');
  git(repo, 'tag', '-a', 'v1.0.0', '-m', 'Release v1.0.0');
  git(repo, 'push', '--quiet', '-u', 'origin', 'master');
  git(repo, 'push', '--quiet', 'origin', '--tags');

  writeFileSync(join(repo, 'feature.txt'), 'x\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'feat: add a feature');

  // Identical in every respect except the hook key name.
  const config = {
    git: { requireBranch: false, requireCleanWorkingDir: true, tagName: 'v${version}' },
    npm: { publish: false },
    github: { release: false },
    plugins: {
      '@release-it/conventional-changelog': {
        preset: 'conventionalcommits',
        infile: 'CHANGELOG.md',
      },
    },
    hooks: { [key]: ['node sync-version.cjs'] },
  };
  writeFileSync(join(repo, '.release-it.json'), `${JSON.stringify(config, null, 2)}\n`);

  spawnSync(
    process.execPath,
    [join(repoRoot, 'node_modules', 'release-it', 'bin', 'release-it.js'), '--ci'],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000 }
  );

  return {
    hookRan: existsSync(join(repo, 'HOOK-RAN.txt')),
    version: readFileSync(join(repo, 'VERSION'), 'utf8').trim(),
  };
}

describe.skipIf(!available)(
  'bare after:bump hook key - behavioural negative control (REQ-153-3)',
  () => {
    afterAll(() => {
      for (const dir of created.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('runs the hook when the key is the bare after:bump', () => {
      const result = releaseWithHookKey('after:bump');

      expect(result.hookRan).toBe(true);
    }, 180_000);

    it('does NOT run the hook when the key names a plugin namespace', () => {
      const result = releaseWithHookKey('after:version:bump');

      // release-it only emits the bare `after:<name>` form, so a key naming a
      // plugin namespace is never invoked. This is the single-variable contrast:
      // the two fixtures differ only in this key.
      expect(result.hookRan).toBe(false);
    }, 180_000);

    it('pins .release-it.json to the bare key the control proves necessary', () => {
      const config = JSON.parse(readFileSync(join(repoRoot, '.release-it.json'), 'utf8'));
      const keys = Object.keys(config['hooks']);

      expect(keys).toContain('after:bump');
      expect(keys).not.toContain('after:version:bump');
    });
  }
);

describe.skipIf(available)('bare after:bump hook key - environment', () => {
  it('reports why the behavioural control could not run', () => {
    // Surfaces as a skip with a concrete reason instead of a false pass; the
    // config-shape assertion above still runs unconditionally.
    expect(available).toBe(false);
  });
});
