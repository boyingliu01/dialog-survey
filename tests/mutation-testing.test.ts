import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * @test REQ-155 / AC-1, AC-2, AC-3
 * @intent Lock the three acceptance criteria of issue #155 (mutation testing:
 *   incremental < 30% of full time, ≥4 parallel workers, advisory CI job):
 *   the orchestrator's diff-based file selection and concurrency floor are
 *   tested as pure functions, and the workflow/config wiring is asserted
 *   statically so a regression (e.g. dropping --mutate or the advisory job)
 *   fails loudly without running Stryker itself.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf-8');

interface MutationTestModule {
  selectMutableFiles: (diff: string) => string[];
  resolveBaseRef: (candidates: string[], exists: (ref: string) => boolean) => string | undefined;
  resolveConcurrency: (explicit: string | undefined, cpuCount: number) => number;
  buildStrykerArgs: (opts: { files?: string[]; concurrency: number }) => string[];
  collectChangedFiles: (opts: {
    base?: string;
    git: (args: string[]) => string | null;
  }) => { files: string[]; diffFailed: boolean };
  main: (opts: Record<string, unknown>) => number;
}

async function loadModule(): Promise<MutationTestModule> {
  // @ts-expect-error - mutation-test.mjs has no type declarations (same pattern as cli.test.ts)
  return import('../scripts/mutation-test.mjs');
}

describe('mutation-test orchestrator (issue #155)', () => {
  it('AC-1: selects only mutable src TypeScript files from a git diff', async () => {
    const mod = await loadModule();
    const diff = [
      'src/api/plans.ts',
      'src/generated/client/models.ts', // build output — never mutate
      'src/utils/logger.d.ts', // declaration file — no mutants possible
      'tests/plans-api.test.ts', // tests are not mutation targets
      'package.json',
      'src/views/x.njk',
      'scripts/deploy.sh',
    ].join('\n');
    expect(mod.selectMutableFiles(diff)).toEqual(['src/api/plans.ts']);
  });

  it('AC-1: collectChangedFiles unions base...HEAD range, working tree and untracked files', async () => {
    const mod = await loadModule();
    const calls: string[][] = [];
    const fakeGit = (args: string[]): string | null => {
      calls.push(args);
      if (args[0] === 'diff' && args[2]?.includes('...HEAD')) return 'src/a.ts\nsrc/b.ts\n';
      if (args[0] === 'diff' && args[2] === 'HEAD') return 'src/b.ts\nsrc/c.ts\nREADME.md\n';
      if (args[0] === 'ls-files') return 'src/d.ts\nnotes.txt\n';
      return null;
    };
    expect(mod.collectChangedFiles({ base: 'origin/master', git: fakeGit }).files).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
    ]);
    // The range must be delegated to git's own merge-base resolution.
    expect(calls.some((args) => args.includes('origin/master...HEAD'))).toBe(true);
  });

  it('AC-1: a FAILED base diff is reported, not swallowed as an empty set', async () => {
    const mod = await loadModule();
    const fakeGit = (args: string[]): string | null => {
      if (args[0] === 'diff' && args[2]?.includes('...HEAD')) return null; // exit != 0
      if (args[0] === 'diff') return '';
      if (args[0] === 'ls-files') return '';
      return null;
    };
    const result = mod.collectChangedFiles({ base: 'origin/typo', git: fakeGit });
    expect(result.files).toEqual([]);
    expect(result.diffFailed).toBe(true);
  });

  it('AC-1: passes the changed set to Stryker via --mutate (incremental entry)', async () => {
    const mod = await loadModule();
    const args = mod.buildStrykerArgs({ files: ['src/a.ts', 'src/b.ts'], concurrency: 6 });
    expect(args.slice(0, 4)).toEqual(['stryker', 'run', '--concurrency', '6']);
    expect(args).toContain('--mutate');
    expect(args[args.indexOf('--mutate') + 1]).toBe('src/a.ts,src/b.ts');
  });

  it('AC-2: worker count is at least 4 even on small machines, honors overrides', async () => {
    const mod = await loadModule();
    expect(mod.resolveConcurrency(undefined, 2)).toBe(4);
    expect(mod.resolveConcurrency(undefined, 1)).toBe(4);
    expect(mod.resolveConcurrency(undefined, 16)).toBe(15);
    expect(mod.resolveConcurrency('8', 4)).toBe(8);
    expect(mod.resolveConcurrency('bogus', 8)).toBe(7);
  });

  it('resolveBaseRef picks the first existing ref candidate', async () => {
    const mod = await loadModule();
    expect(
      mod.resolveBaseRef(['origin/main', 'origin/master', 'HEAD~1'], (r) => r === 'origin/master')
    ).toBe('origin/master');
    expect(mod.resolveBaseRef(['nope'], () => false)).toBeUndefined();
  });
});

describe('mutation testing configuration contract (issue #155)', () => {
  it('ships a stryker config using the vitest runner with a >=4-worker floor', () => {
    const config = JSON.parse(read('stryker.conf.json')) as Record<string, unknown>;
    expect(config['testRunner']).toBe('vitest');
    const vitest = config['vitest'] as Record<string, unknown>;
    expect(vitest['configFile']).toBe('vitest.config.mutation.ts');
    // Parallel AC: default concurrency is at least 4 workers.
    expect(Number(config['concurrency'])).toBeGreaterThanOrEqual(4);
    // Mutants must be limited to src, excluding generated client code.
    expect(config['mutate']).toContain('src/**/*.ts');
    expect(config['mutate']).toContain('!src/generated/**');
  });

  it('dedicated vitest profile excludes browser e2e from mutant runs', () => {
    const configSource = read('vitest.config.mutation.ts');
    expect(configSource).toContain('tests/e2e/**');
    expect(configSource).toContain('retry: 0');
  });

  it('CI runs the incremental mutation job on PRs as an advisory check', () => {
    const yml = read('.github/workflows/pr.yml');
    expect(yml).toContain('mutation-tests:');
    expect(yml).toContain('npm run test:mutation:incremental');
    // Advisory must be enforced at the JOB level: a step-level coe does not
    // absorb a killed job, and a substring search over the whole body would
    // pass even after someone deletes the job-level flag (the step-level one
    // appears inside `steps:`). Assert it BEFORE `steps:`.
    const jobStart = yml.indexOf('  mutation-tests:');
    const nextJob = yml.slice(jobStart + 1).search(/^ {2}\S/m);
    const jobBody = yml.slice(jobStart, nextJob === -1 ? undefined : jobStart + 1 + nextJob);
    const stepsAt = jobBody.indexOf('\n    steps:');
    const jobHeader = stepsAt === -1 ? jobBody : jobBody.slice(0, stepsAt);
    expect(jobHeader).toMatch(/^ {4}continue-on-error:\s*true$/m);
    // Dispatch runs have no base_ref — the command must not degrade to "origin/".
    expect(jobBody).not.toMatch(/--base "origin\/\$\{\{ github\.base_ref \}\}"/);
    expect(jobBody).toContain("github.base_ref || 'master'");
  });

  it('npm scripts expose full and incremental mutation entry points', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:mutation']).toContain('stryker run');
    expect(pkg.scripts['test:mutation:incremental']).toContain('scripts/mutation-test.mjs');
    expect(existsSync(path.join(repoRoot, 'scripts/mutation-test.mjs'))).toBe(true);
  });

  it('the orchestrator script parses as valid ESM and exports its contract', async () => {
    const mod: MutationTestModule = await loadModule();
    for (const fn of [
      'selectMutableFiles',
      'resolveBaseRef',
      'resolveConcurrency',
      'buildStrykerArgs',
      'collectChangedFiles',
    ] as const) {
      expect(typeof mod[fn]).toBe('function');
    }
  });

  it('stryker deps are pinned devDependencies so detect_mutation_testable succeeds', () => {
    const pkg = JSON.parse(read('package.json')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['@stryker-mutator/core']).toBeDefined();
    expect(pkg.devDependencies['@stryker-mutator/vitest-runner']).toBeDefined();
  });
});

describe('behavioural proof of the incremental skip path', () => {
  it('exits 0 without launching Stryker when nothing mutable changed', async () => {
    const mod = await loadModule();
    let launched = false;
    const exitCode = mod.main({
      argv: [],
      env: {},
      git: (args: string[]) =>
        args[0] === 'rev-parse' ? '\n' : args[0] === 'diff' ? 'README.md\n' : '',
      spawn: () => {
        launched = true;
        return { status: 0 };
      },
      cpuCount: 8,
    });
    expect(exitCode).toBe(0);
    expect(launched).toBe(false);
  });

  it('exits non-zero when the base diff fails and no files were found (no green no-op)', async () => {
    const mod = await loadModule();
    const exitCode = mod.main({
      argv: ['--base', 'origin/does-not-exist'],
      env: {},
      git: (args: string[]) => {
        if (args[0] === 'rev-parse') return null;
        // The base...HEAD range FAILS; the working-tree commands succeed empty.
        if (args[0] === 'diff' && args[2]?.includes('...HEAD')) return null;
        if (args[0] === 'diff') return '';
        if (args[0] === 'ls-files') return '';
        return null;
      },
      spawn: () => ({ status: 0 }),
      cpuCount: 8,
    });
    expect(exitCode).not.toBe(0);
  });

  it('falls back to base candidates when --base resolves to a bare "origin/"', async () => {
    const mod = await loadModule();
    const bases: string[] = [];
    const exitCode = mod.main({
      argv: ['--base', 'origin/'],
      env: {},
      git: (args: string[]) => {
        if (args[0] === 'rev-parse') return args[2] === 'origin/master' ? 'sha\n' : null;
        if (args[0] === 'diff' && args[2]) bases.push(args[2]);
        if (args[0] === 'diff') return 'src/x.ts\n';
        if (args[0] === 'ls-files') return '';
        return null;
      },
      spawn: () => ({ status: 0 }),
      cpuCount: 8,
    });
    // It must have resolved origin/master as the range base, not "origin/".
    expect(bases.some((b) => b.startsWith('origin/master...'))).toBe(true);
    expect(exitCode).toBe(0);
  });
});
