#!/usr/bin/env node

/**
 * Write the release version into the VERSION file.
 *
 * This is the FIRST command of the release-it `after:bump` hook (see
 * .release-it.json). It receives the authoritative version for this release as
 * an interpolated argument - `${version}` - rather than reading a file, because
 * during the bump it is the only place the new version is known. `VERSION` is
 * the sync target and the published-state marker, NOT the bump input:
 * package.json is what release-it bumps.
 *
 * Failing closed matters more than convenience here. A missing or malformed
 * argument exits non-zero WITHOUT writing, so a release aborts rather than
 * recording a bogus version that every later fan-out would faithfully propagate.
 *
 * Usage: node scripts/write-version.cjs <semver>
 */

const fs = require('node:fs');
const path = require('node:path');

/** Strict semver: MAJOR.MINOR.PATCH with an optional prerelease/build tail. */
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * The repository root. WRITE_VERSION_ROOT is an explicit override used by tests;
 * otherwise resolve the repository containing the current directory, falling
 * back to this script's parent when not inside a work tree. Writing VERSION into
 * the wrong repository would leave package.json and VERSION disagreeing - the
 * exact inconsistency the release pre-check exists to catch - so the location is
 * resolved from git, never assumed from the script's own path.
 */
const root =
  process.env['WRITE_VERSION_ROOT'] || resolveRepoRoot() || path.resolve(__dirname, '..');

function resolveRepoRoot() {
  try {
    const { execFileSync } = require('node:child_process');
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function fail(message) {
  process.stderr.write(`write-version: ${message}\n`);
  process.exit(1);
}

/** The validated version argument, or a failure exit. */
function requireVersionArg(argv) {
  const version = argv[2];
  if (version === undefined || version === '') {
    fail('missing version argument (usage: node scripts/write-version.cjs <semver>)');
  }
  if (!VERSION_PATTERN.test(version)) {
    fail(`refusing non-semver version: '${version}'`);
  }
  return version;
}

/** Remove the scratch file, ignoring a failure: it may already be renamed away. */
function removeQuietly(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // best effort
  }
}

/**
 * Write `content` to `target` via fsync + rename so no reader sees a partial file.
 *
 * `rename` is atomic within a filesystem, so a reader (or a crash) never observes a
 * truncated or empty VERSION. A plain writeFileSync truncates first, and a crash
 * between the truncate and the write would leave VERSION empty - which the release
 * post-check reads as a version mismatch and the CI job reads as a hard failure, in
 * both cases for a file nobody actually edited.
 */
function writeAtomically(target, content) {
  const temp = path.join(root, `.VERSION.tmp-${process.pid}`);
  try {
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
  } catch (error) {
    // Never leave the scratch file behind for a later glob or commit to pick up.
    removeQuietly(temp);
    fail(`could not write VERSION atomically: ${error.message}`);
  }
}

function main() {
  const version = requireVersionArg(process.argv);
  writeAtomically(path.join(root, 'VERSION'), `${version}\n`);
  process.stdout.write(`write-version: VERSION set to ${version}\n`);
}

main();
