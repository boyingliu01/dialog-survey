#!/usr/bin/env node
// @no-test-required: CLI orchestrator; its pure logic lives in exported functions and is unit-tested by tests/mutation-testing.test.ts
/**
 * Incremental + parallel mutation testing entry point (issue #155).
 *
 *   node scripts/mutation-test.mjs                     # diff vs origin/master (or master, or HEAD~1)
 *   node scripts/mutation-test.mjs --base <ref>        # explicit base ref
 *   node scripts/mutation-test.mjs --files a.ts,b.ts   # explicit file list
 *   node scripts/mutation-test.mjs --full              # mutate everything in stryker.config.mjs
 *   node scripts/mutation-test.mjs --concurrency 8     # worker override
 *
 * Incremental strategy: only files changed between the merge-base and HEAD
 * (plus working-tree changes) are passed to Stryker via `--mutate`, so
 * mutants in untouched files are never generated or executed. Combined with
 * parallel workers this keeps PR runs far below a full run's wall time.
 *
 * Exit codes: whatever Stryker exits (0 = score at/above break-threshold).
 * CI treats this job as advisory via continue-on-error, so a low score never
 * blocks a PR — it is reported.
 */

import { spawnSync } from 'node:child_process';
import cpus from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_CANDIDATES = ['origin/master', 'master', 'HEAD~1'];
const MUTABLE_EXTENSIONS = /\.ts$/;
const MUTABLE_PATH = /^src\//;
const EXCLUDED_PATHS = [/^src\/generated\//, /\.d\.ts$/, /^src\/server\.ts$/, /^src\/index\.ts$/];

/** Parse `git diff --name-only` output into the mutable source subset. */
export function selectMutableFiles(diffOutput) {
  return diffOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => MUTABLE_PATH.test(file) && MUTABLE_EXTENSIONS.test(file))
    .filter((file) => !EXCLUDED_PATHS.some((pattern) => pattern.test(file)));
}

/** Resolve the first git ref that exists; returns undefined when none do. */
export function resolveBaseRef(candidates, refExists) {
  for (const candidate of candidates) {
    if (refExists(candidate)) return candidate;
  }
  return undefined;
}

/** Concurrency floor per issue #155 AC-2: at least 4 workers unless overridden. */
export function resolveConcurrency(explicit, cpuCount) {
  const parsed = Number.parseInt(String(explicit ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(4, cpuCount - 1);
}

function defaultGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  return result.status === 0 ? result.stdout : null;
}

export function collectChangedFiles({ base, git = defaultGit }) {
  const files = new Set();
  if (base) {
    // Three-dot means "merge-base(base, HEAD) vs HEAD" — exactly the PR's own
    // changes. Git resolves the merge-base itself; computing it separately and
    // feeding a two-dot range breaks when one side is an ancestor of the other.
    for (const file of selectMutableFiles(git(['diff', '--name-only', `${base}...HEAD`]) ?? '')) {
      files.add(file);
    }
  }
  // Working-tree changes (staged + unstaged) count too, for local pre-push use.
  for (const file of selectMutableFiles(git(['diff', '--name-only', 'HEAD']) ?? ''))
    files.add(file);
  return [...files].sort();
}

export function parseArgs(argv) {
  const options = { full: false, base: undefined, files: undefined, concurrency: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') options.full = true;
    else if (arg === '--base') options.base = argv[++i];
    else if (arg === '--files')
      options.files = (argv[++i] ?? '')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
    else if (arg === '--concurrency') options.concurrency = argv[++i];
  }
  return options;
}

export function buildStrykerArgs({ files, concurrency }) {
  const args = ['stryker', 'run', '--concurrency', String(concurrency)];
  if (files && files.length > 0) args.push('--mutate', files.join(','));
  return args;
}

export function main({
  argv = process.argv.slice(2),
  env = process.env,
  spawn = (command, args) =>
    spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' }),
  git = defaultGit,
  cpuCount = cpus.cpus().length,
} = {}) {
  const options = parseArgs(argv);
  const concurrency = resolveConcurrency(
    options.concurrency ?? env['STRYKER_CONCURRENCY'],
    cpuCount
  );

  let files = options.files;
  if (!options.full && files === undefined) {
    const base =
      options.base ??
      resolveBaseRef(
        DEFAULT_BASE_CANDIDATES,
        (ref) => git(['rev-parse', '--verify', ref]) !== null
      );
    files = collectChangedFiles({ base, git });
    if (files.length === 0) {
      console.log('mutation-test: no mutable source files changed — skipping Stryker run.');
      return 0;
    }
    console.log(`mutation-test: incremental run over ${files.length} changed file(s):`);
    for (const file of files) console.log(`  - ${file}`);
  } else {
    console.log(
      options.full
        ? 'mutation-test: full run over all configured sources.'
        : `mutation-test: explicit run over ${files?.length ?? 0} file(s).`
    );
  }

  const strykerArgs = buildStrykerArgs({ files, concurrency });
  console.log(`mutation-test: npx ${strykerArgs.join(' ')} (workers=${concurrency})`);
  const result = spawn('npx', strykerArgs);
  if (result.error) {
    console.error(`mutation-test: failed to launch Stryker: ${result.error.message}`);
    return 2;
  }
  return result.status ?? 2;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
if (
  import.meta.url === `file:///${invokedPath.startsWith('/') ? invokedPath.slice(1) : invokedPath}`
) {
  process.exit(main());
}
