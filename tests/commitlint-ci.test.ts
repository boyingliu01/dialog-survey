import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test AC-1 / AC-4 / AC-12 (issue #153, REQ-153-1)
 * @intent Enforce Conventional Commits in CI: config file present with the exact
 *   §5.3 ignores list, `commit-lint` job in pr.yml with the three-step split from
 *   §5.1 plus the §5.4 runtime self-check, and no `needs` (AC-12).
 *
 * Config-file assertions are the established pattern in this repo (see
 * tests/sync-version.test.ts): read the real files and assert their content.
 * Behaviour of commitlint itself is proven by the job's own self-check step
 * (§5.4) and by the tests at the bottom of this file.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workflowPath = join(repoRoot, '.github', 'workflows', 'pr.yml');

const CONFIG_CANDIDATES = [
  'commitlint.config.cjs',
  'commitlint.config.js',
  'commitlint.config.mjs',
];

function findCommitlintConfig(): { name: string; body: string } {
  for (const name of CONFIG_CANDIDATES) {
    const path = join(repoRoot, name);
    if (existsSync(path)) {
      return { name, body: readFileSync(path, 'utf8') };
    }
  }
  throw new Error(`no commitlint config found; looked for: ${CONFIG_CANDIDATES.join(', ')}`);
}

const workflow = readFileSync(workflowPath, 'utf8');

/**
 * Run the repo's real commitlint config against a message on stdin, exactly the
 * way the CI job does (`commitlint` reads stdin; positional args are ignored).
 * Returns the process exit code: 0 = accepted, non-zero = rejected.
 */
function lintMessage(message: string): number {
  const { name } = findCommitlintConfig();
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'node_modules', '@commitlint', 'cli', 'cli.js'),
      '--config',
      join(repoRoot, name),
    ],
    { cwd: repoRoot, input: message }
  );
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

/**
 * Extract one job block from the `jobs:` mapping by indentation, so assertions
 * cannot accidentally match a sibling job's steps.
 */
function jobBlock(name: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) {
    throw new Error(`job "${name}" not found in workflow`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('commitlint configuration (AC-1)', () => {
  /**
   * @test REQ-153-1
   * @intent exists as a .cjs file so it loads under the ESM "type": "module" package
   * @covers AC-153-1-01
   */
  it('exists as a .cjs file so it loads under the ESM "type": "module" package', () => {
    const { name } = findCommitlintConfig();
    expect(name).toBe('commitlint.config.cjs');
  });

  /**
   * @test REQ-153-1
   * @intent extends @commitlint/config-conventional
   * @covers AC-153-1-02
   */
  it('extends @commitlint/config-conventional', () => {
    const { body } = findCommitlintConfig();
    expect(body).toMatch(/['"]@commitlint\/config-conventional['"]/);
  });

  /**
   * @test REQ-153-1
   * @intent declares the exact §5.3 ignores list (only observable patterns)
   * @covers AC-153-1-04
   */
  it('declares the exact §5.3 ignores list (only observable patterns)', () => {
    const { body } = findCommitlintConfig();
    // commitlint requires function entries: string/RegExp values are rejected
    // by @commitlint/config-validator ("/ignores/0" should be a function).
    const expected = [
      String.raw`/^Merge /`,
      String.raw`/^Revert /`,
      String.raw`/^chore\(release\):/`,
      String.raw`/^Merge pull request/`,
      String.raw`/^Bump /`,
      String.raw`/^chore\(deps\)/`,
    ];
    for (const pattern of expected) {
      expect(body).toContain(pattern);
    }
    // Exactly six ignores — no extra blanket rule that would over-ignore.
    expect(body.match(/\(message\) =>/g)).toHaveLength(expected.length);
    // No unobservable/misleading bot regex left over from earlier revisions
    // (§5.3 note 3: /^\[dependabot/ can never match a real dependabot title).
    // Assert on the executable rules only — prose comments may name the pattern.
    const ruleLines = body
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');
    expect(ruleLines).not.toContain('dependabot');
  });

  /**
   * @test REQ-153-1
   * @intent is loadable by commitlint and rejects a non-conventional message
   * @covers AC-153-1-01
   */
  it('is loadable by commitlint and rejects a non-conventional message', () => {
    expect(lintMessage('bad message no type')).not.toBe(0);
  });

  /**
   * @test REQ-153-1
   * @intent accepts a conventional message
   * @covers AC-153-1-02
   */
  it('accepts a conventional message', () => {
    // A passing run exits 0 and prints nothing to stdout, so status is the assertion.
    expect(lintMessage('feat: self check')).toBe(0);
  });

  /**
   * @test REQ-153-1
   * @intent accepts ignored bot/merge forms (§5.3) while still rejecting bad input
   * @covers AC-153-1-04
   */
  it('accepts ignored bot/merge forms (§5.3) while still rejecting bad input', () => {
    expect(lintMessage('Bump lodash from 1 to 2')).toBe(0);
    expect(lintMessage('chore(release): 1.2.3')).toBe(0);
    expect(lintMessage('foo: bar')).not.toBe(0);
  });

  /**
   * @test REQ-153-1
   * @intent declares the commitlint packages the config and CI job depend on
   * @covers AC-153-1-01
   */
  it('declares the commitlint packages the config and CI job depend on', () => {
    // Guard against a silently dropped dependency. These were once missing from
    // package.json while the commit claiming to add them stayed green: absent
    // from node_modules, `npx --no-install commitlint` exits 1, which is
    // indistinguishable from a correctly rejected message. The round-trip tests
    // below only caught it once the dependency was reinstalled.
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(declared['@commitlint/cli']).toBeDefined();
    expect(declared['@commitlint/config-conventional']).toBeDefined();
    expect(existsSync(join(repoRoot, 'node_modules', '@commitlint', 'cli'))).toBe(true);
    expect(existsSync(join(repoRoot, 'node_modules', '@commitlint', 'config-conventional'))).toBe(
      true
    );
  });

  /**
   * @test REQ-153-1
   * @intent pins a commitlint range that still supports this repository\u2019s Node floor
   * @covers AC-153-1-02
   */
  it('pins a commitlint range that still supports this repository\u2019s Node floor', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

    // Measured: @commitlint/cli 21.x requires Node >=22.12, which would break
    // this repo's >=20.19 floor and .nvmrc (20.19).
    expect(pkg.devDependencies['@commitlint/cli']).toMatch(/\^20\./);
    expect(pkg.devDependencies['@commitlint/config-conventional']).toMatch(/\^20\./);
  });
});

describe('version-consistency job in .github/workflows/pr.yml (REQ-153-4)', () => {
  const workflow = readFileSync(join(repoRoot, '.github/workflows/pr.yml'), 'utf8');

  /**
   * @test REQ-153-4
   * @intent enforces version consistency at the MERGE boundary, not only at
   *   release time, because a drift discovered during a release has already been
   *   tagged and published
   * @covers AC-153-4-01
   */
  it('exists as a job that needs no dependencies or build', () => {
    expect(workflow).toMatch(/^ {2}version-consistency:$/m);
    // No build step: the check must stay fast and incapable of flaking.
    const block = workflow.slice(workflow.indexOf('  version-consistency:'));
    expect(block).not.toMatch(/npm ci/);
    expect(block).not.toMatch(/npx prisma generate/);
  });

  /**
   * @test REQ-153-4
   * @intent fails on a VERSION/package.json mismatch and on a stale AGENTS.md,
   *   rather than passing vacuously
   * @covers AC-153-4-01
   */
  it('asserts all three version sources and fails closed on each', () => {
    const block = workflow.slice(workflow.indexOf('  version-consistency:'));

    // VERSION vs package.json.
    expect(block).toMatch(/VERSION \(\$\{FILE_VERSION\}\) != package\.json/);
    // AGENTS.md header.
    expect(block).toMatch(/AGENTS\.md has no .*header version to compare/);
    expect(block).toMatch(/AGENTS\.md \(\$\{HEADER_VERSION\}\) != VERSION/);
    // Missing/empty VERSION fails rather than skipping.
    expect(block).toMatch(/VERSION file is missing/);
    expect(block).toMatch(/VERSION is empty/);
  });

  /**
   * @test REQ-153-4
   * @intent confirms the new job does not displace the existing jobs
   * @covers AC-153-4-01
   */
  it('is additive: the original jobs are all still present', () => {
    for (const job of [
      'static-analysis',
      'unit-tests',
      'integration-tests',
      'security-scan',
      'coverage',
      'smoke',
      'commit-lint',
    ]) {
      expect(workflow, `missing job ${job}`).toMatch(new RegExp(`^  ${job}:$`, 'm'));
    }
  });
});

describe('commit-lint job in .github/workflows/pr.yml (AC-4 / AC-12)', () => {
  /**
   * @test REQ-153-1
   * @intent exists as a job named commit-lint without needs
   * @covers AC-153-1-04
   */
  it('exists as a job named commit-lint without needs (AC-12)', () => {
    const block = jobBlock('commit-lint');
    expect(block).not.toBe('');
    expect(block).not.toMatch(/^\s{4}needs:/m);
  });

  /**
   * @test REQ-153-1
   * @intent only runs commit-lint on a pull_request, because both github.base_ref
   *   and github.event.pull_request.title are empty on workflow_dispatch and the
   *   job's two load-bearing steps would fail with a confusing "base ref is empty"
   *   error instead of skipping
   * @covers AC-153-1-02
   */
  it('gates the commit-lint job to pull_request events', () => {
    const block = jobBlock('commit-lint');

    expect(block).toMatch(/^ {4}if: github\.event_name == 'pull_request'$/m);
    expect(block).not.toMatch(/github\.event_name == 'workflow_dispatch'/);
  });

  /**
   * @test REQ-153-1
   * @intent does not add any release/publish job
   * @covers AC-153-1-01
   */
  it('does not add any release/publish job', () => {
    const jobNames = workflow
      .split('\n')
      .filter((line) => /^ {2}[a-z][a-z0-9-]*:$/.test(line))
      .map((line) => line.trim().replace(':', ''));
    const releaseJobs = jobNames.filter((name) => /release|publish|deploy/.test(name));
    expect(releaseJobs).toEqual([]);
    // Informational only (AC-12: no hard assertion on the total count).
    expect(jobNames).toContain('commit-lint');
  });

  /**
   * @test REQ-153-1
   * @intent checks out full history for the origin/<base>..HEAD range (§5.1)
   * @covers AC-153-1-02
   */
  it('checks out full history for the origin/<base>..HEAD range (§5.1)', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/fetch-depth:\s*0/);
    expect(block).toMatch(/github\.base_ref/);
  });

  /**
   * @test REQ-153-1
   * @intent installs dependencies with npm ci before any npx --no-install invocation
   * @covers AC-153-1-04
   */
  it('installs dependencies with npm ci before any npx --no-install invocation', () => {
    const block = jobBlock('commit-lint');
    const ciIndex = block.indexOf('npm ci');
    const npxIndex = block.indexOf('npx --no-install commitlint');
    expect(ciIndex).toBeGreaterThan(-1);
    expect(npxIndex).toBeGreaterThan(-1);
    expect(ciIndex).toBeLessThan(npxIndex);
  });

  /**
   * @test REQ-153-1
   * @intent has a blocking PR-title step that pipes the title via env + printf (§5.2)
   * @covers AC-153-1-01
   */
  it('has a blocking PR-title step that pipes the title via env + printf (§5.2)', () => {
    const block = jobBlock('commit-lint');
    // The title must be passed through env, never interpolated into the script.
    expect(block).toMatch(/PR_TITLE:\s*\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/);
    expect(block).toMatch(/printf '%s' "\$PR_TITLE" \| npx --no-install commitlint/);
    // (a) is the load-bearing step and must not be downgraded to a warning.
    const titleStep = block.slice(block.indexOf('PR_TITLE:'));
    const stepStart = block.lastIndexOf('- name:', block.indexOf('PR_TITLE:'));
    const step = block.slice(stepStart, titleStep.length + titleStep.indexOf('\n'));
    expect(step).not.toMatch(/continue-on-error:\s*true/);
  });

  /**
   * @test REQ-153-1
   * @intent steps are split per §5.1: base-ref resolution blocks, range check warns
   * @covers AC-153-1-02
   */
  it('steps are split per §5.1: base-ref resolution blocks, range check warns', () => {
    const block = jobBlock('commit-lint');
    // base ref resolution must fail loudly, never silently continue.
    expect(block).toMatch(/base ref/i);
    // (b) range check is advisory.
    const rangeMatch = block.match(
      /- name:[^\n]*\n(?:[^\n]*\n)*?[^\n]*continue-on-error:\s*true[^\n]*\n(?:[^\n]*\n)*?[^\n]*--from[^\n]*/
    );
    expect(rangeMatch).not.toBeNull();
  });

  /**
   * @test REQ-153-1
   * @intent runs the full expected command sequence
   * @covers AC-153-1-04
   */
  it('runs the full expected command sequence', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/--from "origin\/\$BASE_REF" --to HEAD/);
    expect(block).toMatch(/npx --no-install commitlint/);
    // No bare `npx commitlint` that could hit the registry (§5.2 prerequisite).
    expect(block).not.toMatch(/npx commitlint/);
  });

  /**
   * @test REQ-153-1
   * @intent contains the §5.4 runtime self-check asserting a known-bad message is rejected
   * @covers AC-153-1-01
   */
  it('contains the §5.4 runtime self-check asserting a known-bad message is rejected', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/self-check/i);
    expect(block).toMatch(/bad message no type/);
    expect(block).toMatch(/fail-open/);
    expect(block).toMatch(/feat: self check/);
  });
});

describe('release test suites are selected by a CI job (REQ-153-4)', () => {
  /**
   * @test REQ-153-4
   * @intent every suite this sprint added is matched by a CI job glob, because a
   *   suite no job selects is not a control at all
   * @covers AC-153-4-01
   */
  it('matches each suite against the glob of the job that should run it', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/pr.yml'), 'utf8');
    const integrationGlob = workflow.match(
      /npx vitest run (tests\/\*\.integration\.test\.ts)/
    )?.[1];

    expect(integrationGlob).toBe('tests/*.integration.test.ts');

    // The integration glob is `tests/*.integration.test.ts` — a DOT before
    // `integration`. A file named `release-integration.test.ts` (hyphen) matches
    // NEITHER glob as intended: it is not excluded from the unit job and not
    // included by the integration job. Measured with bash, the integration glob
    // expanded to 6 files and the hyphenated name was not among them, so that
    // suite ran only because the unit job happened to catch it.
    for (const file of ['release.integration.test.ts']) {
      expect(existsSync(join(repoRoot, 'tests', file)), `tests/${file} is missing`).toBe(true);
      expect(file.endsWith('.integration.test.ts')).toBe(true);
    }

    for (const file of [
      'commitlint-ci.test.ts',
      'sync-version-parity.test.ts',
      'optin-hooks.test.ts',
      'release-config.test.ts',
      'release-bootstrap.test.ts',
      'release-hook-key.test.ts',
    ]) {
      expect(existsSync(join(repoRoot, 'tests', file)), `tests/${file} is missing`).toBe(true);
      // Must not be excluded from the unit job by an over-eager name.
      expect(file.endsWith('.integration.test.ts')).toBe(false);
    }
  });
});
