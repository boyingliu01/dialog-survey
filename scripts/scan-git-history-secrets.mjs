#!/usr/bin/env node
/**
 * Scan the whole git history for committed secrets (issue #211).
 *
 * Why this exists: the `gitleaks/gitleaks-action` step in pr.yml scans the pull
 * request's diff. A secret that entered the repository before the base branch's
 * tip is invisible to it, so Gate 8 reported PASS on every run while two live
 * provider keys sat in `benchmark_llm.py` from the first commit onward. The file
 * was later deleted; deleting a file does not un-publish its contents, because
 * anyone who can clone can read any historical blob.
 *
 * This runs `gitleaks git` across all commits instead. It is not part of the
 * pre-push hook: a full-history scan takes long enough that adding it to every
 * push would train everyone to bypass it. CI and a manual run are the right
 * cadence.
 *
 * Ground truth vs. baseline: eleven findings are already in history and cannot be
 * removed — the commits are pushed and cloned. The CI step used to be
 * `continue-on-error: true` so those would not turn it permanently red, which
 * meant a genuinely NEW leak also never failed the build. Instead,
 * `.secrets-history-baseline.json` names each known finding by fingerprint;
 * anything not on that list is new and exits 1.
 *
 * A baseline is only safe if it cannot quietly swallow a new leak, so three
 * properties are enforced: an entry that matches nothing is a failure (the
 * baseline cannot rot into a blanket exemption), a finding is matched on
 * rule+file+line rather than file alone (a new secret on another line of the same
 * historical file still fails), and the secret text is never stored.
 *
 * Usage:
 *   node scripts/scan-git-history-secrets.mjs                   # exit 1 on NEW leaks
 *   node scripts/scan-git-history-secrets.mjs --verbose         # show every finding
 *   node scripts/scan-git-history-secrets.mjs --write-baseline  # rewrite baseline
 *   node scripts/scan-git-history-secrets.mjs --help
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG = '.gitleaks.toml';
const BASELINE = '.secrets-history-baseline.json';
const REPORT = '.gitleaks-history-report.json';

function usage() {
  process.stdout.write(
    [
      'scan-git-history-secrets: scan every commit for committed secrets',
      '',
      'Exit codes:',
      '  0  no finding outside the accepted baseline',
      '  1  a NEW secret is in history (or the baseline no longer matches)',
      '  2  cannot scan (gitleaks missing, config missing) — never a pass',
      '',
      'Options:',
      '  --verbose         print every finding, not just the summary',
      '  --write-baseline  rewrite the accepted baseline from the current history',
      '                    (only after reviewing each finding by hand)',
      '  --help            this message',
      '',
      `Config:   ${CONFIG} (allowlist for documentation placeholders)`,
      `Baseline: ${BASELINE} (accepted historical findings)`,
      '',
    ].join('\n')
  );
}

/**
 * A finding's identity for baseline matching.
 *
 * Every component is frozen inside a historical commit, so the digest is the
 * same in every clone and survives the file being deleted from the working tree.
 * The secret text is intentionally excluded: the baseline must never become a
 * second copy of what it acknowledges.
 */
function fingerprint(finding) {
  return createHash('sha256')
    .update([finding.RuleID, finding.File, finding.StartLine].join('\u0000'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Run gitleaks and return { status, findings, raw }.
 *
 * `GITLEAKS_BIN` overrides the executable so the tests can exercise the
 * missing-tool path without uninstalling anything.
 */
function runGitleaks(reportPath) {
  const bin = process.env['GITLEAKS_BIN'] || 'gitleaks';
  const result = spawnSync(
    bin,
    ['git', '--no-banner', '--redact', '-f', 'json', '-r', reportPath],
    { encoding: 'utf8', shell: process.platform === 'win32' }
  );

  // Two failure shapes reach here. Without a shell, a missing binary sets
  // `error`. With `shell: true` (Windows) the shell itself reports the miss on
  // stdout with status 127 and no `error`, so both are checked — otherwise a
  // run without gitleaks installed fell through and was classified as leaks.
  const shellSaysMissing =
    /not recognized|command not found|No such file or directory/i.test(
      `${result.stdout ?? ''}${result.stderr ?? ''}`
    ) || result.status === 127;

  if (result.error || shellSaysMissing) {
    return {
      status: 'missing',
      findings: [],
      raw: result.error?.message ?? result.stdout ?? '',
    };
  }

  let findings = [];
  if (existsSync(reportPath)) {
    try {
      findings = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
      findings = [];
    }
    rmQuiet(reportPath);
  }

  return {
    status: result.status === 0 ? 'clean' : 'leaks',
    findings: Array.isArray(findings) ? findings : [],
    raw: result.stdout ?? '',
  };
}

function rmQuiet(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // best effort; a stale report is not worth failing the scan over
  }
}

/** Read the accepted baseline; a missing file means "nothing is accepted". */
function readBaseline() {
  if (!existsSync(resolve(BASELINE))) {
    return { accepted: [], exists: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(resolve(BASELINE), 'utf8'));
    const accepted = Array.isArray(parsed?.accepted) ? parsed.accepted : [];
    return { accepted, exists: true };
  } catch (error) {
    process.stderr.write(
      `[secrets] ${BASELINE} is not valid JSON (${error.message}) — refusing to guess\n`
    );
    return { accepted: [], exists: true, invalid: true };
  }
}

/**
 * Count the commits the scan actually had to work with.
 *
 * `gitleaks git` on a directory that is not a repository scans nothing and exits
 * 0 — reporting "history is clean" for a history it never read. A clean verdict
 * from a scan that covered zero commits is the exact failure mode this guard
 * exists to prevent, so it is checked rather than assumed.
 */
function countCommits() {
  const result = spawnSync('git', ['rev-list', '--all', '--count'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const count = Number.parseInt(String(result.stdout ?? '').trim(), 10);
  return Number.isFinite(count) ? count : 0;
}

function describe(finding) {
  const commit = finding.Commit?.slice(0, 8) ?? '?';
  return `  ${finding.RuleID}  ${finding.File}:${finding.StartLine}  (commit ${commit})`;
}

function printMatch(finding) {
  if (typeof finding.Match === 'string') {
    process.stdout.write(`      ${finding.Match.replace(/\s+/g, ' ').slice(0, 120)}\n`);
  }
}

/** Rewrite the baseline from the current history, preserving known reasons. */
function writeBaseline(findings) {
  const previous = readBaseline();
  const reasons = new Map(previous.accepted.map((entry) => [entry.id, entry.reason]));
  const existingComment = previous.exists
    ? JSON.parse(readFileSync(resolve(BASELINE), 'utf8')).comment
    : undefined;

  const accepted = findings.map((finding) => {
    const id = fingerprint(finding);
    const entry = {
      id,
      rule: finding.RuleID,
      file: finding.File,
      line: finding.StartLine,
      reason: reasons.get(id) ?? 'NOT REVIEWED — describe why this finding is acceptable',
    };
    return entry;
  });

  const document = {
    comment: existingComment ?? [
      'Generated by scripts/scan-git-history-secrets.mjs --write-baseline.',
      'Fingerprint = sha256(rule + NUL + file + NUL + startLine), first 16 hex chars.',
      'Never store the secret text here.',
    ],
    accepted,
  };

  writeFileSync(resolve(BASELINE), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `[secrets] wrote ${accepted.length} accepted finding(s) to ${BASELINE}
[secrets] entries marked NOT REVIEWED still need a reason — edit the file.
`
  );
}

/** Report findings that are already accounted for in the baseline. */
function reportKnown(known, verbose) {
  if (known.length === 0) {
    return;
  }
  process.stdout.write(
    `[secrets] ${known.length} accepted historical finding(s) in ${BASELINE}:\n`
  );
  for (const finding of known) {
    process.stdout.write(`${describe(finding)}\n`);
    if (verbose) {
      printMatch(finding);
    }
  }
}

/** Report baseline entries that no longer match anything in history. */
function reportStale(stale) {
  if (stale.length === 0) {
    return;
  }
  process.stderr.write(
    `\n[secrets] ${stale.length} baseline entr(ies) match nothing in the current history:\n`
  );
  for (const entry of stale) {
    process.stderr.write(`  ${entry.id}  ${entry.rule}  ${entry.file}:${entry.line}\n`);
  }
  process.stderr.write(
    '\nThis means the history this baseline describes has changed. Either it was\n' +
      'rewritten (regenerate with --write-baseline after re-reviewing every finding)\n' +
      'or the baseline was hand-edited without a scan. A baseline entry that matches\n' +
      'nothing must never be treated as "fixed".\n'
  );
}

/** Report findings that are not in the baseline — the actual gate. */
function reportFresh(fresh, verbose) {
  if (fresh.length === 0) {
    return;
  }
  process.stderr.write(`\n[secrets] ${fresh.length} NEW finding(s) not in ${BASELINE}:\n`);
  for (const finding of fresh) {
    process.stderr.write(`${describe(finding)}\n`);
    if (verbose) {
      printMatch(finding);
    }
  }
  process.stderr.write(
    `
Revoke the credential first — that is the only thing that ends the exposure,
because this repository is public and may already be cloned. Then decide
whether to rewrite history. Do NOT add it to ${BASELINE} without reading the
matched text: a baseline entry that silences a real leak is worse than no
baseline at all. See issue #211.
`
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return 0;
  }
  const verbose = args.includes('--verbose');
  const writeBaselineMode = args.includes('--write-baseline');

  if (!existsSync(resolve(CONFIG))) {
    process.stderr.write(
      `[secrets] ${CONFIG} not found — refusing to scan without the placeholder allowlist,\n          which would flood the report with documentation examples.\n`
    );
    return 2;
  }

  const { status, findings } = runGitleaks(resolve(REPORT));

  if (status === 'missing') {
    process.stderr.write(
      '[secrets] gitleaks is not installed — cannot scan history.\n' +
        '          Install: https://github.com/gitleaks/gitleaks#installing\n' +
        '          (CI installs it; a local run without it is a no-op by design so the\n' +
        '           guard cannot silently pass as green.)\n'
    );
    return 2;
  }

  // A scan that covered no commits says nothing about history. This is not
  // hypothetical: `gitleaks git` in a directory that is not a repository exits 0
  // with an empty report, so without this check the guard would report "clean"
  // for a tree it never read — the same class of mistake as a "clean" from a
  // missing gitleaks binary.
  const commits = countCommits();
  if (commits === 0) {
    process.stderr.write(
      '[secrets] no commits found — this is not a git repository, so history was\n' +
        '          never scanned. Refusing to report a clean history that does not exist.\n'
    );
    return 2;
  }

  if (writeBaselineMode) {
    writeBaseline(findings);
    return 0;
  }

  if (findings.length === 0) {
    process.stdout.write('[secrets] history is clean — no committed secrets found\n');
    return 0;
  }

  const { accepted, invalid } = readBaseline();
  if (invalid) {
    return 2;
  }

  const acceptedIds = new Set(accepted.map((entry) => entry.id));
  const known = findings.filter((finding) => acceptedIds.has(fingerprint(finding)));
  const fresh = findings.filter((finding) => !acceptedIds.has(fingerprint(finding)));
  const matchedIds = new Set(known.map((finding) => fingerprint(finding)));
  const stale = accepted.filter((entry) => !matchedIds.has(entry.id));

  reportKnown(known, verbose);

  if (fresh.length === 0 && stale.length === 0) {
    process.stdout.write(
      `[secrets] no NEW secrets in history — ${known.length} accepted finding(s), all accounted for\n`
    );
    return 0;
  }

  reportStale(stale);
  reportFresh(fresh, verbose);
  return 1;
}

process.exit(main());
