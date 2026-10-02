#!/usr/bin/env node
'use strict';

/**
 * Propagate the VERSION file (canonical source, staged by the release flow) OUT to
 * package.json-style targets and the AGENTS.md header version token.
 *
 * This is the cross-platform delivery target of the fan-out. xp-gate's pre-commit
 * Gate 0 prefers `scripts/sync-version.cjs` and falls back to `scripts/sync-version.sh`
 * only when Node is unavailable. Implementing the fan-out in Node removes the dependency
 * on a node-bearing shell PATH: on Windows the default `bash` resolves to WSL
 * (C:\WINDOWS\system32\bash.exe), whose PATH has no `node`, so the .sh dies with
 * `line 41: node: command not found` / exit 127 while this file still works.
 *
 * Usage:
 *   node scripts/sync-version.cjs                # fan the VERSION file out
 *   node scripts/sync-version.cjs --list-targets # print the existing targets only
 *
 * SYNC_VERSION_ROOT overrides the repo root so tests can run against fixtures instead of
 * the live repository.
 *
 * The .sh is frozen as a compatibility layer; both must stay behaviourally identical,
 * which tests/sync-version-parity.test.ts enforces.
 *
 * NOTE: this file must not use `console` — biome.json turns `noConsole` off only for
 * `scripts/!**!/!*.mjs`, so `scripts/!**!/!*.cjs` is subject to the error-level rule. Output goes
 * through process.stdout/stderr directly.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Canonical fan-out target order. Kept identical to the .sh listing so the two
 * implementations agree byte for byte.
 */
const PACKAGE_TARGETS = [
  'package.json',
  'src/npm-package/package.json',
  'plugins/claude-code/.claude-plugin/plugin.json',
  'plugins/opencode/package.json',
  'src/npm-package/plugins/claude-code/.claude-plugin/plugin.json',
  'src/npm-package/plugins/opencode/package.json',
];

/** The AGENTS.md header is the one non-package target in the fan-out. */
const AGENTS_TARGET = 'AGENTS.md';

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

/**
 * Anchored single-line header match: a leading blockquote metadata line (`> ...`)
 * carrying a `(vX.Y.Z)` token. Only the FIRST match is rewritten, so a
 * version-looking token in the body (e.g. `# Body (v1.0.0)`) is never touched.
 * Format must match exactly: `v` prefix + three numeric segments.
 *
 * Both header spellings seen in the wild are accepted:
 *   `> Updated: 2026-09-30 (v1.10.0). ...`  (this repository's current header)
 *   `> Generated: 2026-07-08. Commit: ... (v1.8.0). ...`  (older header form)
 * Accepting both keeps the fan-out working across the project's own header
 * history instead of silently failing closed on a header rename.
 */
const AGENTS_HEADER_PATTERN =
  /^(> (?:Updated|Generated): .*?)\(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\)/m;

const root = process.env['SYNC_VERSION_ROOT'] || path.resolve(__dirname, '..');

function fail(message) {
  process.stderr.write(`sync-version: ${message}\n`);
  process.exit(1);
}

/**
 * Report only targets that actually exist. xp-gate's pre-commit hook consumes this to learn
 * the fan-out without hardcoding a second copy of the list; paths absent from the root must
 * not be advertised, or the hook would `git add` non-existent files.
 */
function listExistingTargets() {
  const existing = [...PACKAGE_TARGETS, AGENTS_TARGET].filter((target) =>
    fs.existsSync(path.join(root, target))
  );
  if (existing.length > 0) {
    process.stdout.write(`${existing.join('\n')}\n`);
  }
}

function readVersion() {
  const versionFile = path.join(root, 'VERSION');
  if (!fs.existsSync(versionFile)) {
    fail(`VERSION file not found in ${root}`);
  }
  // Mirror the .sh's `tr -d '[:space:]'`: strip ALL whitespace, not just the trailing newline.
  const version = fs.readFileSync(versionFile, 'utf8').replace(/\s+/g, '');
  if (!VERSION_PATTERN.test(version)) {
    fail(`refusing invalid VERSION value: '${version}'`);
  }
  return version;
}

/**
 * Rewrite only the version field, preserving every other key and the formatting.
 * A wholly absent target is optional and skipped; an existing-but-unwritable one throws
 * (and therefore exits non-zero), per the design's failure semantics.
 */
function updatePackageTarget(target, version) {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) {
    return;
  }
  const contents = fs.readFileSync(full, 'utf8');
  const json = JSON.parse(contents);
  json.version = version;
  const updated = `${JSON.stringify(json, null, 2)}\n`;
  // Idempotence: a same-value rewrite must not touch mtime or bytes.
  if (updated !== contents) {
    fs.writeFileSync(full, updated);
  }
}

/**
 * Refresh the version token in the AGENTS.md blockquote header line only.
 *
 * Anchored single-line replacement: exactly one match, and the header must be present in
 * the expected format. A missing or format-mismatched header exits non-zero rather than
 * silently reporting success, so a release can never quietly leave AGENTS.md stale.
 */
function updateAgentsHeader(version) {
  const full = path.join(root, AGENTS_TARGET);
  if (!fs.existsSync(full)) {
    return;
  }
  const content = fs.readFileSync(full, 'utf8');
  if (!AGENTS_HEADER_PATTERN.test(content)) {
    fail(`no blockquote header with a (vX.Y.Z) token found in ${AGENTS_TARGET}`);
  }
  const updated = content.replace(
    AGENTS_HEADER_PATTERN,
    (_match, prefix) => `${prefix}(v${version})`
  );
  if (updated !== content) {
    fs.writeFileSync(full, updated);
  }
}

/**
 * Refuse to start unless every precondition holds. The fan-out mutates several files, so
 * validating up front keeps a failure from leaving a partially-applied release state: a
 * missing or malformed AGENTS.md header used to abort AFTER package.json had already been
 * rewritten, which is exactly the half-updated tree the design forbids.
 */
function assertPreconditionsMet() {
  const agentsFull = path.join(root, AGENTS_TARGET);
  if (!fs.existsSync(agentsFull)) {
    return; // AGENTS.md is an optional target.
  }
  const content = fs.readFileSync(agentsFull, 'utf8');
  if (!AGENTS_HEADER_PATTERN.test(content)) {
    fail(`no blockquote header with a (vX.Y.Z) token found in ${AGENTS_TARGET}`);
  }
}

function main() {
  // Pure query mode for the pre-commit hook: no validation, no writes. Mirrors the .sh,
  // which only inspects the first argument.
  if (process.argv[2] === '--list-targets') {
    listExistingTargets();
    return;
  }

  const version = readVersion();
  assertPreconditionsMet();

  for (const target of PACKAGE_TARGETS) {
    updatePackageTarget(target, version);
  }
  updateAgentsHeader(version);

  process.stdout.write(
    `sync-version: package.json targets and AGENTS.md header set to ${version}\n`
  );
}

main();
