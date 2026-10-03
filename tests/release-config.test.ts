import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

/** A release-it config block with the nested sections the assertions read. */
interface ReleaseItConfig {
  hooks: Record<string, string[]>;
  plugins: Record<string, Record<string, string>>;
  git: Record<string, unknown>;
  npm: Record<string, unknown>;
  github: Record<string, unknown>;
  [key: string]: unknown;
}

function readConfig(): ReleaseItConfig {
  return JSON.parse(readFileSync(releaseItConfig, 'utf8')) as ReleaseItConfig;
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
  /**
   * @test REQ-153-3
   * @intent exists and is valid JSON parsed as JSON (not JSON5)
   * @covers AC-153-3-01
   */
  it('exists and is valid JSON parsed as JSON (not JSON5)', () => {
    expect(existsSync(releaseItConfig)).toBe(true);
    // Would throw on comments/trailing commas, which release-it rejects too.
    expect(() => readConfig()).not.toThrow();
  });

  describe('the hook key is the bare after:bump (§0.4)', () => {
    /**
     * @test REQ-153-3
     * @intent uses "after:bump" and never the silently-dead "after:version:bump"
     * @covers AC-153-3-02
     */
    it('uses "after:bump" and never the silently-dead "after:version:bump"', () => {
      const config = readConfig();

      expect(Object.keys(config['hooks'])).toContain('after:bump');
      // Measured: with the changelog plugin installed this key never fires.
      expect(Object.keys(config['hooks'])).not.toContain('after:version:bump');
    });

    /**
     * @test REQ-153-3
     * @intent lists the hook commands as an array, never an && chain
     * @covers AC-153-3-03
     */
    it('lists the hook commands as an array, never an && chain', () => {
      const config = readConfig();

      const hook = config['hooks']['after:bump'];
      // Measured: a shell `&&` chain silently fails as a single hook entry.
      expect(Array.isArray(hook)).toBe(true);
      expect(hook).toHaveLength(2);
      expect(`${hook[0]}`).toContain('${version}');
      expect(`${hook[1]}`).not.toContain('${version}');
    });

    /**
     * @test REQ-153-3
     * @intent runs write-version.cjs with the interpolated version, then sync-version.cjs
     * @covers AC-153-3-01
     */
    it('runs write-version.cjs with the interpolated version, then sync-version.cjs', () => {
      const config = readConfig();

      const hook: string[] = config['hooks']['after:bump'];
      expect(hook[0]).toMatch(/node\s+scripts\/write-version\.cjs\s+\$\{version\}$/);
      expect(hook[1]).toMatch(/node\s+scripts\/sync-version\.cjs$/);
    });
  });

  describe('the changelog plugin is present (fixture realism, DD-009)', () => {
    /**
     * @test REQ-153-4
     * @intent configures @release-it/conventional-changelog with the conventionalcommits preset
     * @covers AC-153-3-02
     */
    it('configures @release-it/conventional-changelog with the conventionalcommits preset', () => {
      const config = readConfig();

      // Omitting this plugin flips the hook behaviour and yields FALSE PASSES.
      const plugin = config['plugins']['@release-it/conventional-changelog'];
      expect(plugin).toBeDefined();
      expect(plugin['preset']).toBe('conventionalcommits');
      expect(plugin['infile']).toBe('CHANGELOG.md');
    });

    /**
     * @test REQ-153-3
     * @intent declares both release-it packages as installed dependencies
     * @covers AC-153-3-03
     */
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

    /**
     * @test REQ-153-3
     * @intent pins a range that still supports this repository\u2019s Node floor
     * @covers AC-153-3-01
     */
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
    /**
     * @test REQ-153-3
     * @intent pins tagName to the literal v${version}
     * @covers AC-153-3-02
     */
    it('pins tagName to the literal v${version}', () => {
      const config = readConfig();

      // With zero existing tags release-it degrades to no "v" prefix, so this
      // must be explicit.
      expect(config['git']['tagName']).toBe('v${version}');
    });

    /**
     * @test REQ-153-3
     * @intent sets requireBranch to the repository\u2019s actual default branch
     * @covers AC-153-3-03
     */
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

      expect(config['git']['requireBranch']).toBe(defaultBranch);
    });

    /**
     * @test REQ-153-3
     * @intent requires a clean working directory
     * @covers AC-153-3-01
     */
    it('requires a clean working directory', () => {
      expect(readConfig()['git']['requireCleanWorkingDir']).toBe(true);
    });

    /**
     * @test REQ-153-3
     * @intent never publishes to npm
     * @covers AC-153-3-02
     */
    it('never publishes to npm', () => {
      expect(readConfig()['npm']['publish']).toBe(false);
    });

    /**
     * @test REQ-153-3
     * @intent creates a published (non-draft, non-prerelease) GitHub Release
     * @covers AC-153-3-03
     */
    it('creates a published (non-draft, non-prerelease) GitHub Release', () => {
      const { github } = readConfig();

      expect(github['release']).toBe(true);
      expect(github['draft']).toBe(false);
      expect(github['preRelease']).toBe(false);
    });

    /**
     * @test REQ-153-3
     * @intent uses a conventional commit message for the release commit
     * @covers AC-153-3-01
     */
    it('uses a conventional commit message for the release commit', () => {
      const config = readConfig();

      // Must itself be a valid conventional commit, or the release commit would
      // be rejected by this very feature's own lint rules.
      expect(config['git']['commitMessage']).toMatch(/^chore\(release\): /);
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

  /**
   * @test REQ-153-3
   * @intent exists
   * @covers AC-153-3-02
   */
  it('exists', () => {
    expect(existsSync(writeVersion)).toBe(true);
  });

  /**
   * @test REQ-153-3
   * @intent writes the given version to VERSION
   * @covers AC-153-3-03
   */
  it('writes the given version to VERSION', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['1.2.3']);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'VERSION'), 'utf8').trim()).toBe('1.2.3');
  });

  /**
   * @test REQ-153-4
   * @intent refuses a missing argument with a non-zero exit and writes nothing
   * @covers AC-153-3-01
   */
  it('refuses a missing argument with a non-zero exit and writes nothing', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, []);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'VERSION'))).toBe(false);
  });

  /**
   * @test REQ-153-4
   * @intent refuses a non-semver argument with a non-zero exit and writes nothing
   * @covers AC-153-3-02
   */
  it('refuses a non-semver argument with a non-zero exit and writes nothing', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['not-a-version']);

    expect(result.status).not.toBe(0);
    expect(existsSync(join(dir, 'VERSION'))).toBe(false);
  });

  /**
   * @test REQ-153-4
   * @intent accepts a semver prerelease
   * @covers AC-153-3-03
   */
  it('accepts a semver prerelease', () => {
    const dir = fixture();

    const result = runWriteVersion(dir, ['1.2.3-rc.1']);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, 'VERSION'), 'utf8').trim()).toBe('1.2.3-rc.1');
  });
});

describe('scripts/release.sh', () => {
  /**
   * @test REQ-153-4
   * @intent exists
   * @covers AC-153-3-01
   */
  it('exists', () => {
    expect(existsSync(releaseSh)).toBe(true);
  });

  /**
   * @test REQ-153-3
   * @intent defaults to a dry run
   * @covers AC-153-3-02
   */
  it('defaults to a dry run', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // The script must only pass --dry-run unless --execute was requested, so an
    // accidental invocation can never create a tag or a GitHub Release.
    expect(source).toMatch(/--dry-run/);
    expect(source).toMatch(/--execute/);
  });

  /**
   * @test REQ-153-3
   * @intent pre-checks that VERSION matches package.json and fails otherwise
   * @covers AC-153-3-03
   */
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

  /**
   * @test REQ-153-4
   * @intent operates on the caller\u2019s repository, not the one the script lives in
   * @covers AC-153-3-01
   */
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

  /**
   * @test REQ-153-3
   * @intent never mutates the live repository\u2019s VERSION when run against a fixture
   * @covers AC-153-3-02
   */
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

  /**
   * @test REQ-153-4
   * @intent fails closed with a clear message outside a git work tree, instead of
   *   silently operating on the current directory
   * @covers AC-153-4-02
   */
  it('fails closed outside a git work tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-sh-nogit-'));
    try {
      // Deliberately NOT a git repository: `git rev-parse --show-toplevel` fails,
      // and the script must refuse rather than treat cwd as the release target.
      const result = spawnSync(bashCommand, [releaseSh], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toMatch(/not inside a git work tree/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @test REQ-153-4
   * @intent refuses to run a real release without GITHUB_TOKEN when
   *   github.release is enabled, because release-it otherwise skips the GitHub
   *   Release and still exits 0
   * @covers AC-153-4-02
   */
  it('fails fast on a tokenless execute run and allows an explicit override', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured: with github.release=true and no GITHUB_TOKEN, release-it prints a
    // warning, falls back to a web URL, completes the commit and tag, and returns
    // 0. An unattended run therefore "succeeds" while silently omitting a
    // configured artifact.
    expect(source).toMatch(
      /GITHUB_TOKEN is not set but \.release-it\.json has github\.release=true/
    );
    expect(source).toMatch(/RELEASE_ALLOW_NO_GITHUB_TOKEN/);
    // The guard must apply to --execute only; a dry run changes nothing.
    expect(source).toMatch(/if \[ "\$DRY_RUN" -eq 0 \]; then/);
  });

  /**
   * @test REQ-153-4
   * @intent suppresses an inherited core.hooksPath for the release WITHOUT
   *   persisting any change to the repository's git config
   * @covers AC-153-4-02
   */
  it('suppresses an inherited core.hooksPath without persisting it', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured: a GLOBALLY configured core.hooksPath puts the xp-gate chain in the
    // path of the release commit, where Gate 6 hard-blocks a repository without an
    // architecture.yaml - aborting the release after the version hooks have already
    // rewritten VERSION and AGENTS.md.
    //
    // Two earlier forms were wrong and are both guarded against here:
    //   1. `git config --local --unset` cannot remove a GLOBAL value, so it did
    //      nothing in exactly the case measured to fail.
    //   2. Writing `core.hooksPath=""` into the local config silenced the gate chain
    //      for every LATER commit in the clone and deactivated any hook installed by
    //      install-git-hooks.sh. An EXIT trap would still leave the window open on
    //      SIGKILL.
    expect(source).toMatch(/git config --get core\.hooksPath/);
    // The override is process-scoped via git's environment mechanism...
    expect(source).toMatch(/GIT_CONFIG_COUNT=1/);
    expect(source).toMatch(/GIT_CONFIG_KEY_0=core\.hooksPath/);
    expect(source).toMatch(/export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0/);
    // ...and nothing is written to any config file.
    expect(source).not.toMatch(/git config --local core\.hooksPath/);
    expect(source).not.toMatch(/--local --unset core\.hooksPath/);
  });

  /**
   * @test REQ-153-4
   * @intent compares the effective hooksPath against the DEFAULT hooks directory,
   *   not against a query that already honours core.hooksPath
   * @covers AC-153-4-02
   */
  it('does not compare the effective hooksPath against git rev-parse --git-path hooks', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured: `git rev-parse --git-path hooks` HONOURS core.hooksPath, so it
    // returns the configured path rather than the default. Comparing the effective
    // value against it is always equal, so the suppression branch never ran and the
    // guard silently did nothing - the release still hit Gate 6. The default hooks
    // directory must be derived with core.hooksPath suppressed for that one query.
    expect(source).toMatch(/DEFAULT_HOOKS_PATH=/);
    expect(source).toMatch(
      /GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core\.hooksPath GIT_CONFIG_VALUE_0=/
    );
    expect(source).not.toMatch(/THIS_REPO_HOOKS="\$\(git rev-parse --git-path hooks/);
  });

  /**
   * @test REQ-153-4
   * @intent pins HEAD before the release so the post-check inspects the release
   *   commit rather than whatever HEAD happens to be
   * @covers AC-153-4-01
   */
  it('pins HEAD before the release and requires it to have moved', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Without this, a release whose commit step was skipped would have the file
    // check describe the PREVIOUS commit and pass or fail for reasons unrelated to
    // this release.
    expect(source).toMatch(/HEAD_BEFORE="\$\(git rev-parse HEAD\)"/);
    expect(source).toMatch(/HEAD_AFTER="\$\(git rev-parse HEAD\)"/);
    expect(source).toMatch(/no release commit was created/);
    // The inspected commit must be HEAD_AFTER, not bare HEAD.
    expect(source).toMatch(/git show --name-only --format= "\$HEAD_AFTER"/);
  });

  /**
   * @test REQ-153-4
   * @intent identifies the new tag without `comm`, which aborts the script under
   *   `set -euo pipefail` when its input is not sorted
   * @covers AC-153-4-01
   */
  it('identifies the new tag without using comm under set -e', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured: `comm` exits non-zero when either input is not in sorted order, and
    // under `set -euo pipefail` that non-zero status inside a command substitution
    // ABORTS the script - measured exit 1 with NO rollback guidance printed, leaving
    // the operator with a pushed and possibly-inconsistent release. The tag-set
    // difference is not worth that risk, so it is computed without comm.
    expect(source).not.toMatch(/\| comm /);
    expect(source).toMatch(/git tag -l --sort=-creatordate/);
    // Membership is a plain string test, which cannot fail on ordering.
    expect(source).toMatch(/grep -Fx -- "\$POST_NEW_TAG"/);
  });

  /**
   * @test REQ-153-4
   * @intent always passes --ci so an unattended release cannot stall on an
   *   interactive prompt after the version hooks have already rewritten files
   * @covers AC-153-4-02
   */
  it('always passes --ci so a scripted release cannot stall on a prompt', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured: without --ci release-it waits at "Commit (chore(release): vX.Y.Z)?"
    // and then aborts with "User force closed the prompt" AFTER the after:bump
    // hooks have rewritten VERSION and AGENTS.md, leaving the tree modified and the
    // release half-applied.
    expect(source).toMatch(/ARGS\+=\(--ci\)/);
  });

  /**
   * @test REQ-153-4
   * @intent compares the AGENTS.md header against the v-prefixed version, so a
   *   correct release is not reported as a failure
   * @covers AC-153-4-01
   */
  it('compares the AGENTS.md header against the v-prefixed version', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // Measured false failure: the header form is "(v1.11.0)" and keeps its 'v', so
    // comparing it against the bare "1.11.0" failed EVERY correct release with
    // "AGENTS.md (v1.11.0) != VERSION (1.11.0)". A post-check that always fails is
    // worse than none: it trains the operator to ignore it.
    expect(source).toMatch(/POST_AGENTS" != "v\$POST_VERSION"/);
    expect(source).not.toMatch(/POST_AGENTS" != "\$POST_VERSION"/);
    // A missing header must fail closed rather than skip.
    expect(source).toMatch(/carries no \(vX\.Y\.Z\) header version/);
  });

  /**
   * @test REQ-153-4
   * @intent names the exact files the post-release check requires, so the
   *   assertion is implementable from the script rather than from prose
   * @covers AC-153-4-01
   */
  it('enumerates the release commit contents explicitly', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // The four files a healthy release commit must contain. AGENTS.md and VERSION
    // are the ones a silently-dead hook omits, which is why they are asserted.
    expect(source).toMatch(/for expected in VERSION AGENTS\.md package\.json CHANGELOG\.md/);
  });

  /**
   * @test REQ-153-4
   * @intent verifies the release AFTER it runs, because the pre-check cannot
   *   detect a release that misbehaves and Gate 0 does not reject a staged
   *   VERSION that contradicts package.json
   * @covers AC-153-4-01
   */
  it('verifies the release AFTER it runs, not only before', () => {
    const source = readFileSync(releaseSh, 'utf8');

    expect(source).toMatch(/POST-RELEASE CHECK FAILED/);
    // The four post-release assertions.
    expect(source).toMatch(/VERSION \(\$POST_VERSION\) != package\.json/);
    expect(source).toMatch(/release commit is missing/);
    expect(source).toMatch(/working tree is dirty after the release/);
    expect(source).toMatch(/no new tag was created/);
    expect(source).toMatch(/missing the 'v' prefix/);
  });

  /**
   * @test REQ-153-3
   * @intent prints actionable rollback steps and exits non-zero when a
   *   post-release check fails, because the release is already published
   * @covers AC-153-3-02
   */
  it('prints rollback steps and exits non-zero when a post-release check fails', () => {
    const source = readFileSync(releaseSh, 'utf8');

    expect(source).toMatch(/Roll back before re-releasing/);
    expect(source).toMatch(/git tag -d <tag> && git push origin :refs\/tags\/<tag>/);
    expect(source).toMatch(/git revert --no-edit HEAD/);
    expect(source).toMatch(/if \[ "\$POST_FAIL" -ne 0 \]; then[\s\S]*?exit 1/);
  });

  /**
   * @test REQ-153-3
   * @intent documents the release rollback procedure so a failed post-release
   *   check is recoverable without improvisation
   * @covers AC-153-3-02
   */
  it('documents the release rollback procedure in docs/contributing.md', () => {
    const doc = readFileSync(join(repoRoot, 'docs', 'contributing.md'), 'utf8');

    expect(doc).toMatch(/[Rr]ollback/);
    expect(doc).toMatch(/git tag -d/);
    expect(doc).toMatch(/git push origin :refs\/tags\//);
  });

  /**
   * @test REQ-153-3
   * @intent writes VERSION atomically so a crash cannot leave it truncated or
   *   empty, which would be misread as a version mismatch
   * @covers AC-153-3-01
   */
  it('writes VERSION atomically via a temp file and rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wv-atomic-'));
    try {
      writeFileSync(join(dir, 'VERSION'), '1.10.0\n');
      execFileSync(process.execPath, [writeVersion, '1.12.0'], {
        env: { ...process.env, WRITE_VERSION_ROOT: dir },
        encoding: 'utf8',
      });

      // Exact bytes: the version and a trailing newline, nothing partial.
      expect(readFileSync(join(dir, 'VERSION'), 'utf8')).toBe('1.12.0\n');
      // No scratch file may survive for a later glob or commit to pick up.
      expect(readdirSync(dir).filter((f) => f.startsWith('.VERSION.tmp'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @test REQ-153-3
   * @intent leaves the existing VERSION untouched when the requested version is
   *   not semver, so a rejected release cannot half-apply a version change
   * @covers AC-153-3-01
   */
  it('leaves VERSION untouched when the requested version is not semver', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wv-reject-'));
    try {
      writeFileSync(join(dir, 'VERSION'), '1.10.0\n');

      expect(() =>
        execFileSync(process.execPath, [writeVersion, 'not-semver'], {
          env: { ...process.env, WRITE_VERSION_ROOT: dir },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      ).toThrow();

      expect(readFileSync(join(dir, 'VERSION'), 'utf8')).toBe('1.10.0\n');
      expect(readdirSync(dir).filter((f) => f.startsWith('.VERSION.tmp'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * @test REQ-153-3
   * @intent does not pretend to handle a release-it failure with unreachable
   *   code, since `set -e` already aborts the script on a non-zero status
   * @covers AC-153-3-02
   */
  it('does not rely on a dead RELEASE_EXIT branch under set -e', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // `RELEASE_EXIT=$?` after a command is unreachable when `set -e` is active:
    // release-it's non-zero status exits the shell first. It read like error
    // handling while doing nothing, which is worse than its absence.
    //
    // Match only UNCOMMENTED lines: the explanatory comment above the release-it
    // invocation deliberately names the removed pattern, and a naive substring
    // assertion matches that comment and fails against correct code.
    const liveCode = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    expect(liveCode).not.toMatch(/RELEASE_EXIT/);
    expect(source).toMatch(/set -euo pipefail/);
  });

  /**
   * @test REQ-153-3
   * @intent carries no unused local-hooksPath variable, which was a leftover
   *   from the discarded trap-based override
   * @covers AC-153-4-02
   */
  it('carries no unused LOCAL_HOOKS_PATH assignment', () => {
    const source = readFileSync(releaseSh, 'utf8');

    // The process-scoped override writes nothing, so there is no previous local
    // value to capture. A variable that is assigned and never read suggests state
    // is being restored when it is not.
    //
    // Uncommented lines only, for the same reason as the RELEASE_EXIT test: the
    // comment explaining the removal names the variable.
    const liveCode = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    expect(liveCode).not.toMatch(/LOCAL_HOOKS_PATH/);
  });
});
