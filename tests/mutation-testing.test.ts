import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  summarizeMutationReport: (
    report: unknown
  ) => { score: number; killed: number; scored: number } | null;
  evaluateThreshold: (opts: {
    reportPath?: string;
    report?: unknown;
    threshold: number;
  }) => number;
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
    const reportPath = path.join(tmpdir(), `mutation-report-${process.pid}-${Math.random()}.json`);
    writeFileSync(reportPath, JSON.stringify(passingReport()), 'utf-8');
    try {
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
        reportPath,
      });
      // It must have resolved origin/master as the range base, not "origin/".
      expect(bases.some((b) => b.startsWith('origin/master...'))).toBe(true);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(reportPath, { force: true });
    }
  });

  it('passes a report path through so the threshold check is not coupled to the cwd', async () => {
    const mod = await loadModule();
    const reportPath = path.join(tmpdir(), `mutation-report-${process.pid}-${Math.random()}.json`);
    writeFileSync(reportPath, JSON.stringify(passingReport()), 'utf-8');
    try {
      const exitCode = mod.main({
        argv: [],
        env: {},
        git: (args: string[]) => (args[0] === 'diff' ? 'src/x.ts\n' : ''),
        spawn: () => ({ status: 0 }),
        cpuCount: 8,
        reportPath,
      });
      expect(exitCode).toBe(0);
    } finally {
      rmSync(reportPath, { force: true });
    }
  });
});

/**
 * A minimal Stryker schema-1.0 report: a raw `files[].mutants[]` list, with no
 * aggregate `mutationScore` field (that absence is the whole point of #209).
 */
function reportWith(statuses: string[]): { files: Record<string, unknown> } {
  return {
    files: {
      'src/x.ts': { mutants: statuses.map((status) => ({ status })) },
    },
  };
}

/** 8 killed of 10 scored = 80%, comfortably above the 60% threshold. */
function passingReport(): { files: Record<string, unknown> } {
  return reportWith([
    'Killed',
    'Killed',
    'Killed',
    'Killed',
    'Killed',
    'Killed',
    'Killed',
    'Killed',
    'Survived',
    'NoCoverage',
  ]);
}

describe('mutation threshold enforcement (issue #209)', () => {
  it('aggregates a schema-1.0 report that has no aggregate score field', async () => {
    const mod = await loadModule();
    const summary = mod.summarizeMutationReport(
      reportWith(['Killed', 'Survived', 'NoCoverage', 'Timeout'])
    );
    expect(summary).not.toBeNull();
    // Killed + Timeout are kills; Survived + NoCoverage are misses: 2/4.
    expect(summary?.killed).toBe(2);
    expect(summary?.scored).toBe(4);
    expect(summary?.score).toBeCloseTo(50, 5);
  });

  it('excludes mutants that could not be evaluated from the denominator', async () => {
    const mod = await loadModule();
    // RuntimeError / CompileError / Ignored / Pending are not evidence about the
    // tests, so counting them would turn infrastructure failure into a low score.
    const summary = mod.summarizeMutationReport(
      reportWith(['Killed', 'Survived', 'RuntimeError', 'CompileError', 'Ignored', 'Pending'])
    );
    expect(summary?.scored).toBe(2);
    expect(summary?.score).toBeCloseTo(50, 5);
  });

  it('returns null rather than a fabricated 0% when the report has no scored mutants', async () => {
    const mod = await loadModule();
    expect(mod.summarizeMutationReport(reportWith([]))).toBeNull();
    expect(mod.summarizeMutationReport({ files: {} })).toBeNull();
    expect(mod.summarizeMutationReport(null)).toBeNull();
  });

  it('passes at or above the threshold, fails below it', async () => {
    const mod = await loadModule();
    expect(mod.evaluateThreshold({ report: passingReport(), threshold: 60 })).toBe(0);
    const weak = mod.evaluateThreshold({
      report: reportWith(['Killed', 'Survived']),
      threshold: 60,
    });
    expect(weak).toBe(1);
  });

  it('treats a missing report as no evidence, never as a pass', async () => {
    const mod = await loadModule();
    const missing = path.join(tmpdir(), `absent-${process.pid}.json`);
    expect(mod.evaluateThreshold({ reportPath: missing, threshold: 60 })).toBe(2);
  });

  it('--verify-report judges an existing report without launching Stryker', async () => {
    const mod = await loadModule();
    const reportPath = path.join(tmpdir(), `mutation-report-${process.pid}-${Math.random()}.json`);
    writeFileSync(reportPath, JSON.stringify(passingReport()), 'utf-8');
    let launched = false;
    try {
      const exitCode = mod.main({
        argv: ['--verify-report'],
        env: {},
        git: () => null,
        spawn: () => {
          launched = true;
          return { status: 0 };
        },
        cpuCount: 8,
        reportPath,
      });
      expect(exitCode).toBe(0);
      // The whole point: re-judging a report must not re-run the mutation suite.
      expect(launched).toBe(false);
    } finally {
      rmSync(reportPath, { force: true });
    }
  });

  it('--verify-report honours the MUTATION_THRESHOLD override', async () => {
    const mod = await loadModule();
    const reportPath = path.join(tmpdir(), `mutation-report-${process.pid}-${Math.random()}.json`);
    // 1 killed of 5 = 20%: below the default 60%, above an explicit 5%.
    writeFileSync(
      reportPath,
      JSON.stringify(reportWith(['Killed', 'Survived', 'Survived', 'NoCoverage', 'NoCoverage'])),
      'utf-8'
    );
    try {
      expect(mod.main({ argv: ['--verify-report'], env: {}, reportPath, log: () => {} })).toBe(1);
      expect(
        mod.main({ argv: ['--verify-report'], env: { MUTATION_THRESHOLD: '5' }, reportPath })
      ).toBe(0);
    } finally {
      rmSync(reportPath, { force: true });
    }
  });
});
