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
const { spawnSync } = require('node:child_process');
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
const PRE_COMMIT = join(XPGATE, 'hooks', 'pre-commit');

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

/**
 * Above this line is Gate M. Below it is the check that FAILED first and worst:
 * on 2026-10-24 an xp-gate self-update rewrote `hooks/pre-commit` and introduced
 * a stray backtick (`echo "... $new_file — ..."`). Bash read the closing
 * backtick as the start of a command substitution and the rest of the file
 * stopped parsing, so every gate after Gate 5 silently did not run and the
 * commit was let through. Nothing in the checks above could see it, because they
 * all inspect the mutation runner and `pre-push`.
 *
 * `bash -n` is the cheapest defence there is and needs no gate to be running.
 * It is reported separately from the Gate M verdict, because a syntax error is
 * fatal to *all* gates while a missing patch is fatal only to Gate M.
 *
 * Exit code stays 1 for either, so `npm run check:gates` fails on both.
 */
/**
 * Translate a Windows path to the form the `bash` we are about to invoke
 * understands.
 *
 * On this machine `bash` is WSL, which cannot open `C:\Users\...` — it reads the
 * backslashes as escapes and reports "No such file or directory", which is
 * indistinguishable from a genuine failure unless it is translated.
 *
 * `wslpath` lives inside the WSL distribution and is not reachable as a Windows
 * executable (spawning it directly is ENOENT), so the translation runs *through*
 * bash. On a plain Linux/macOS bash the driver is already POSIX and comes back
 * unchanged, and `wslpath` is absent — both cases are handled by the fallback.
 */
function toPosixPath(winPath) {
  if (process.platform !== 'win32') return winPath;
  const result = spawnSync('wsl', ['-e', 'wslpath', '-u', winPath], { encoding: 'utf-8' });
  if (result.error || result.status !== 0) return winPath;
  return (result.stdout || '').trim() || winPath;
}

/**
 * Syntactic validity of both hooks.
 *
 * Also tries `git bash` as a fallback driver when `wsl` is unavailable, so the
 * check still works on a Windows box using Git-for-Windows bash.
 */
function bashBinary() {
  for (const candidate of [
    ['wsl', ['-e', 'bash']],
    ['bash', []],
  ]) {
    const probe = spawnSync(candidate[0], [...candidate[1], '-n', '-c', 'true'], {
      encoding: 'utf-8',
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function checkHookSyntax() {
  const bash = bashBinary();
  if (bash === null) {
    say('SYNTAX?? no bash found — cannot verify that the xp-gate hooks parse');
    return 0;
  }
  let broken = 0;
  for (const [hook, path] of [
    ['pre-commit', PRE_COMMIT],
    ['pre-push', HOOK],
  ]) {
    if (readOrNull(path) === null) {
      say(`SYNTAX?? ${hook} not found — is xp-gate installed?`);
      continue;
    }
    const result = spawnSync(bash[0], [...bash[1], '-n', toPosixPath(path)], {
      encoding: 'utf-8',
    });
    if (result.status === 0) {
      say(`OK       ${hook} parses`);
      continue;
    }
    broken += 1;
    say(`SYNTAX   ${hook} has a syntax error — every gate after the failure point will NOT run`);
    const detail = (result.stderr || '').trim().split('\n').slice(0, 3);
    for (const line of detail) say(`         ${line}`);
    say(`         inspect with: bash -n "${toPosixPath(path)}"`);
  }
  return broken;
}

say('');
say('-- hook parseability (xp-gate issue: stray backtick killed pre-commit) --');
const syntaxFailures = checkHookSyntax();
if (syntaxFailures > 0) {
  say('');
  say(
    `xp-gate hooks are unparseable (${syntaxFailures}). Fix the hook before trusting ANY gate result.`
  );
  process.exit(1);
}
