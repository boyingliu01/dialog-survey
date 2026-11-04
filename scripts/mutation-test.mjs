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
 * Exit codes: whatever Stryker exits, unless Stryker passes and the report's
 * mutation score is below the enforced threshold (see THRESHOLD), in which case
 * this exits 1. CI treats this job as advisory via continue-on-error, so a low
 * score never blocks a PR — it is reported.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import cpus from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_CANDIDATES = ['origin/master', 'master', 'HEAD~1'];
const MUTABLE_EXTENSIONS = /\.ts$/;
const MUTABLE_PATH = /^src\//;
const EXCLUDED_PATHS = [/^src\/generated\//, /\.d\.ts$/, /^src\/server\.ts$/, /^src\/index\.ts$/];

/**
 * Stryker's JSON report, written by the `json` reporter in stryker.config.json.
 *
 * Line-mutator events Stryker counts toward the score. `RuntimeError` and
 * `CompileError` are excluded from the denominator on purpose: those mean the
 * mutant could not be evaluated at all, and counting them as "not killed" would
 * make an infrastructure failure look like weak tests. Same convention as
 * Stryker's own `mutationScore` and as the xp-gate runner (issue #209).
 */
const SCORED_EVENTS = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage']);

/** The Gate M threshold, restated here so this repo can enforce it itself. */
const DEFAULT_THRESHOLD = 60;
const REPORT_FILE = '.stryker-report.json';

/**
 * Aggregate a Stryker JSON report into `{ score, killed, scored }`.
 *
 * The report is schema 1.0 — a raw `files[].mutants[]` list with no aggregate
 * `mutationScore` field — so the score has to be computed here (issue #209
 * documents the same discovery upstream).
 *
 * Returns `null` when the report is missing or has no scored mutants, so the
 * caller can report "no evidence" rather than a fabricated 0% or a false pass.
 */
/** Does this report have a `files` object worth iterating? */
function hasFiles(report) {
  const files = report?.files;
  return Boolean(files) && typeof files === 'object';
}

/** Count one mutant into `tally` when its status is one Stryker scores. */
function tallyMutant(mutant, tally) {
  if (!SCORED_EVENTS.has(mutant?.status)) return;
  tally.scored += 1;
  if (mutant.status === 'Killed' || mutant.status === 'Timeout') tally.killed += 1;
}

/** Count every mutant in one report file entry. */
function tallyFile(entry, tally) {
  const mutants = entry?.mutants;
  if (!Array.isArray(mutants)) return;
  for (const mutant of mutants) tallyMutant(mutant, tally);
}

/**
 * Aggregate a Stryker JSON report into `{ score, killed, scored }`.
 *
 * The report is schema 1.0 — a raw `files[].mutants[]` list with no aggregate
 * `mutationScore` field — so the score has to be computed here (issue #209
 * documents the same discovery upstream).
 *
 * Returns `null` when the report is missing or has no scored mutants, so the
 * caller can report "no evidence" rather than a fabricated 0% or a false pass.
 */
export function summarizeMutationReport(report) {
  if (!hasFiles(report)) return null;
  const tally = { killed: 0, scored: 0 };
  for (const entry of Object.values(report.files)) tallyFile(entry, tally);
  if (tally.scored === 0) return null;
  return { score: (tally.killed / tally.scored) * 100, killed: tally.killed, scored: tally.scored };
}

/** Read and summarize the JSON report at `reportPath`; `null` if unreadable. */
export function readMutationReport(reportPath) {
  try {
    return summarizeMutationReport(JSON.parse(readFileSync(reportPath, 'utf-8')));
  } catch {
    return null;
  }
}

/**
 * Enforce the mutation threshold against the produced report.
 *
 * Returns 0 when the score meets the threshold, 1 when it does not, and 2 when
 * there is no usable report. "No report" is an environment failure, not a pass:
 * the same fail-closed-on-the-claim rule the gates themselves use, because a
 * missing artifact means the mutation run told us nothing.
 */
export function evaluateThreshold({ reportPath, report, threshold, log = () => {} }) {
  // `report` exists so tests (and any caller that already parsed it) can supply
  // the document directly instead of routing through the filesystem.
  const summary =
    report === undefined ? readMutationReport(reportPath) : summarizeMutationReport(report);
  if (summary === null) {
    log(
      `mutation-test: no usable report at ${reportPath ?? '<inline>'} — cannot verify the ${threshold}% threshold.`
    );
    return 2;
  }
  const score = summary.score.toFixed(2);
  if (summary.score >= threshold) {
    log(
      `mutation-test: mutation score ${score}% (${summary.killed}/${summary.scored}) meets the ${threshold}% threshold.`
    );
    return 0;
  }
  log(
    `mutation-test: mutation score ${score}% (${summary.killed}/${summary.scored}) is BELOW the ${threshold}% threshold.`
  );
  return 1;
}

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

/** Add every mutable file from a `git diff --name-only` style listing. */
function addFiles(files, listing) {
  for (const file of selectMutableFiles(listing ?? '')) files.add(file);
}

/**
 * The base range's diff, or `null` after reporting the failure.
 *
 * Three-dot means "merge-base(base, HEAD) vs HEAD" — exactly the PR's own
 * changes. Git resolves the merge-base itself; computing it separately and
 * feeding a two-dot range breaks when one side is an ancestor of the other.
 */
function baseRangeDiff(base, git) {
  const listing = git(['diff', '--name-only', `${base}...HEAD`]);
  if (listing !== null) return listing;
  // A FAILED range (shallow clone without merge-base, orphan branch, typo'd ref)
  // must not masquerade as "nothing changed" — that would be a green no-op,
  // which is the worst possible outcome for a quality job.
  console.error(
    `mutation-test: ERROR: git diff ${base}...HEAD failed; cannot compute the incremental set.`
  );
  return null;
}

export function collectChangedFiles({ base, git = defaultGit }) {
  const files = new Set();
  let diffFailed = false;
  if (base) {
    const listing = baseRangeDiff(base, git);
    if (listing === null) diffFailed = true;
    addFiles(files, listing);
  }
  // Working-tree changes (staged + unstaged) count too, for local pre-push use.
  addFiles(files, git(['diff', '--name-only', 'HEAD']));
  // Untracked new files are invisible to git diff; list them explicitly.
  addFiles(files, git(['ls-files', '--others', '--exclude-standard']));
  return { files: [...files].sort(), diffFailed };
}

/** Flags that take no value. */
const BOOLEAN_OPTIONS = { '--full': 'full', '--verify-report': 'verifyReport' };

/** Split a `--files a,b,c` payload into trimmed, non-empty paths. */
function splitFileList(value) {
  return (value ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * How each value-taking flag stores its argument.
 *
 * A table rather than a chain of `else if`: an unknown flag must be IGNORED (the
 * caller passes the whole argv, including flags meant for other tools), so the
 * fallthrough case has to be "do nothing", not "assume --base".
 */
const VALUE_OPTIONS = {
  '--base': (options, value) => {
    options.base = value;
  },
  '--files': (options, value) => {
    options.files = splitFileList(value);
  },
  '--concurrency': (options, value) => {
    options.concurrency = value;
  },
};

export function parseArgs(argv) {
  const options = {
    full: false,
    base: undefined,
    files: undefined,
    concurrency: undefined,
    verifyReport: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg in BOOLEAN_OPTIONS) {
      options[BOOLEAN_OPTIONS[arg]] = true;
      continue;
    }
    if (!(arg in VALUE_OPTIONS)) continue;
    VALUE_OPTIONS[arg](options, argv[i + 1]);
    i += 1;
  }
  return options;
}

export function buildStrykerArgs({ files, concurrency }) {
  const args = ['stryker', 'run', '--concurrency', String(concurrency)];
  if (files && files.length > 0) args.push('--mutate', files.join(','));
  return args;
}

/**
 * Work out which files to mutate, and say so.
 *
 * Returns `{ files }` on the normal path, or `{ exitCode }` when the run should
 * stop before Stryker starts (nothing to mutate, or the base diff failed and we
 * refuse to report a green no-op).
 *
 * Extracted from `main` because the three selection modes plus the empty-set
 * handling pushed that function's cyclomatic complexity to 19, which archlint
 * flags and neither `npm run complexity` (TS-only) nor Gate 3 (Python-only)
 * would have caught on a .mjs file.
 */
/**
 * The target set when the caller named one explicitly (`--full` or `--files`),
 * or null when the incremental path should run instead.
 */
function explicitTargets(options, log) {
  if (!options.full && options.files === undefined) return null;
  log(
    options.full
      ? 'mutation-test: full run over all configured sources.'
      : `mutation-test: explicit run over ${options.files?.length ?? 0} file(s).`
  );
  return { files: options.files };
}

/**
 * The base ref to diff against.
 *
 * An empty or placeholder-resolved ref (e.g. GitHub's `${{ github.base_ref }}`
 * expanding to "" on workflow_dispatch → "origin/") is not a real base — fall
 * back to the candidate list instead of failing the diff silently.
 */
function resolveIncrementalBase(options, git) {
  const requestedBase = options.base ?? '';
  const usableBase = /^origin\/?$/.test(requestedBase) ? '' : requestedBase;
  if (usableBase) return usableBase;
  return resolveBaseRef(
    DEFAULT_BASE_CANDIDATES,
    (ref) => git(['rev-parse', '--verify', ref]) !== null
  );
}

/**
 * Turn an empty changed-file set into a verdict.
 *
 * An empty set is only good news when the diff actually succeeded: a failed base
 * diff also yields nothing, and reporting that as "nothing to mutate" would turn
 * an infrastructure problem into a green no-op.
 */
function emptyTargetVerdict(diffFailed, log) {
  if (diffFailed) {
    log(
      'mutation-test: nothing mutable found AND the base diff failed — refusing to report success.'
    );
    return { exitCode: 3 };
  }
  log('mutation-test: no mutable source files changed — skipping Stryker run.');
  return { exitCode: 0 };
}

export function resolveTargets({ options, git, log = console.log }) {
  const explicit = explicitTargets(options, log);
  if (explicit) return explicit;

  const collected = collectChangedFiles({ base: resolveIncrementalBase(options, git), git });
  if (collected.files.length === 0) return emptyTargetVerdict(collected.diffFailed, log);

  log(`mutation-test: incremental run over ${collected.files.length} changed file(s):`);
  for (const file of collected.files) log(`  - ${file}`);
  return { files: collected.files };
}

/**
 * Run Stryker over `files` and return the exit code for the run itself (before
 * any threshold judgement).
 *
 * Split out because launch failure and a non-zero exit are different verdicts —
 * `error` means the process never started (npx missing, bad args), which is an
 * environment failure worth 2, while a non-zero status is Stryker's own report
 * and is passed through unchanged.
 */
function runStryker({ files, concurrency, spawn, log }) {
  const args = buildStrykerArgs({ files, concurrency });
  log(`mutation-test: npx ${args.join(' ')} (workers=${concurrency})`);
  const result = spawn('npx', args);
  if (result.error) {
    log(`mutation-test: failed to launch Stryker: ${result.error.message}`);
    return 2;
  }
  return result.status ?? 2;
}

/** Resolve the run settings from argv, the environment and the filesystem. */
function resolveRunSettings(argv, env, cwd, reportPath) {
  return {
    options: parseArgs(argv),
    threshold: Number(env['MUTATION_THRESHOLD'] ?? DEFAULT_THRESHOLD),
    reportPath: reportPath ?? path.join(cwd, REPORT_FILE),
  };
}

export function main({
  argv = process.argv.slice(2),
  env = process.env,
  spawn = (command, args) =>
    spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' }),
  git = defaultGit,
  cpuCount = cpus.cpus().length,
  cwd = process.cwd(),
  log = console.log,
  reportPath = null,
} = {}) {
  const {
    options,
    threshold,
    reportPath: resolvedReportPath,
  } = resolveRunSettings(argv, env, cwd, reportPath);

  // `--verify-report` re-checks an existing report without running Stryker. It
  // exists so a report produced elsewhere (CI artifact, a previous local run)
  // can be judged by this repo's threshold instead of by the patched xp-gate
  // runner — the point of issue #209's third suggestion.
  if (options.verifyReport) {
    return evaluateThreshold({ reportPath: resolvedReportPath, threshold, log });
  }

  const resolved = resolveTargets({ options, git, log });
  if (resolved.exitCode !== undefined) return resolved.exitCode;

  const concurrency = resolveConcurrency(
    options.concurrency ?? env['STRYKER_CONCURRENCY'],
    cpuCount
  );
  const runExitCode = runStryker({ files: resolved.files, concurrency, spawn, log });
  if (runExitCode !== 0) return runExitCode;

  return evaluateThreshold({ reportPath: resolvedReportPath, threshold, log });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
if (
  import.meta.url === `file:///${invokedPath.startsWith('/') ? invokedPath.slice(1) : invokedPath}`
) {
  process.exit(main());
}
