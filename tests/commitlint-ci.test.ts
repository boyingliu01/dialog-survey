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
  it('exists as a .cjs file so it loads under the ESM "type": "module" package', () => {
    const { name } = findCommitlintConfig();
    expect(name).toBe('commitlint.config.cjs');
  });

  it('extends @commitlint/config-conventional', () => {
    const { body } = findCommitlintConfig();
    expect(body).toMatch(/['"]@commitlint\/config-conventional['"]/);
  });

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

  it('is loadable by commitlint and rejects a non-conventional message', () => {
    expect(lintMessage('bad message no type')).not.toBe(0);
  });

  it('accepts a conventional message', () => {
    // A passing run exits 0 and prints nothing to stdout, so status is the assertion.
    expect(lintMessage('feat: self check')).toBe(0);
  });

  it('accepts ignored bot/merge forms (§5.3) while still rejecting bad input', () => {
    expect(lintMessage('Bump lodash from 1 to 2')).toBe(0);
    expect(lintMessage('chore(release): 1.2.3')).toBe(0);
    expect(lintMessage('foo: bar')).not.toBe(0);
  });
});

describe('commit-lint job in .github/workflows/pr.yml (AC-4 / AC-12)', () => {
  it('exists as a job named commit-lint without needs (AC-12)', () => {
    const block = jobBlock('commit-lint');
    expect(block).not.toBe('');
    expect(block).not.toMatch(/^\s{4}needs:/m);
  });

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

  it('checks out full history for the origin/<base>..HEAD range (§5.1)', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/fetch-depth:\s*0/);
    expect(block).toMatch(/github\.base_ref/);
  });

  it('installs dependencies with npm ci before any npx --no-install invocation', () => {
    const block = jobBlock('commit-lint');
    const ciIndex = block.indexOf('npm ci');
    const npxIndex = block.indexOf('npx --no-install commitlint');
    expect(ciIndex).toBeGreaterThan(-1);
    expect(npxIndex).toBeGreaterThan(-1);
    expect(ciIndex).toBeLessThan(npxIndex);
  });

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

  it('runs the full expected command sequence', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/--from "origin\/\$BASE_REF" --to HEAD/);
    expect(block).toMatch(/npx --no-install commitlint/);
    // No bare `npx commitlint` that could hit the registry (§5.2 prerequisite).
    expect(block).not.toMatch(/npx commitlint/);
  });

  it('contains the §5.4 runtime self-check asserting a known-bad message is rejected', () => {
    const block = jobBlock('commit-lint');
    expect(block).toMatch(/self-check/i);
    expect(block).toMatch(/bad message no type/);
    expect(block).toMatch(/fail-open/);
    expect(block).toMatch(/feat: self check/);
  });
});
