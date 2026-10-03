import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * @test REQ-153-4
 * @intent EXECUTE scripts/release.sh and observe its real behaviour, because the
 *   other release suites assert that its source CONTAINS certain strings - which is
 *   a config assertion that checks the code against itself and cannot detect a
 *   guard whose intended branch is unreachable at runtime.
 * @covers AC-153-4-01
 *
 * Why this suite exists. Review of this issue made the point directly: "the tests
 * assert that the source contains certain strings - exactly the config assertion
 * pattern the walkthrough criticizes elsewhere. The fixes may be correct, but
 * 'regression-tested' is not verifiable from the artifact."
 *
 * That criticism was correct, and it was not academic. `scripts/release.sh`
 * contained a `grep` whose no-match exit status aborted the shell under
 * `set -euo pipefail`, making the very branch written to report a missing version
 * header UNREACHABLE. Source assertions passed the whole time, because the source
 * genuinely did contain both the grep and the branch. Only running the script
 * showed that one could never reach the other.
 *
 * These cases therefore spawn the script and assert on exit status and output.
 *
 * Fixture notes: release.sh is invoked with NO arguments, which is a DRY RUN and
 * creates no tag and no release. The `--execute` path is covered by
 * release.integration.test.ts; this suite is deliberately limited to the pre-flight
 * and post-check logic that runs without publishing anything.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const releaseSh = join(repoRoot, 'scripts', 'release.sh');
const releaseConfig = join(repoRoot, '.release-it.json');

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

/** release.sh needs git plus the release-it dependency tree. Skip loudly if absent. */
const capable =
  existsSync(releaseSh) &&
  existsSync(releaseConfig) &&
  existsSync(join(repoRoot, 'node_modules', 'release-it'));

const created: string[] = [];

afterAll(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Fixture {
  dir: string;
  /** Run release.sh with the given args (default: dry run) and capture the result. */
  run: (...args: string[]) => { status: number; output: string };
}

/**
 * A throwaway repository carrying the real release configuration and scripts, so
 * release.sh runs against the same inputs it would see in the project.
 */
function makeFixture(options: { version?: string; agentsHeader?: string | null } = {}): Fixture {
  const workDir = mkdtempSync(join(tmpdir(), 'release-sh-'));
  created.push(workDir);
  const clone = join(workDir, 'clone');
  const remote = join(workDir, 'remote.git');

  mkdirSync(remote, { recursive: true });
  execFileSync('git', ['init', '--bare', '--quiet'], { cwd: remote });

  mkdirSync(clone, { recursive: true });
  execFileSync('git', ['init', '--quiet', '--initial-branch=master'], { cwd: clone });
  // Never inherit the machine-global hook chain inside the fixture: it would put the
  // xp-gate gates in the path of every commit here.
  execFileSync('git', ['config', '--local', 'core.hooksPath', ''], { cwd: clone });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: clone });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: clone });
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: clone });

  const version = options.version ?? '1.10.0';
  writeFileSync(join(clone, 'VERSION'), `${version}\n`);
  writeFileSync(join(clone, '.release-it.json'), readFileSync(releaseConfig, 'utf8'));
  writeFileSync(
    join(clone, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version, private: true }, null, 2)}\n`
  );

  const header =
    options.agentsHeader === null
      ? '# Fixture\n\n> No version token in this header.\n'
      : `# Fixture\n\n> Updated: 2026-10-03 (v${options.agentsHeader ?? version}). Sprint note.\n`;
  writeFileSync(join(clone, 'AGENTS.md'), header);

  execFileSync('git', ['add', '-A'], { cwd: clone });
  execFileSync('git', ['commit', '--quiet', '--no-verify', '-m', 'chore: seed'], { cwd: clone });
  execFileSync('git', ['tag', '-a', `v${version}`, '-m', `Release ${version}`], { cwd: clone });
  execFileSync('git', ['push', '--quiet', '-u', 'origin', 'master'], { cwd: clone });
  execFileSync('git', ['push', '--quiet', 'origin', '--tags'], { cwd: clone });

  writeFileSync(join(clone, 'feature.txt'), 'a change\n');
  execFileSync('git', ['add', '-A'], { cwd: clone });
  execFileSync('git', ['commit', '--quiet', '--no-verify', '-m', 'feat: a feature'], {
    cwd: clone,
  });

  return {
    dir: clone,
    run: (...args: string[]) => {
      const result = spawnSync(bashCommand, [releaseSh, ...args], {
        cwd: clone,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 180_000,
        env: { ...process.env, GITHUB_TOKEN: '', RELEASE_ALLOW_NO_GITHUB_TOKEN: '1' },
      });
      if (result.error) {
        throw new Error(`could not start release.sh: ${result.error.message}`);
      }
      return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
    },
  };
}

/** Run release.sh in RELEASE_VERIFY_ONLY mode, which exercises run_post_release_check. */
function runVerify(fixture: Fixture): { status: number; output: string } {
  const result = spawnSync(bashCommand, [releaseSh], {
    cwd: fixture.dir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    env: { ...process.env, RELEASE_VERIFY_ONLY: '1' },
  });
  if (result.error) {
    throw new Error(`could not start release.sh verify-only: ${result.error.message}`);
  }
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

describe.skipIf(!capable)('release.sh behaviour (REQ-153-4 / AC-153-4-01)', () => {
  /**
   * @test REQ-153-4
   * @intent refuses to release from a tree whose VERSION and package.json
   *   disagree, rather than publishing a mislabelled release
   * @covers AC-153-4-02
   */
  it('refuses to start when VERSION and package.json disagree', () => {
    const fixture = makeFixture({ version: '1.10.0' });
    // Make package.json disagree with VERSION.
    writeFileSync(
      join(fixture.dir, 'package.json'),
      `${JSON.stringify({ name: 'fixture', version: '9.9.9', private: true }, null, 2)}\n`
    );

    const { status, output } = fixture.run();

    expect(status).not.toBe(0);
    expect(output).toMatch(/VERSION \(1\.10\.0\) != package\.json \(9\.9\.9\)/);
    expect(output).toMatch(/refusing to release from an inconsistent tree/);
  });

  /**
   * @test REQ-153-4
   * @intent reports a missing VERSION with an actionable message instead of
   *   failing with an unexplained status
   * @covers AC-153-4-02
   */
  it('reports a missing VERSION file actionably', () => {
    const fixture = makeFixture();
    rmSync(join(fixture.dir, 'VERSION'));

    const { status, output } = fixture.run();

    expect(status).not.toBe(0);
    expect(output).toMatch(/no VERSION file/);
  });

  /**
   * @test REQ-153-4
   * @intent refuses to release without a GitHub token when github.release is
   *   enabled, because release-it would otherwise skip the Release and still exit 0
   * @covers AC-153-4-02
   */
  it('refuses to execute without a token unless the override is set', () => {
    const fixture = makeFixture();

    // Override the fixture's default override, so the guard is actually exercised.
    const result = spawnSync(bashCommand, [releaseSh, '--execute'], {
      cwd: fixture.dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180_000,
      env: { ...process.env, GITHUB_TOKEN: '', RELEASE_ALLOW_NO_GITHUB_TOKEN: '' },
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toMatch(/GITHUB_TOKEN is not set/);
    expect(output).toMatch(/RELEASE_ALLOW_NO_GITHUB_TOKEN=1/);
    // The guard must stop the run BEFORE release-it is invoked.
    expect(output).not.toMatch(/Done \(in /);
  });

  /**
   * @test REQ-153-4
   * @intent reports a missing AGENTS.md version header instead of dying silently,
   *   which is the failure the `|| true` on the header grep exists to prevent
   * @covers AC-153-4-01
   *
   * This case is the regression guard for a real defect. Without `|| true`, the
   * header grep's no-match status (1) propagates through the pipeline and aborts
   * the shell under `set -euo pipefail`, so the branch that reports the missing
   * header is UNREACHABLE and the script exits with no explanation. That runs after
   * the commit and tag exist, so the rollback guidance is skipped on exactly the
   * path it was written for. Source assertions could not detect this; only running
   * the script can.
   */
  it('reports a missing AGENTS.md version header rather than dying silently', () => {
    const fixture = makeFixture({ agentsHeader: null });

    // Drive the post-check through the script's own RELEASE_VERIFY_ONLY entry point,
    // which EXECUTES the exact run_post_release_check function rather than a re-typed
    // copy of its expression. The HEAD-unchanged check also fires (no release ran),
    // but the header-missing message is the one this case guards.
    const { status, output } = runVerify(fixture);

    expect(status).not.toBe(0);
    expect(output).toMatch(/AGENTS\.md carries no \(vX\.Y\.Z\) header version/);
  });

  /**
   * @test REQ-153-4
   * @intent still detects a PRESENT header, so the guard above cannot pass by
   *   always reporting the header missing
   * @covers AC-153-4-01
   */
  it('still finds a present AGENTS.md version header', () => {
    const fixture = makeFixture({ version: '1.10.0', agentsHeader: '1.10.0' });

    const { status, output } = runVerify(fixture);

    // A present header matching VERSION must NOT be reported as missing. The
    // post-check still fails on HEAD-unchanged (no release happened), but the
    // header-missing message must be absent.
    expect(status).not.toBe(0);
    expect(output).not.toMatch(/AGENTS\.md carries no \(vX\.Y\.Z\) header version/);
  });

  /**
   * @test REQ-153-4
   * @intent leaves the repository's core.hooksPath untouched after running, since
   *   the suppression is process-scoped
   * @covers AC-153-4-02
   */
  it('leaves core.hooksPath untouched after running', () => {
    const fixture = makeFixture();
    // Give the local scope an explicit value, so a destructive override would show.
    execFileSync('git', ['config', '--local', 'core.hooksPath', '/nonexistent/hooks'], {
      cwd: fixture.dir,
    });

    const readHooksPath = (): string =>
      `${execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
        cwd: fixture.dir,
        encoding: 'utf8',
      })}`.trim();

    const before = readHooksPath();
    fixture.run();
    const after = readHooksPath();

    expect(after).toBe(before);
    expect(after).toBe('/nonexistent/hooks');
  });
});
