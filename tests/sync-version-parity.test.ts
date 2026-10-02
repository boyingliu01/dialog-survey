import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-5 / AC-13, AC-14, AC-15
 * @intent Lock scripts/sync-version.cjs (the cross-platform delivery target) and the frozen
 *         scripts/sync-version.sh compatibility layer to identical observable behaviour on a
 *         shared fixture, and prove --list-targets only reports paths that actually exist.
 *
 * Environment note (design §4.5): on Windows the default `bash` on PATH resolves to WSL
 * (C:\WINDOWS\system32\bash.exe), whose PATH has no `node`, so the .sh fan-out dies with
 * `line 41: node: command not found` / exit 127. The .sh must therefore always be invoked
 * through resolveBashCommand(), which prefers Git Bash.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const shScriptPath = fileURLToPath(new URL('../scripts/sync-version.sh', import.meta.url));
const cjsScriptPath = fileURLToPath(new URL('../scripts/sync-version.cjs', import.meta.url));

function resolveBashCommand(): string {
  if (process.platform !== 'win32') {
    return 'bash';
  }
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  const gitBash = join(programFiles, 'Git', 'bin', 'bash.exe');
  return existsSync(gitBash) ? `"${gitBash}"` : 'bash';
}

const bashCommand = resolveBashCommand();

/**
 * Run the .sh, returning its stdout. `execSync` is only used for the shell command because
 * the bash path may need quoting; stderr is dropped so a failure surfaces as a thrown error.
 */
function runSh(dir: string, args: string[] = []): string {
  return `${execSync(`${bashCommand} "${shScriptPath}" ${args.join(' ')}`.trim(), {
    cwd: dir,
    env: { ...process.env, SYNC_VERSION_ROOT: dir },
    stdio: ['pipe', 'pipe', 'ignore'],
  })}`;
}

/**
 * Run the .cjs, returning its stdout. Spawned through `execFileSync` with the current
 * interpreter so the test never depends on `node` being resolvable from a shell PATH —
 * the WSL-bash failure mode this suite exists to guard against (AC-15).
 */
function runCjs(dir: string, args: string[] = []): string {
  return `${execFileSync(process.execPath, [cjsScriptPath, ...args], {
    cwd: dir,
    env: { ...process.env, SYNC_VERSION_ROOT: dir },
    stdio: ['pipe', 'pipe', 'ignore'],
  })}`;
}

interface Fixture {
  dir: string;
  writePackageJson(relativePath: string, version: string): void;
  writeAgentsHeader(version: string): void;
}

function makeFixture(version = '2.3.4'): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'sync-version-parity-'));
  writeFileSync(join(dir, 'VERSION'), `${version}\n`);
  return {
    dir,
    writePackageJson(relativePath: string, version: string): void {
      const target = join(dir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        `${JSON.stringify(
          { name: 'fixture', version, description: 'keep me', scripts: { test: 'npm test' } },
          null,
          2
        )}\n`
      );
    },
    writeAgentsHeader(version: string): void {
      writeFileSync(
        join(dir, 'AGENTS.md'),
        `> Generated: 2026-07-08. Commit: \`073e69e\` (v${version}). 50 source TS files.\n\n# Body stays untouched (v1.0.0)\n`
      );
    },
  };
}

/** Snapshot every file under `dir` (relative path -> content) for whole-tree equality. */
function snapshotTree(dir: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        snapshot[full.slice(dir.length + 1).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return snapshot;
}

describe('sync-version .sh/.cjs parity', () => {
  const created: string[] = [];

  function fixture(version?: string): Fixture {
    const made = makeFixture(version);
    created.push(made.dir);
    return made;
  }

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('AC-14: --list-targets reports only paths that exist in the target root', () => {
    const liveTargets = runSh(repoRoot, ['--list-targets'])
      .trim()
      .split('\n')
      .filter((line) => line !== '');

    // The live repository ships exactly these two of the canonical fan-out targets.
    expect(liveTargets).toEqual(['package.json', 'AGENTS.md']);
    for (const target of liveTargets) {
      expect(existsSync(join(repoRoot, target))).toBe(true);
    }
  });

  it('AC-14: --list-targets output equals the actually-existing subset on a fixture', () => {
    const f = fixture();
    f.writePackageJson('package.json', '1.0.0');
    f.writePackageJson('src/npm-package/package.json', '0.1.0');
    f.writeAgentsHeader('1.8.0');

    const targets = runSh(f.dir, ['--list-targets'])
      .trim()
      .split('\n')
      .filter((line) => line !== '');

    expect(targets).toEqual(['package.json', 'src/npm-package/package.json', 'AGENTS.md']);
    for (const target of targets) {
      expect(existsSync(join(f.dir, target))).toBe(true);
    }
  });

  it('AC-14: --list-targets never reports the five absent npm-package/plugin paths', () => {
    const output = runSh(repoRoot, ['--list-targets']);
    expect(output).not.toContain('src/npm-package/package.json');
    expect(output).not.toContain('plugins/claude-code/.claude-plugin/plugin.json');
    expect(output).not.toContain('plugins/opencode/package.json');
    expect(output).not.toContain('src/npm-package/plugins/claude-code/.claude-plugin/plugin.json');
    expect(output).not.toContain('src/npm-package/plugins/opencode/package.json');
  });

  it('AC-14: --list-targets performs no writes (query mode only)', () => {
    const f = fixture();
    f.writePackageJson('package.json', '1.0.0');
    f.writeAgentsHeader('1.8.0');
    const before = snapshotTree(f.dir);

    runSh(f.dir, ['--list-targets']);

    expect(snapshotTree(f.dir)).toEqual(before);
  });

  it('AC-13: .sh and .cjs produce byte-identical --list-targets output', () => {
    const f = fixture();
    f.writePackageJson('package.json', '1.0.0');
    f.writePackageJson('plugins/opencode/package.json', '0.0.9');
    f.writeAgentsHeader('1.8.0');

    expect(runCjs(f.dir, ['--list-targets'])).toBe(runSh(f.dir, ['--list-targets']));
  });

  it('AC-13: .sh and .cjs produce byte-identical file trees after a sync', () => {
    const configure = (f: Fixture): void => {
      f.writePackageJson('package.json', '1.0.0');
      f.writePackageJson('src/npm-package/package.json', '0.1.0');
      f.writePackageJson('plugins/claude-code/.claude-plugin/plugin.json', '0.2.0');
      f.writeAgentsHeader('1.8.0');
    };

    const shFixture = fixture();
    const cjsFixture = fixture();
    configure(shFixture);
    configure(cjsFixture);

    runSh(shFixture.dir);
    runCjs(cjsFixture.dir);

    expect(snapshotTree(cjsFixture.dir)).toEqual(snapshotTree(shFixture.dir));

    // Spot-check the semantics rather than only the equality of two possibly-wrong trees.
    const pkg = JSON.parse(readFileSync(join(shFixture.dir, 'package.json'), 'utf8')) as {
      version: string;
      description: string;
    };
    expect(pkg.version).toBe('2.3.4');
    expect(pkg.description).toBe('keep me');
    expect(readFileSync(join(shFixture.dir, 'AGENTS.md'), 'utf8')).toContain('(v2.3.4)');
    expect(readFileSync(join(shFixture.dir, 'AGENTS.md'), 'utf8')).toContain(
      '# Body stays untouched (v1.0.0)'
    );
  });

  it('AC-13: both implementations are idempotent (second run is a no-op)', () => {
    for (const run of [runSh, runCjs]) {
      const f = fixture();
      f.writePackageJson('package.json', '1.0.0');
      f.writeAgentsHeader('1.8.0');

      run(f.dir);
      const afterFirst = snapshotTree(f.dir);
      run(f.dir);

      expect(snapshotTree(f.dir)).toEqual(afterFirst);
    }
  });

  it('AC-13/AC-15: both implementations fail closed on an invalid VERSION', () => {
    for (const run of [runSh, runCjs]) {
      const f = fixture('not-a-version');
      f.writePackageJson('package.json', '1.0.0');
      const before = snapshotTree(f.dir);

      expect(() => run(f.dir)).toThrow();
      expect(snapshotTree(f.dir)).toEqual(before);
    }
  });

  it('AC-13: both implementations fail closed when the AGENTS.md header format is wrong', () => {
    for (const run of [runSh, runCjs]) {
      const f = fixture();
      f.writePackageJson('package.json', '1.0.0');
      // No `> Updated: ` header line at all — the release state would be silently stale.
      writeFileSync(join(f.dir, 'AGENTS.md'), '# Heading\n\nBody mentions (v1.2.3).\n');
      const before = snapshotTree(f.dir);

      expect(() => run(f.dir)).toThrow();
      expect(snapshotTree(f.dir)).toEqual(before);
    }
  });

  it('AC-13: both implementations skip a wholly absent AGENTS.md (optional target)', () => {
    for (const run of [runSh, runCjs]) {
      const f = fixture();
      f.writePackageJson('package.json', '1.0.0');

      expect(() => run(f.dir)).not.toThrow();
      const pkg = JSON.parse(readFileSync(join(f.dir, 'package.json'), 'utf8')) as {
        version: string;
      };
      expect(pkg.version).toBe('2.3.4');
      expect(existsSync(join(f.dir, 'AGENTS.md'))).toBe(false);
    }
  });

  it('AC-13: both implementations only rewrite the first header match, not body tokens', () => {
    for (const run of [runSh, runCjs]) {
      const f = fixture();
      f.writePackageJson('package.json', '1.0.0');
      f.writeAgentsHeader('1.8.0');

      run(f.dir);

      const agents = readFileSync(join(f.dir, 'AGENTS.md'), 'utf8');
      expect(agents).toContain('> Generated: 2026-07-08. Commit: `073e69e` (v2.3.4).');
      expect(agents).toContain('# Body stays untouched (v1.0.0)');
    }
  });

  it('AC-13: both implementations skip a target whose name is a directory, not a file', () => {
    // `[ -f "$pkg" ]` in the .sh means "regular file only". A bare existence check in the
    // .cjs would instead throw EISDIR on a directory named package.json and diverge.
    for (const run of [runSh, runCjs]) {
      const f = fixture();
      mkdirSync(join(f.dir, 'package.json'), { recursive: true });
      mkdirSync(join(f.dir, 'AGENTS.md'), { recursive: true });

      expect(() => run(f.dir)).not.toThrow();
      // Both directory targets are left untouched.
      expect(existsSync(join(f.dir, 'package.json'))).toBe(true);
      expect(readdirSync(join(f.dir, 'package.json'))).toEqual([]);
      expect(readdirSync(join(f.dir, 'AGENTS.md'))).toEqual([]);
    }
  });

  it('AC-13: neither implementation rewrites anything outside the root', () => {
    // SYNC_VERSION_ROOT must be honoured: a sync against a fixture may never touch the
    // live repository's own version-bearing files.
    const liveVersion = readFileSync(join(repoRoot, 'VERSION'), 'utf8');
    const liveAgents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');

    for (const run of [runSh, runCjs]) {
      const f = fixture();
      f.writePackageJson('package.json', '1.0.0');
      f.writeAgentsHeader('1.8.0');

      run(f.dir);

      expect(readFileSync(join(f.dir, 'package.json'), 'utf8')).toContain('"version": "2.3.4"');
    }

    expect(readFileSync(join(repoRoot, 'VERSION'), 'utf8')).toBe(liveVersion);
    expect(readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8')).toBe(liveAgents);
  });

  it('AC-15: node runs the .cjs without any bash on PATH', () => {
    const f = fixture();
    f.writePackageJson('package.json', '1.0.0');
    f.writeAgentsHeader('1.8.0');

    // A PATH with no bash/sh at all: the .cjs must still fan out (WSL exit 127 regression).
    const bashlessPath = process.platform === 'win32' ? 'C:\\Windows' : '/nonexistent';
    const output = `${execFileSync(process.execPath, [cjsScriptPath], {
      cwd: f.dir,
      env: { ...process.env, PATH: bashlessPath, SYNC_VERSION_ROOT: f.dir },
      stdio: ['pipe', 'pipe', 'ignore'],
    })}`;

    expect(output).toContain('2.3.4');
    const pkg = JSON.parse(readFileSync(join(f.dir, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(pkg.version).toBe('2.3.4');
    expect(readFileSync(join(f.dir, 'AGENTS.md'), 'utf8')).toContain('(v2.3.4)');
  });
});
