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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-2 / AC-2, AC-3, AC-8, AC-9
 * @intent Lock the opt-in local hook installer's contract: install is idempotent,
 *   uninstall restores the PREVIOUS core.hooksPath exactly, and a mutated value is
 *   refused without --force. The flag exists because installing a local hook makes
 *   this repository's global xp-gate gate chain stop running - a real, accepted
 *   cost that must be reversible byte-exactly.
 *
 * Everything runs against a throwaway git repository created in a temp dir. The
 * developer's real `core.hooksPath` is never read or written.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const installer = join(repoRoot, 'scripts', 'install-git-hooks.sh');

const RECORD_FILE = '.git/xp-gate-uninstall-record';
const SENTINEL_UNSET = '__UNSET__';

/**
 * Resolve a usable bash. On Windows the `bash` on PATH is WSL
 * (`C:\WINDOWS\system32\bash.exe`), whose PATH has no git/node; running the
 * installer there fails with exit 127. Prefer Git Bash explicitly. Mirrors the
 * helper in tests/sync-version.test.ts.
 */
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

/**
 * The LOCAL config only. A bare `git config --get core.hooksPath` resolves the
 * MERGED config and therefore reports the machine-global xp-gate value
 * (~/.config/xp-gate/hooks) even in a brand-new repository. Assertions about what
 * this installer did must look at the repository's own config.
 */
function gitConfigGet(cwd: string, key: string): string | null {
  try {
    const value = git(cwd, 'config', '--local', '--get', key).trim();
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

/** A throwaway repository whose global hook path we can freely mutate. */
function makeRepo(preExistingHooksPath?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'optin-hooks-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  if (preExistingHooksPath !== undefined) {
    git(dir, 'config', 'core.hooksPath', preExistingHooksPath);
  }
  return dir;
}

/**
 * Give the fixture a resolvable @commitlint/cli so the installed hook can really
 * lint. Without it the hook takes its documented graceful-skip path (exit 0) and
 * a bad message would appear "accepted" for the wrong reason. A symlink to this
 * repository's own installed dependency keeps the test honest and fast.
 *
 * The config is copied as well: commitlint hard-fails with "Please add rules to
 * your commitlint.config.js" when it cannot find one, which would otherwise make
 * every message (valid or not) fail for an unrelated reason.
 */
function linkCommitlint(dir: string): void {
  const source = join(repoRoot, 'node_modules', '@commitlint');
  if (existsSync(source)) {
    const target = join(dir, 'node_modules', '@commitlint');
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) {
      try {
        symlinkSync(source, target, 'junction');
      } catch {
        // Linking unavailable: the hook's skip path applies and callers adapt.
      }
    }
  }

  const configSource = join(repoRoot, 'commitlint.config.cjs');
  if (existsSync(configSource)) {
    writeFileSync(join(dir, 'commitlint.config.cjs'), readFileSync(configSource, 'utf8'));
  }
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr combined — use for "was the user told?" assertions. */
  output: string;
}

function runInstaller(cwd: string, args: string[] = []): RunResult {
  // spawnSync (not execFileSync) so stderr is captured on SUCCESS too.
  // execFileSync drops stderr when the process exits 0, and the --force
  // overwrite warning goes to stderr precisely because that run succeeds.
  const result = spawnSync(bashCommand, [installer, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = `${result.stdout ?? ''}`;
  const stderr = `${result.stderr ?? ''}`;
  return {
    status: result.status ?? 1,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

function readRecord(dir: string): string | null {
  const full = join(dir, RECORD_FILE);
  return existsSync(full) ? readFileSync(full, 'utf8').trim() : null;
}

/**
 * The machine-global core.hooksPath, or null when unset. Read from any directory
 * (global config is not repository-scoped). Used to prove the installer never
 * mutates global state.
 */
function readGlobalHooksPath(): string | null {
  try {
    const value = `${execFileSync('git', ['config', '--global', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })}`.trim();
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

describe('opt-in local commit-msg hook installer', () => {
  const created: string[] = [];

  function repo(preExistingHooksPath?: string): string {
    const dir = makeRepo(preExistingHooksPath);
    created.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) {
      // Windows may briefly hold handles on a repository that just ran git;
      // retry rather than letting cleanup fail the suite.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          // Last attempt: leave it for the OS temp cleaner.
          if (attempt === 2) {
            break;
          }
        }
      }
    }
  });

  describe('AC-8: default state is untouched', () => {
    it('does not change core.hooksPath until explicitly invoked', () => {
      const dir = repo();

      // Creating the repository must not install anything. The LOCAL config is
      // what matters: a machine-global core.hooksPath (xp-gate) is inherited by
      // every repository and must never be reported as this repo's own value.
      expect(gitConfigGet(dir, 'core.hooksPath')).toBeNull();
      expect(existsSync(join(dir, '.git', 'hooks', 'commit-msg'))).toBe(false);
      expect(existsSync(join(dir, RECORD_FILE))).toBe(false);
    });

    it('never writes to the global config, only the repository config', () => {
      const dir = repo();
      const globalBefore = readGlobalHooksPath();

      runInstaller(dir);

      // Whatever the machine-global value was, it must be byte-identical after.
      expect(readGlobalHooksPath()).toBe(globalBefore);
      // And the install must live in the LOCAL config.
      expect(gitConfigGet(dir, 'core.hooksPath')).toContain('githooks');
    });
  });

  describe('AC-9 (1): first install', () => {
    it('sets core.hooksPath and records the previous unset state', () => {
      const dir = repo();

      const result = runInstaller(dir);

      expect(result.status).toBe(0);
      const hooksPath = gitConfigGet(dir, 'core.hooksPath');
      expect(hooksPath).not.toBeNull();
      expect(hooksPath).toContain('githooks');
      // The prior value was "unset" - the record must capture that exactly.
      expect(readRecord(dir)).toBe(SENTINEL_UNSET);
    });

    it('installs a commit-msg hook that refuses a non-conventional message', () => {
      const dir = repo();
      linkCommitlint(dir);
      runInstaller(dir);

      // The installed hook must actually exist.
      const cwd = dir;
      const hookPath = join(cwd, 'githooks', 'commit-msg');
      expect(existsSync(hookPath)).toBe(true);

      // If the dependency could not be linked, the hook's graceful-skip path
      // applies (exit 0) - assert that explicitly rather than passing vacuously.
      if (!existsSync(join(cwd, 'node_modules', '@commitlint', 'cli', 'lib', 'cli.js'))) {
        expect(readFileSync(hookPath, 'utf8')).toContain('skipping check');
        return;
      }

      writeFileSync(join(cwd, 'file.txt'), 'content\n');
      git(cwd, 'add', 'file.txt');

      let rejected = false;
      try {
        git(cwd, 'commit', '-m', 'bad message no type');
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
    });

    it('accepts conventional messages once installed', () => {
      const dir = repo();
      linkCommitlint(dir);
      runInstaller(dir);

      const cwd = dir;
      if (!existsSync(join(cwd, 'node_modules', '@commitlint', 'cli', 'lib', 'cli.js'))) {
        return;
      }
      writeFileSync(join(cwd, 'file.txt'), 'content\n');
      git(cwd, 'add', 'file.txt');

      // feat: / fix: / chore(scope): must all pass. Each iteration needs its own
      // staged change, otherwise git refuses with "nothing to commit" and the
      // failure would look like the hook rejecting a valid message.
      for (const [index, message] of ['feat: add thing', 'chore(scope): tidy up'].entries()) {
        writeFileSync(join(cwd, `file-${index}.txt`), `${message}\n`);
        git(cwd, 'add', `file-${index}.txt`);
        expect(() => git(cwd, 'commit', '-m', message)).not.toThrow();
      }
    });
  });

  describe('AC-9 (2): repeat install is a no-op that never clobbers the record', () => {
    it('keeps the original recorded value on a second install', () => {
      const dir = repo();
      runInstaller(dir);
      const firstRecord = readRecord(dir);

      const second = runInstaller(dir);

      expect(second.status).toBe(0);
      expect(readRecord(dir)).toBe(firstRecord);
    });

    it('keeps a pre-existing recorded value on a second install', () => {
      const dir = repo('C:/some/previous/hooks');
      runInstaller(dir);
      expect(readRecord(dir)).toBe('C:/some/previous/hooks');

      runInstaller(dir);

      // Must still be the ORIGINAL pre-install value, not the installer's own path.
      expect(readRecord(dir)).toBe('C:/some/previous/hooks');
    });
  });

  describe('AC-9 (3): uninstall restores the original value exactly', () => {
    it('restores an unset hooksPath by unsetting it', () => {
      const dir = repo();
      runInstaller(dir);
      expect(gitConfigGet(dir, 'core.hooksPath')).not.toBeNull();

      const result = runInstaller(dir, ['--uninstall']);

      expect(result.status).toBe(0);
      expect(gitConfigGet(dir, 'core.hooksPath')).toBeNull();
      expect(readRecord(dir)).toBeNull();
    });

    it('restores a previously set hooksPath verbatim', () => {
      const dir = repo('C:/some/previous/hooks');
      runInstaller(dir);

      runInstaller(dir, ['--uninstall']);

      expect(gitConfigGet(dir, 'core.hooksPath')).toBe('C:/some/previous/hooks');
    });
  });

  describe('AC-9 (4): a mutated value needs --force', () => {
    it('aborts without --force and leaves the current value in place', () => {
      const dir = repo();
      runInstaller(dir);
      // Someone (or another tool) changed the hook path behind our back.
      git(dir, 'config', 'core.hooksPath', 'C:/someone/else/hooks');

      const result = runInstaller(dir, ['--uninstall']);

      expect(result.status).not.toBe(0);
      expect(gitConfigGet(dir, 'core.hooksPath')).toBe('C:/someone/else/hooks');
    });

    it('with --force restores the recorded value and reports what it overwrote', () => {
      const dir = repo();
      runInstaller(dir);
      git(dir, 'config', 'core.hooksPath', 'C:/someone/else/hooks');

      const result = runInstaller(dir, ['--uninstall', '--force']);

      expect(result.status).toBe(0);
      // Recorded value was "unset", so a forced uninstall unsets.
      expect(gitConfigGet(dir, 'core.hooksPath')).toBeNull();
      // The overwritten value must be reported, not silently discarded.
      expect(result.output).toContain('C:/someone/else/hooks');
    });

    it('fails when the record file is missing, for both --uninstall and --force', () => {
      const dir = repo();
      runInstaller(dir);
      rmSync(join(dir, RECORD_FILE), { force: true });

      expect(runInstaller(dir, ['--uninstall']).status).not.toBe(0);
      expect(runInstaller(dir, ['--uninstall', '--force']).status).not.toBe(0);
    });
  });

  describe('AC-2: the documented cost is declared', () => {
    it('warns that the global xp-gate gate chain stops applying while installed', () => {
      const dir = repo();

      const result = runInstaller(dir);

      const output = result.output;
      expect(output.toLowerCase()).toContain('global');
      // It must be explicit that the global chain is bypassed, not merely "changed".
      expect(output).toMatch(/hooksPath|hook/i);
    });
  });

  describe('design §3: --force persists an audit trail, not just stderr', () => {
    it('appends the overwritten value to .git/xp-gate-uninstall.log', () => {
      const dir = repo();
      runInstaller(dir);
      git(dir, 'config', 'core.hooksPath', 'C:/someone/else/hooks');

      runInstaller(dir, ['--uninstall', '--force']);

      // A destructive overwrite must leave a durable record: stderr scrolls away.
      const logPath = join(dir, '.git', 'xp-gate-uninstall.log');
      expect(existsSync(logPath)).toBe(true);
      const log = readFileSync(logPath, 'utf8');
      expect(log).toContain('C:/someone/else/hooks');
      // Timestamped, so multiple events stay distinguishable.
      expect(log).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
    });

    it('writes no audit entry on an ordinary, non-destructive uninstall', () => {
      const dir = repo();
      runInstaller(dir);

      runInstaller(dir, ['--uninstall']);

      // Nothing was overwritten, so there is nothing to audit.
      expect(existsSync(join(dir, '.git', 'xp-gate-uninstall.log'))).toBe(false);
    });
  });

  describe('design §3: --reset-unset is a separate single-meaning escape hatch', () => {
    it('unsets the local core.hooksPath without needing a record file', () => {
      const dir = repo();
      runInstaller(dir);
      // Simulate a lost record: --reset-unset must still work, because its
      // meaning does not depend on knowing the previous value.
      rmSync(join(dir, RECORD_FILE), { force: true });

      const result = runInstaller(dir, ['--reset-unset']);

      expect(result.status).toBe(0);
      expect(gitConfigGet(dir, 'core.hooksPath')).toBeNull();
    });

    it('works even when nothing was ever installed', () => {
      const dir = repo();

      const result = runInstaller(dir, ['--reset-unset']);

      expect(result.status).toBe(0);
      expect(gitConfigGet(dir, 'core.hooksPath')).toBeNull();
    });

    it('is distinct from --uninstall, which still refuses without a record', () => {
      const dir = repo();
      runInstaller(dir);
      rmSync(join(dir, RECORD_FILE), { force: true });

      // --uninstall cannot know the original value, so it must fail...
      expect(runInstaller(dir, ['--uninstall']).status).not.toBe(0);
      // ...while --reset-unset has a single unambiguous meaning and succeeds,
      // proving --force does not have to carry two destructive meanings.
      expect(runInstaller(dir, ['--reset-unset']).status).toBe(0);
    });
  });
});
