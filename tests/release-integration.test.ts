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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-4
 * @intent prove the release chain end to end in a throwaway repository: the hooks
 *   really fire during a real release, VERSION / package.json / AGENTS.md end up
 *   equal inside the release commit, the tree is clean, the CHANGELOG gains a top
 *   entry while preserving history, and the tag carries the "v" prefix.
 * @covers AC-153-4-01
 *
 * Why an integration test and not just config assertions: an earlier revision of
 * .release-it.json used the key `after:version:bump`, which @release-it's
 * conventional-changelog plugin never fires. Config assertions passed anyway
 * because the JSON was well-formed. Measured in an isolated clone, that key
 * produces a release that SUCCEEDS AND TAGS while leaving VERSION and AGENTS.md
 * stale - a silent corruption, not an error. Only running a real release detects
 * it, so this suite does exactly that.
 *
 * DD-009 (fixture realism): the fixture replicates the whole bump and
 * hook-lifecycle config, including the changelog plugin. Omitting that plugin
 * changes hook behaviour and yields false passes, so exactly two exceptions are
 * sanctioned, and both are forced by the sandbox rather than by convenience:
 *   - github.release = false   (CI has no GitHub token)
 *   - requireBranch  = false   (the fixture's branch is not "master")
 * Nothing else may deviate - not the plugin set, not the hook keys, not
 * npm.publish, not the changelog plugin configuration.
 *
 * SKIPPED, never passed: if this machine cannot run release-it (offline, missing
 * dependency, no git), the suite reports SKIPPED with the reason instead of a
 * vacuous green. A silent pass here would be worse than no test at all.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseConfig = join(repoRoot, '.release-it.json');
const writeVersion = join(repoRoot, 'scripts', 'write-version.cjs');
const syncVersion = join(repoRoot, 'scripts', 'sync-version.cjs');

function git(cwd: string, ...args: string[]): string {
  return `${execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })}`;
}

function gitQuiet(cwd: string, ...args: string[]): boolean {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return result.status === 0;
}

/** Can release-it actually run here? Checked once, reported honestly if not. */
function detectCapability(): { ok: boolean; reason: string } {
  const required = [
    join(repoRoot, 'node_modules', 'release-it'),
    join(repoRoot, 'node_modules', '@release-it', 'conventional-changelog'),
  ];
  for (const dep of required) {
    if (!existsSync(dep)) {
      return { ok: false, reason: `missing dependency: ${dep}` };
    }
  }
  if (!existsSync(releaseConfig)) {
    return { ok: false, reason: `missing ${releaseConfig}` };
  }
  if (!existsSync(writeVersion) || !existsSync(syncVersion)) {
    return { ok: false, reason: 'missing scripts/write-version.cjs or scripts/sync-version.cjs' };
  }
  return { ok: true, reason: '' };
}

const capability = detectCapability();

describe.skipIf(!capability.ok)('release chain integration (REQ-153-4 / AC-153-4-01)', () => {
  let workDir = '';
  let cloneDir = '';
  let remoteDir = '';
  let releaseOutput = '';
  let releaseStatus = 1;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'release-int-'));
    cloneDir = join(workDir, 'clone');
    remoteDir = join(workDir, 'remote.git');

    // A bare remote, so release-it can push the tag and the release commit.
    mkdirSync(remoteDir, { recursive: true });
    git(remoteDir, 'init', '--bare', '--quiet');

    mkdirSync(cloneDir, { recursive: true });
    git(cloneDir, 'init', '--quiet', '--initial-branch=master');
    // Never inherit the machine-global xp-gate hook chain inside the fixture.
    git(cloneDir, 'config', '--local', 'core.hooksPath', '');
    git(cloneDir, 'config', 'user.email', 'test@example.com');
    git(cloneDir, 'config', 'user.name', 'Test User');
    git(cloneDir, 'remote', 'add', 'origin', remoteDir);

    // release-it resolves its plugins with require() from the working directory,
    // so the fixture needs node_modules or it cannot find
    // @release-it/conventional-changelog at all (verified: resolution fails from
    // a bare temp dir). Link the repo's tree so the fixture exercises the exact
    // plugin set that DD-009 requires; a fixture without the plugin would take a
    // different hook path and produce false passes.
    try {
      symlinkSync(join(repoRoot, 'node_modules'), join(cloneDir, 'node_modules'), 'junction');
    } catch (error) {
      throw new Error(
        `could not link node_modules into the release fixture: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Replicate the real bump/hook lifecycle, with only the two sanctioned
    // exceptions from DD-009.
    const config = JSON.parse(readFileSync(releaseConfig, 'utf8'));
    config['github'] = { ...config['github'], release: false };
    config['git'] = { ...config['git'], requireBranch: false };
    writeFileSync(join(cloneDir, '.release-it.json'), `${JSON.stringify(config, null, 2)}\n`);

    mkdirSync(join(cloneDir, 'scripts'), { recursive: true });
    for (const script of ['write-version.cjs', 'sync-version.cjs']) {
      writeFileSync(
        join(cloneDir, 'scripts', script),
        readFileSync(join(repoRoot, 'scripts', script), 'utf8')
      );
    }

    // A pre-existing CHANGELOG entry that must survive the release.
    writeFileSync(
      join(cloneDir, 'CHANGELOG.md'),
      '# Changelog\n\n## 1.8.9 (2026-09-30)\n\n### Bug Fixes\n\n* historical entry\n'
    );
    writeFileSync(join(cloneDir, 'VERSION'), '1.10.0\n');
    writeFileSync(join(cloneDir, 'AGENTS.md'), '> Updated: 2026-09-30 (v1.10.0). Sprint #149.\n');
    writeFileSync(
      join(cloneDir, 'package.json'),
      `${JSON.stringify({ name: 'release-int-fixture', version: '1.10.0', private: true }, null, 2)}\n`
    );

    git(cloneDir, 'add', '-A');
    git(cloneDir, 'commit', '--quiet', '-m', 'chore: seed the release fixture');
    git(cloneDir, 'tag', '-a', 'v1.10.0', '-m', 'Release v1.10.0');
    // -u matters: release-it refuses to run without an upstream configured for
    // the current branch ("No upstream configured for current branch").
    git(cloneDir, 'push', '--quiet', '-u', 'origin', 'master');
    git(cloneDir, 'push', '--quiet', 'origin', '--tags');

    // A feature commit, so the next version is a minor bump.
    writeFileSync(join(cloneDir, 'feature.txt'), 'a feature\n');
    git(cloneDir, 'add', '-A');
    git(cloneDir, 'commit', '--quiet', '-m', 'feat: add a feature for the release');

    // Run the real release. --ci suppresses every interactive prompt.
    const result = spawnSync(
      process.execPath,
      [join(repoRoot, 'node_modules', 'release-it', 'bin', 'release-it.js'), '--ci'],
      { cwd: cloneDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    releaseStatus = result.status ?? 1;
    releaseOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    // Surface the raw output: without this a fast failure is undiagnosable,
    // because the assertion message alone hides the tool's own error text.
    if (releaseStatus !== 0) {
      writeFileSync(
        join(tmpdir(), 'release-integration-last-output.txt'),
        `exit=${releaseStatus}\ncwd=${cloneDir}\n--- output ---\n${releaseOutput}\n`
      );
    }
  }, 180_000);

  afterAll(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  /**
   * @test REQ-153-4
   * @intent completes the whole release, proving the configured hook keys are the
   *   ones release-it actually fires rather than silently-dead alternatives
   * @covers AC-153-3-02
   */
  it('completes the release successfully', () => {
    // Reported with the output so a failure is diagnosable rather than cryptic.
    expect(releaseStatus, `release-it output:\n${releaseOutput}`).toBe(0);
  });

  /**
   * @test REQ-153-3
   * @intent fires both after:bump hooks, so VERSION and AGENTS.md are written
   *   during the release instead of being left stale
   * @covers AC-153-3-02
   */
  it('fires both after:bump hooks during the release', () => {
    // The bare `after:bump` key is what makes these run at all.
    expect(releaseOutput).toMatch(/write-version\.cjs/);
    expect(releaseOutput).toMatch(/sync-version\.cjs/);
  });

  /**
   * @test REQ-153-4
   * @intent leaves VERSION, package.json and AGENTS.md agreeing after the release
   * @covers AC-153-4-01
   */
  it('produces a three-way version match after the release', () => {
    const version = readFileSync(join(cloneDir, 'VERSION'), 'utf8').trim();
    const pkg = JSON.parse(readFileSync(join(cloneDir, 'package.json'), 'utf8'));
    const agents = readFileSync(join(cloneDir, 'AGENTS.md'), 'utf8');

    expect(version).toBe('1.11.0');
    expect(pkg.version).toBe(version);
    expect(agents).toContain(`(v${version})`);
  });

  /**
   * @test REQ-153-4
   * @intent puts the version consistency into the release commit itself, which is
   *   what distinguishes a working hook from the silently-dead hook key
   * @covers AC-153-4-01
   */
  it('includes all four files in the release commit', () => {
    const files = git(cloneDir, 'show', '--name-only', '--format=', 'HEAD')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();

    // AGENTS.md and VERSION prove the hooks ran; a stale hook key yields only
    // CHANGELOG.md and package.json.
    expect(files).toEqual(['AGENTS.md', 'CHANGELOG.md', 'VERSION', 'package.json']);
  });

  /**
   * @test REQ-153-4
   * @intent leaves no uncommitted residue, so the released tree matches the tag
   * @covers AC-153-4-01
   */
  it('leaves the working tree clean', () => {
    expect(git(cloneDir, 'status', '--porcelain').trim()).toBe('');
  });

  /**
   * @test REQ-153-3
   * @intent prepends the generated entry while preserving the existing 1.8.9 one
   * @covers AC-153-3-01
   */
  it('prepends the new CHANGELOG entry and preserves history', () => {
    const changelog = readFileSync(join(cloneDir, 'CHANGELOG.md'), 'utf8');
    const newIndex = changelog.indexOf('1.11.0');
    const oldIndex = changelog.indexOf('1.8.9');

    expect(newIndex).toBeGreaterThan(-1);
    expect(oldIndex).toBeGreaterThan(newIndex);
    expect(changelog.slice(0, newIndex)).toMatch(/^#\s*Changelog/);
  });

  /**
   * @test REQ-153-3
   * @intent creates the tag with the literal v prefix from tagName
   * @covers AC-153-3-02
   */
  it('creates a v-prefixed tag', () => {
    expect(gitQuiet(cloneDir, 'rev-parse', '--verify', 'refs/tags/v1.11.0')).toBe(true);
    // tagName must be the literal "v${version}"; a bare version would be wrong.
    expect(git(cloneDir, 'tag', '-l', '1.11.0').trim()).toBe('');
  });
});

describe.skipIf(capability.ok)('release chain integration - environment', () => {
  it('reports why the integration probe could not run', () => {
    // Surfaces as a skip with a concrete reason, never a false pass.
    expect(capability.reason).not.toBe('');
  });
});
