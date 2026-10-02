import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-153-3 / REQ-153-4 / AC-5, AC-6, AC-7
 * @intent Lock the release-it configuration to the exact shape the design
 *   requires, and pin the two runtime scripts' contracts (write-version.cjs,
 *   release.sh) that the release flow depends on.
 *
 * The single most important assertion here is that the hook key is the BARE
 * `after:bump`. Measured (§0.4): when @release-it/conventional-changelog is
 * installed, `after:version:bump` NEVER FIRES - silently. The release still
 * exits 0 with a clean tree while VERSION and AGENTS.md are left stale. A
 * fixture that omits the changelog plugin reproduces the working hook and would
 * therefore pass on a broken config, so the plugin is asserted to be present.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseItConfig = join(repoRoot, '.release-it.json');
const writeVersion = join(repoRoot, 'scripts', 'write-version.cjs');
const releaseSh = join(repoRoot, 'scripts', 'release.sh');

function readConfig(): Record<string, any> {
  return JSON.parse(readFileSync(releaseItConfig, 'utf8'));
}

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

function runWriteVersion(cwd: string, args: string[]): { status: number; output: string } {
  const result = spawnSync(process.execPath, [writeVersion, ...args], {
    cwd,
    // WRITE_VERSION_ROOT lets the script target a fixture instead of the live
    // repository (the script otherwise resolves the root from its own path).
    env: { ...process.env, WRITE_VERSION_ROOT: cwd },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('.release-it.json (AC-5 / AC-6 / AC-7, design §4.2)', () => {
  it('exists and is valid JSON parsed as JSON (not JSON5)', () => {
    expect(existsSync(releaseItConfig)).toBe(true);
    // Would throw on comments/trailing commas, which release-it rejects too.
    expect(() => readConfig()).not.toThrow();
  });

  describe('the hook key is the bare after:bump (§0.4)', () => {
    it('uses "after:bump" and never the silently-dead "after:version:bump"', () => {
      const config = readConfig();

      expect(Object.keys(config['hooks'])).toContain('after:bump');
      // Measured: with the changelog plugin installed this key never fires.
      expect(Object.keys(config['hooks'])).not.toContain('after:version:bump');
    });

    it('lists the hook commands as an array, never an && chain', () => {
      const config = readConfig();

      const hook = config['hooks']['after:bump'];
      // Measured: a shell `&&` chain silently fails as a single hook entry.
      expect(Array.isArray(hook)).toBe(true);
      expect(hook).toHaveLength(2);
      expect(`${hook[0]}`).toContain('${version}');
      expect(`${hook[1]}`).not.toContain('${version}');
    });

    it('runs write-version.cjs with the interpolated version, then sync-version.cjs', () => {
      const config = readConfig();

      const hook: string[] = config['hooks']['after:bump'];
      expect(hook[0]).toMatch(/node\s+scripts\/write-version\.cjs\s+\$\{version\}$/);
      expect(hook[1]).toMatch(/node\s+scripts\/sync-version\.cjs$/);
    });
  });

  describe('the changelog plugin is present (fixture realism, DD-009)', () => {
    it('configures @release-it/conventional-changelog with the conventionalcommits preset', () => {
      const config = readConfig();

      // Omitting this plugin flips the hook behaviour and yields FALSE PASSES.
      const plugin = config['plugins']['@release-it/conventional-changelog'];
      expect(plugin).toBeDefined();
      expect(plugin.preset).toBe('conventionalcommits');
      expect(plugin.infile).toBe('CHANGELOG.md');
    });

    it('declares both release-it packages as installed dependencies', () => {
      const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
      const declared = { ...pkg.dependencies, ...pkg.devDependencies };

      expect(declared['release-it']).toBeDefined();
      expect(declared['@release-it/conventional-changelog']).toBeDefined();
      // A config referencing a plugin that is not installed would fail only at
      // release time - i.e. exactly when it is most expensive to discover.
      expect(existsSync(join(repoRoot, 'node_modules', 'release-it'))).toBe(true);
      expect(
        existsSync(join(repoRoot, 'node_modules', '@release-it', 'conventional-changelog'))
      ).toBe(true);
    });

    it('pins a range that still supports this repository\u2019s Node floor', () => {
      const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
      const floor = /(\d+)\.(\d+)/.exec(`${pkg.engines?.node ?? ''}>=`);
      expect(floor).not.toBeNull();

      // Measured: release-it 21.x and the changelog plugin 12.x require
      // Node >=22.22, which would break this repo's >=20.19 floor and .nvmrc.
      // The declared ranges must therefore stay on the 20.x line.
      expect(pkg.devDependencies['release-it']).toMatch(/\^20\./);
      expect(pkg.devDependencies['@release-it/conventional-changelog']).toMatch(/\^11\./);
    });
  });

  describe('git / npm / github settings', () => {
    it('pins tagName to the literal v${version}', () => {
      const config = readConfig();

      // With zero existing tags release-it degrades to no "v" prefix, so this
      // must be explicit.
      expect(config['git'].tagName).toBe('v${version}');
    });

    it('sets requireBranch to the repository\u2019s actual default branch', () => {
      const config = readConfig();

      // A mismatch here would block every release.
      const defaultBranch = execFileSync(
        'git',
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        { cwd: repoRoot, encoding: 'utf8' }
      )
        .trim()
        .replace(/^origin\//, '');

      expect(config['git'].requireBranch).toBe(defaultBranch);
    });

    it('requires a clean working directory', () => {
      expect(readConfig()['git'].requireCleanWorkingDir).toBe(true);
    });

    it('never publishes to npm', () => {
      expect(readConfig()['npm'].publish).toBe(false);
    });

    it('creates a published (non-draft, non-prerelease) GitHub Release', () => {
      const { github } = readConfig();

      expect(github.release).toBe(true);
      expect(github.draft).toBe(false);
      expect(github.preRelease).toBe(false);
    });

    it('uses a conventional commit message for the release commit', () => {
      const config = readConfig();

      // Must itself be a valid conventional commit, or the release commit would
      // be rejected by this very feature's own lint rules.
      expect(config['git'].commitMessage).toMatch(/^chore\(release\): /);
    });
  });
});

describe('scripts/write-version.cjs', () => {
  const created: string[] = [];

  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'write-version-'));
    created.push(dir);
    return dir;
  }

  it('exists', () => {
    expect(existsSync(writeVersion)).toBe(true);
  });

  it('writes the given version to VERSION', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['1.2.3']);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'VERSION'), 'utf8').trim()).toBe('1.2.3');
  });

  it('refuses a missing argument with a non-zero exit and writes nothing', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, []);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'VERSION'))).toBe(false);
  });

  it('refuses a non-semver argument with a non-zero exit and writes nothing', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['not-a-version']);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'VERSION'))).toBe(false);
  });

  it('accepts a semver prerelease', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['1.2.3-rc.1']);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'VERSION'), 'utf8').trim()).toBe('1.2.3-rc.1');
  });
});

describe('scripts/release.sh', () => {
  it('exists', () => {
    expect(existsSync(releaseSh)).toBe(true);
  });

  it('defaults to a dry run', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // The script must only pass --dry-run unless --execute was requested, so an
    // accidental invocation can never create a tag or a GitHub Release.
    expect(source).toMatch(/--dry-run/);
    expect(source).toMatch(/--execute/);
  });

  it('pre-checks that VERSION matches package.json and fails otherwise', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-sh-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'pipe' });
      writeFileSync(join(dir, 'VERSION'), '9.9.9\n');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));

      const result = spawnSync(bashCommand, [releaseSh], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result.status).not.toBe(0);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect(output).toMatch(/VERSION/);
      expect(output).toMatch(/package\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('operates on the caller\u2019s repository, not the one the script lives in', () => {
    // Regression guard. An earlier revision `cd`-ed to the script's own parent,
    // so running it from a fixture silently fell through to THIS repository and
    // invoked release-it here. Releasing is irreversible, so the target must be
    // derived from the caller's directory.
    const dir = mkdtempSync(join(tmpdir(), 'release-sh-root-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'pipe' });
      writeFileSync(join(dir, 'VERSION'), '7.7.7\n');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '7.7.7' }));

      const result = spawnSync(bashCommand, [releaseSh], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      // Resolving the root from git must succeed here (the fixture IS a repo),
      // so the "not inside a git work tree" guard must not trigger.
      expect(output).not.toMatch(/not inside a git work tree/);
      // And it must never have touched this repository's VERSION.
      expect(readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim()).not.toBe('7.7.7');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never mutates the live repository\u2019s VERSION when run against a fixture', () => {
    // The concrete damage seen in practice: a fixture-based run wrote
    // 1.2.3-rc.1 into the real repository's VERSION, desynchronising it from
    // package.json. Guard the invariant directly.
    const before = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
    const dir = mkdtempSync(join(tmpdir(), 'release-sh-safe-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'pipe' });
      writeFileSync(join(dir, 'VERSION'), '3.3.3\n');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '3.3.3' }));

      spawnSync(bashCommand, [releaseSh], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
      runWriteVersion(dir, ['4.4.4']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim()).toBe(before);
  });
});
