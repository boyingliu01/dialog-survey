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
 * Usage:
 *   node scripts/scan-git-history-secrets.mjs            # report + exit 1 on leaks
 *   node scripts/scan-git-history-secrets.mjs --verbose  # show each finding
 *   node scripts/scan-git-history-secrets.mjs --help
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG = '.gitleaks.toml';

function usage() {
  process.stdout.write(
    [
      'scan-git-history-secrets: scan every commit for committed secrets',
      '',
      'Options:',
      '  --verbose   print every finding, not just the summary',
      '  --help      this message',
      '',
      `Config: ${CONFIG} (allowlist for documentation placeholders)`,
      '',
    ].join('\n')
  );
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

  return { status: result.status === 0 ? 'clean' : 'leaks', findings, raw: result.stdout ?? '' };
}

function rmQuiet(path) {
  try {
    rmSync(path, { force: true });
  } catch {
    // best effort; a stale report is not worth failing the scan over
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return 0;
  }
  const verbose = args.includes('--verbose');

  if (!existsSync(resolve(CONFIG))) {
    process.stderr.write(
      `[secrets] ${CONFIG} not found — refusing to scan without the placeholder allowlist,\n          which would flood the report with documentation examples.\n`
    );
    return 2;
  }

  const reportPath = resolve('.gitleaks-history-report.json');
  const { status, findings } = runGitleaks(reportPath);

  if (status === 'missing') {
    process.stderr.write(
      '[secrets] gitleaks is not installed — cannot scan history.\n' +
        '          Install: https://github.com/gitleaks/gitleaks#installing\n' +
        '          (CI installs it; a local run without it is a no-op by design so the\n' +
        '           guard cannot silently pass as green.)\n'
    );
    return 2;
  }

  if (status === 'clean') {
    process.stdout.write('[secrets] history is clean — no committed secrets found\n');
    return 0;
  }

  process.stderr.write(`[secrets] ${findings.length} finding(s) in git history:\n`);

  for (const finding of findings) {
    process.stderr.write(
      `  ${finding.RuleID}  ${finding.File}:${finding.StartLine}  (commit ${finding.Commit?.slice(0, 8) ?? '?'})\n`
    );
    if (verbose && typeof finding.Match === 'string') {
      process.stderr.write(`      ${finding.Match.replace(/\s+/g, ' ').slice(0, 120)}\n`);
    }
  }

  process.stderr.write(
    '\nA secret in history stays readable to anyone who can clone, even after the\n' +
      'file is deleted. Rotate the credential; rewriting history is not a fix once\n' +
      'the commits are pushed and cloned. See issue #211.\n'
  );
  return 1;
}

process.exit(main());
