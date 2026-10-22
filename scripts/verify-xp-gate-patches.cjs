#!/usr/bin/env node
/**
 * Verify (and optionally restore) the local xp-gate mutations that make Gate M
 * able to produce a verdict at all.
 *
 * xp-gate installs its hooks and modules under `~/.config/xp-gate/`, which is
 * outside this repository. Three upstream bugs there cause Gate M to report a
 * 0.0% mutation score (or to skip entirely) no matter how good the tests are:
 *
 *   1. `runners/stryker-runner.ts` passes `--config`, which Stryker has no such
 *      option for, and repeats `--mutate`, where only the last occurrence wins.
 *   2. The same file reads `mutationScore` / `nrOfMutants` from the report, but
 *      Stryker 9.x writes schema 1.0: a raw mutant list with no aggregate fields.
 *   3. `hooks/pre-push` runs the TypeScript gate without `--timeout`, so it uses
 *      gate-m.ts's 120s default. A single 200-test file needs ~210s; the two
 *      files this repo mutates need ~48 minutes.
 *
 * The fixes are recorded here because an xp-gate update overwrites the installed
 * files. Run with no arguments to check; pass `--fix` to re-apply the TypeScript
 * hook fix (the runner rewrite is larger and is only reported).
 *
 * Exit codes: 0 = all patches present, 1 = at least one missing.
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const FIX = process.argv.includes('--fix');

/** CLI output goes through here: this repo bans `console` (Biome `noConsole`). */
function say(line) {
  process.stdout.write(`${line}\n`);
}

const XPGATE = join(homedir(), '.config', 'xp-gate');
const RUNNER = join(XPGATE, 'modules', 'mutation', 'runners', 'stryker-runner.ts');
const HOOK = join(XPGATE, 'hooks', 'pre-push');

const ORIGINAL_HOOK_CALL =
  'RUN_TSX_TIMEOUT=600s run_tsx $MUTATION_SCRIPT --changed-files "$CHANGED_SOURCE_FILES" > "$MUTATION_OUTPUT" 2>&1';
const PATCHED_HOOK_CALL =
  'RUN_TSX_TIMEOUT=3720s run_tsx $MUTATION_SCRIPT --changed-files "$CHANGED_SOURCE_FILES" --timeout 3600000 > "$MUTATION_OUTPUT" 2>&1';

function readOrNull(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

const hookSource = readOrNull(HOOK);
const runnerSource = readOrNull(RUNNER);

const checks = [
  {
    name: 'stryker-runner: --mutate joined with a comma',
    file: RUNNER,
    marker: "options.files.join(',')",
    symptom: 'only the last changed file is mutated; the others score 0 and BLOCK the push',
    fixable: false,
  },
  {
    name: 'stryker-runner: config passed as a positional argument',
    file: RUNNER,
    marker: '...(configPath ? [configPath] : [])',
    symptom: "stryker exits with `error: unknown option '--config'`",
    fixable: false,
  },
  {
    name: 'stryker-runner: scores aggregated from the mutant list',
    file: RUNNER,
    marker: 'fromMutantList',
    symptom: 'every file reads undefined and is reported as a 0.0% mutation score',
    fixable: false,
  },
  {
    name: 'pre-push: explicit --timeout for the TypeScript mutation gate',
    file: HOOK,
    marker: '--changed-files "$CHANGED_SOURCE_FILES" --timeout 3600000',
    symptom: 'gate uses the 120s default and every push degrades to SKIP (timed out)',
    fixable: true,
  },
];

let failures = 0;
let restoredCount = 0;

for (const check of checks) {
  const source = check.file === HOOK ? hookSource : runnerSource;
  if (source === null) {
    say(`SKIP     ${check.name}`);
    say(`         ${check.file} not found — is xp-gate installed?`);
    continue;
  }
  if (source.includes(check.marker)) {
    say(`OK       ${check.name}`);
    continue;
  }

  say(`MISSING  ${check.name}`);
  say(`         ${check.file}`);
  say(`         symptom: ${check.symptom}`);

  if (check.fixable && FIX && source.includes(ORIGINAL_HOOK_CALL)) {
    writeFileSync(check.file, source.replace(ORIGINAL_HOOK_CALL, PATCHED_HOOK_CALL), 'utf-8');
    say('         restored.');
    restoredCount += 1;
  } else if (check.fixable) {
    say('         run with --fix to restore it.');
    failures += 1;
  } else {
    say('         needs a manual edit; see AGENTS.md (Gate M patches).');
    failures += 1;
  }
}

say('');
if (failures > 0) {
  say(`Gate M cannot be trusted: ${failures} patch(es) missing.`);
  process.exit(1);
}
if (restoredCount > 0) {
  say(`Restored ${restoredCount} patch(es). Gate M should work now.`);
} else {
  say('All Gate M patches are in place.');
}
