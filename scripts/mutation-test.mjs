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
export function summarizeMutationReport(report) {
  const files = report?.files;
  if (!files || typeof files !== 'object') return null;

  let killed = 0;
  let scored = 0;
  for (const file of Object.values(files)) {
    const mutants = file?.mutants;
    if (!Array.isArray(mutants)) continue;
    for (const mutant of mutants) {
      if (!SCORED_EVENTS.has(mutant?.status)) continue;
      scored += 1;
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') killed += 1;
    }
  }
  if (scored === 0) return null;
  return { score: (killed / scored) * 100, killed, scored };
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

export function collectChangedFiles({ base, git = defaultGit }) {
  const files = new Set();
  let diffFailed = false;
  if (base) {
    // Three-dot means "merge-base(base, HEAD) vs HEAD" — exactly the PR's own
    // changes. Git resolves the merge-base itself; computing it separately and
    // feeding a two-dot range breaks when one side is an ancestor of the other.
    const rangeDiff = git(['diff', '--name-only', `${base}...HEAD`]);
    if (rangeDiff === null) {
      // A FAILED range (shallow clone without merge-base, orphan branch, typo'd
      // ref) must not masquerade as "nothing changed" — that would be a green
      // no-op, which is the worst possible outcome for a quality job.
      diffFailed = true;
      console.error(
        `mutation-test: ERROR: git diff ${base}...HEAD failed; cannot compute the incremental set.`
      );
    }
    for (const file of selectMutableFiles(rangeDiff ?? '')) {
      files.add(file);
    }
  }
  // Working-tree changes (staged + unstaged) count too, for local pre-push use.
  for (const file of selectMutableFiles(git(['diff', '--name-only', 'HEAD']) ?? ''))
    files.add(file);
  // Untracked new files are invisible to git diff; list them explicitly.
  for (const file of selectMutableFiles(
    git(['ls-files', '--others', '--exclude-standard']) ?? ''
  )) {
    files.add(file);
  }
  return { files: [...files].sort(), diffFailed };
}

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
    if (arg === '--full') options.full = true;
    else if (arg === '--verify-report') options.verifyReport = true;
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
  cwd = process.cwd(),
  log = console.log,
  reportPath = null,
} = {}) {
  const options = parseArgs(argv);
  const threshold = Number(env['MUTATION_THRESHOLD'] ?? DEFAULT_THRESHOLD);
  const resolvedReportPath = reportPath ?? path.join(cwd, REPORT_FILE);

  // `--verify-report` re-checks an existing report without running Stryker. It
  // exists so a report produced elsewhere (CI artifact, a previous local run)
  // can be judged by this repo's threshold instead of by the patched xp-gate
  // runner — the point of issue #209's third suggestion.
  if (options.verifyReport) {
    return evaluateThreshold({ reportPath: resolvedReportPath, threshold, log });
  }

  const concurrency = resolveConcurrency(
    options.concurrency ?? env['STRYKER_CONCURRENCY'],
    cpuCount
  );

  let files = options.files;
  if (!options.full && files === undefined) {
    const requestedBase = options.base ?? '';
    // An empty or placeholder-resolved ref (e.g. GitHub's `${{ github.base_ref }}`
    // expanding to "" on workflow_dispatch → "origin/") is not a real base —
    // fall back to the candidate list instead of failing the diff silently.
    const usableBase = /^origin\/?$/.test(requestedBase) ? '' : requestedBase;
    const base =
      usableBase ||
      resolveBaseRef(
        DEFAULT_BASE_CANDIDATES,
        (ref) => git(['rev-parse', '--verify', ref]) !== null
      );
    const collected = collectChangedFiles({ base, git });
    files = collected.files;
    if (files.length === 0) {
      if (collected.diffFailed) {
        console.error(
          'mutation-test: nothing mutable found AND the base diff failed — refusing to report success.'
        );
        return 3;
      }
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
  if (result.status !== 0) return result.status ?? 2;

  return evaluateThreshold({
    reportPath: reportPath ?? path.join(cwd, REPORT_FILE),
    threshold,
    log,
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).replace(/\\/g, '/') : '';
if (
  import.meta.url === `file:///${invokedPath.startsWith('/') ? invokedPath.slice(1) : invokedPath}`
) {
  process.exit(main());
}
