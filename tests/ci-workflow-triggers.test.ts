import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test CI triggers
 * @intent `pr.yml` holds every blocking quality gate (tests, lint, coverage,
 *   commit range). It used to trigger on `pull_request` only, so a commit that
 *   went straight to master — which is how release commits and hotfixes land —
 *   ran NONE of them while the Actions tab still showed green runs, because the
 *   only workflows that fire on a master push are `Publish to npm` and `Spike`
 *   (neither runs tests or lint). Verified on 2026-11-03: HEAD `1747755` had
 *   zero "PR Quality Gates" runs.
 *
 * These assertions read the real workflow file rather than a parsed AST, which
 * is the established pattern here (`tests/commitlint-ci.test.ts`,
 * `tests/coverage-gate.test.ts`). Parsing would need a `yaml` dependency that
 * the repo does not declare — it is only present transitively — and a test that
 * depends on a transitive package breaks the moment the dependency tree changes.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workflowPath = join(repoRoot, '.github', 'workflows', 'pr.yml');
const workflow = readFileSync(workflowPath, 'utf8');

/** The `on:` block, from `on:` up to the next top-level key. */
const onBlock = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('concurrency:'));

describe('pr.yml triggers', () => {
  it('runs on pull_request', () => {
    expect(onBlock).toMatch(/pull_request:/);
  });

  it('runs on push to master, so a direct commit is still gated', () => {
    // The regression this guards: `push:` absent meant every gate was skippable
    // by committing to master directly.
    expect(onBlock).toMatch(/push:/);
    expect(onBlock).toMatch(/push:[\s\S]*?branches:\s*\[[^\]]*master[^\]]*\]/);
  });

  it('still allows a manual dispatch', () => {
    expect(onBlock).toMatch(/workflow_dispatch:/);
  });

  it('gates pushes to the same branches it gates pull requests against', () => {
    // A push to a branch no PR targets would otherwise be ungated.
    const prBranches = onBlock.match(/pull_request:[\s\S]*?branches:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const pushBranches = onBlock.match(/push:[\s\S]*?branches:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const norm = (value: string): string[] =>
      value
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean)
        .sort();
    expect(norm(pushBranches)).toEqual(norm(prBranches));
  });
});

describe('pr.yml jobs that assume a pull_request', () => {
  /**
   * Every job that reads PR-only context must be guarded, or enabling the push
   * trigger turns a previously-passing workflow red on the first merge.
   */
  it('guards commit-lint behind an event_name check', () => {
    // commit-lint validates `github.event.pull_request.title`, which is empty on
    // a push. Without the guard it would fail with "base ref is empty".
    const jobStart = workflow.indexOf('  commit-lint:');
    expect(jobStart).toBeGreaterThan(-1);
    const job = workflow.slice(jobStart, workflow.indexOf('  version-consistency:'));
    expect(job).toMatch(/if:\s*github\.event_name == 'pull_request'/);
  });

  it('falls back to master wherever github.base_ref is used outside a guarded job', () => {
    // github.base_ref is empty on BOTH workflow_dispatch and push, so every use
    // in a job that can run on those events needs `|| 'master'`. Inside
    // commit-lint the bare form is fine because that job cannot run there — its
    // guard is asserted above.
    //
    // Only shell/expression uses count: comments explain the fallback in prose
    // and one error message merely names the variable.
    const commitLintStart = workflow.indexOf('  commit-lint:');
    const versionConsistencyStart = workflow.indexOf('  version-consistency:');

    const lines = workflow.split('\n');
    const offenders: string[] = [];
    let offset = 0;
    for (const line of lines) {
      const lineOffset = offset;
      offset += line.length + 1;
      if (!line.includes('${{')) continue; // only expression uses matter
      if (!line.includes('github.base_ref')) continue;
      const inCommitLint = lineOffset >= commitLintStart && lineOffset < versionConsistencyStart;
      if (inCommitLint) continue;
      if (!/\|\|\s*'master'/.test(line)) offenders.push(line.trim());
    }
    expect(offenders).toEqual([]);

    // And the fallback form really is used somewhere, so this cannot pass by
    // never finding a base_ref expression at all.
    expect(workflow).toMatch(/github\.base_ref \|\| 'master'/);
  });

  it('only reads the PR title inside a pull_request-guarded job', () => {
    const titleUses = workflow.match(/github\.event\.pull_request\.title/g) ?? [];
    expect(titleUses.length).toBeGreaterThan(0);
    // All of them live in commit-lint, whose guard is asserted above.
    const commitLint = workflow.slice(
      workflow.indexOf('  commit-lint:'),
      workflow.indexOf('  version-consistency:')
    );
    const titlesInCommitLint = commitLint.match(/github\.event\.pull_request\.title/g) ?? [];
    expect(titlesInCommitLint.length).toBe(titleUses.length);
  });
});
