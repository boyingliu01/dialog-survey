import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-6 / AC-11
 * @intent Lock the bootstrap script's four-branch semantics. Bootstrap exists
 *   because release-it has no tags to work from on a first release, so it cannot
 *   infer the next version; the baseline tag must be created deliberately.
 *
 *   Re-running it must be SAFE. That is the whole point of the four branches:
 *   a second run on a normal clone warns and exits 0, while a tag that has
 *   genuinely drifted from its recorded SHA fails loudly instead of being
 *   silently re-pointed (which would rewrite release history).
 *
 *   Every case runs in a throwaway repository; the live repository is untouched.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bootstrap = join(repoRoot, 'scripts', 'release-bootstrap.sh');
const BOOTSTRAP_SHA_FILE = '.git/xp-gate-bootstrap-sha';

function resolveBashCommand(): string {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    '/usr/bin/bash',
    '/bin/bash',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'bash';
}

const bashCommand = resolveBashCommand();

function git(cwd: string, ...args: string[]): string {
  return `${execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })}`;
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bootstrap-'));
  git(dir, 'init', '--quiet', '--initial-branch=master');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  // Disable inherited global git hooks for this fixture. Without this, the
  // machine-global core.hooksPath (xp-gate) runs its full pre-commit gate chain
  // on every fixture commit - slow, and it blocks fixture commits outright when
  // the fixture has no tsconfig/architecture config.
  git(dir, 'config', '--local', 'core.hooksPath', '');
  // A version baseline to tag.
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ version: '1.10.0' })}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'chore: seed');
  return dir;
}

function runBootstrap(cwd: string, args: string[] = []): { status: number; output: string } {
  const result = spawnSync(bashCommand, [bootstrap, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function readSha(dir: string): string | null {
  const full = join(dir, BOOTSTRAP_SHA_FILE);
  return existsSync(full) ? readFileSync(full, 'utf8').trim() : null;
}

describe('scripts/release-bootstrap.sh (AC-11)', () => {
  const created: string[] = [];

  function repo(): string {
    const dir = makeRepo();
    created.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @test REQ-153-6
   * @intent exists
   * @covers AC-153-6-01
   */
  it('exists', () => {
    expect(existsSync(bootstrap)).toBe(true);
  });

  describe('branch 1: no tag yet', () => {
    /**
     * @test REQ-153-6
     * @intent creates the tag at HEAD, records its SHA, and prints the tag name
     * @covers AC-153-6-01
     */
    it('creates the tag at HEAD, records its SHA, and prints the tag name', () => {
      const dir = repo();

      const result = runBootstrap(dir);

      expect(result.status).toBe(0);
      // Tag name comes from VERSION/package.json (1.10.0 here).
      expect(result.output).toContain('v1.10.0');
      const tags = git(dir, 'tag', '-l').trim().split('\n').filter(Boolean);
      expect(tags).toContain('v1.10.0');
      // The recorded SHA must be exactly what the tag points at.
      const tagSha = git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim();
      expect(readSha(dir)).toBe(tagSha);
    });

    /**
     * @test REQ-153-6
     * @intent creates an annotated tag, not a lightweight one
     * @covers AC-153-6-01
     */
    it('creates an annotated tag, not a lightweight one', () => {
      const dir = repo();

      runBootstrap(dir);

      // Annotated tags have their own object; lightweight ones do not.
      expect(git(dir, 'cat-file', '-t', 'v1.10.0').trim()).toBe('tag');
    });
  });

  describe('branch 2: SHA equals the recorded value', () => {
    /**
     * @test REQ-153-6
     * @intent warns, exits 0, and does not move the tag
     * @covers AC-153-6-01
     */
    it('warns, exits 0, and does not move the tag', () => {
      const dir = repo();
      runBootstrap(dir);
      const recorded = readSha(dir);
      const tagShaBefore = git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim();

      const second = runBootstrap(dir);

      expect(second.status).toBe(0);
      expect(readSha(dir)).toBe(recorded);
      expect(git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim()).toBe(tagShaBefore);
    });
  });

  describe('branch 3: SHA differs from the recorded value', () => {
    /**
     * @test REQ-153-6
     * @intent fails non-zero rather than silently re-pointing the tag
     * @covers AC-153-6-01
     */
    it('fails non-zero rather than silently re-pointing the tag', () => {
      const dir = repo();
      runBootstrap(dir);
      const tagShaBefore = git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim();
      // Simulate drift: the record disagrees with the tag.
      const other = git(dir, 'rev-parse', 'HEAD').trim();
      const fake = `${other.slice(0, -6)}000000`;
      writeFileSync(join(dir, BOOTSTRAP_SHA_FILE), `${fake}\n`);

      const result = runBootstrap(dir);

      expect(result.status).not.toBe(0);
      // The tag must NOT have been re-pointed.
      expect(git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim()).toBe(tagShaBefore);
    });
  });

  describe('branch 4: tag exists but the record is missing', () => {
    /**
     * @test REQ-153-6
     * @intent warns and exits 0 when the tag is an ancestor of HEAD (fresh clone)
     * @covers AC-153-6-01
     */
    it('warns and exits 0 when the tag is an ancestor of HEAD (fresh clone)', () => {
      const dir = repo();
      runBootstrap(dir);
      // A fresh clone has the tag but not the gitignored record file.
      rmSync(join(dir, BOOTSTRAP_SHA_FILE), { force: true });

      const result = runBootstrap(dir);

      // Still an ancestor of HEAD -> this is the normal clone case, not drift.
      expect(result.status).toBe(0);
      // The record must be backfilled, so the next run takes branch 2.
      const tagSha = git(dir, 'rev-list', '-n', '1', 'v1.10.0').trim();
      expect(readSha(dir)).toBe(tagSha);
    });

    /**
     * @test REQ-153-6
     * @intent fails non-zero when the tag is not an ancestor of HEAD (real drift)
     * @covers AC-153-6-01
     */
    it('fails non-zero when the tag is not an ancestor of HEAD (real drift)', () => {
      const dir = repo();
      runBootstrap(dir);
      rmSync(join(dir, BOOTSTRAP_SHA_FILE), { force: true });
      // Move HEAD forward so the tag is an ancestor, then create a divergent
      // branch and point the tag at a commit unreachable from HEAD.
      writeFileSync(join(dir, 'other.txt'), 'x\n');
      git(dir, 'add', '-A');
      git(dir, 'commit', '--quiet', '-m', 'chore: advance');
      const head = git(dir, 'rev-parse', 'HEAD').trim();
      git(dir, 'checkout', '--quiet', '-b', 'side', `${head}~1`);
      writeFileSync(join(dir, 'side.txt'), 'y\n');
      git(dir, 'add', '-A');
      git(dir, 'commit', '--quiet', '-m', 'chore: side commit');
      const sideSha = git(dir, 'rev-parse', 'HEAD').trim();
      git(dir, 'tag', '-f', '-a', 'v1.10.0', '-m', 'moved', sideSha);
      git(dir, 'checkout', '--quiet', 'master');

      const result = runBootstrap(dir);

      expect(result.status).not.toBe(0);
    });
  });
});
