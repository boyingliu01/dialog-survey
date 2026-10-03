#!/usr/bin/env bash
set -euo pipefail

# Release bootstrap: create the baseline annotated tag that release-it needs.
#
# WHY THIS EXISTS
# ---------------
# release-it infers the next version from existing tags. On a repository with no
# tags it has nothing to work from, and `tagName` degrades to a bare version with
# no "v" prefix (measured). So the baseline tag must be created deliberately,
# once, before the first real release.
#
# WHY RE-RUNNING IS SAFE
# ----------------------
# This script may be run by someone who is unsure whether bootstrap already
# happened. Re-running it must therefore never rewrite release history. The
# recorded SHA in .git/xp-gate-bootstrap-sha is what it compares against - NOT
# the current HEAD, which legitimately moves as work continues.
#
#   | tag exists | recorded SHA | relationship        | action                  |
#   |------------|--------------|---------------------|-------------------------|
#   | no         | -            | -                   | create, record SHA      |
#   | yes        | matches tag  | -                   | warn, exit 0            |
#   | yes        | differs      | -                   | ERROR, non-zero         |
#   | yes        | missing      | tag is an ancestor  | warn, backfill, exit 0  |
#   | yes        | missing      | tag is NOT ancestor | ERROR, non-zero         |
#
# The ancestor check distinguishes a normal fresh clone (the record file is
# gitignored, so every clone starts without it) from genuine drift. It is a
# heuristic, not a proof of integrity: a tag moved onto a commit that is still an
# ancestor of HEAD will be treated as a fresh clone.
#
# Usage: scripts/release-bootstrap.sh [<version>]
#   Defaults to the version in package.json.

SHA_FILE_NAME="xp-gate-bootstrap-sha"

# Operate on the repository containing the CURRENT directory, never the one this
# script happens to live in - re-pointing a tag in the wrong repository would
# corrupt its release history.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "release-bootstrap: not inside a git work tree" >&2
  exit 1
}
cd "$ROOT"

GIT_DIR="$(git rev-parse --git-dir)"
case "$GIT_DIR" in
  /* | [A-Za-z]:[\\/]*) ;;
  *) GIT_DIR="$ROOT/$GIT_DIR" ;;
esac
SHA_FILE="$GIT_DIR/$SHA_FILE_NAME"

if [ ! -f package.json ]; then
  echo "release-bootstrap: no package.json in $ROOT" >&2
  exit 1
fi

if [ "${1:-}" != "" ]; then
  VERSION="$1"
else
  VERSION="$(node -p "require('./package.json').version")"
fi

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "release-bootstrap: refusing invalid version: '$VERSION'" >&2
  exit 1
fi

TAG="v$VERSION"

# --- branch 1: no tag yet -------------------------------------------------
if ! git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null; then
  git tag -a "$TAG" -m "Release $TAG"
  TAG_SHA="$(git rev-list -n 1 "$TAG")"
  printf '%s\n' "$TAG_SHA" >"$SHA_FILE"
  echo "release-bootstrap: created annotated tag $TAG at $TAG_SHA"
  echo "release-bootstrap: recorded SHA in $SHA_FILE"
  exit 0
fi

TAG_SHA="$(git rev-list -n 1 "$TAG")"

# --- branches 2 and 3: a record exists ------------------------------------
if [ -f "$SHA_FILE" ]; then
  RECORDED="$(tr -d '[:space:]' <"$SHA_FILE")"
  if [ "$RECORDED" = "$TAG_SHA" ]; then
    echo "release-bootstrap: $TAG already exists at the recorded SHA ($TAG_SHA); nothing to do."
    exit 0
  fi
  echo "release-bootstrap: $TAG does not match the recorded SHA." >&2
  echo "release-bootstrap:   recorded: $RECORDED" >&2
  echo "release-bootstrap:   actual  : $TAG_SHA" >&2
  echo "release-bootstrap: refusing to move an existing tag. Investigate the drift;" >&2
  echo "release-bootstrap: re-pointing a released tag rewrites release history." >&2
  exit 1
fi

# --- branch 4: tag exists but the record is missing ------------------------
# The record file is gitignored, so a fresh clone legitimately starts without it.
# Ancestry separates that from a tag that has drifted off the current line.
if git merge-base --is-ancestor "$TAG_SHA" HEAD 2>/dev/null; then
  printf '%s\n' "$TAG_SHA" >"$SHA_FILE"
  echo "release-bootstrap: $TAG exists at $TAG_SHA (ancestor of HEAD) but no record was found."
  echo "release-bootstrap: treating this as a fresh clone; recorded SHA in $SHA_FILE"
  exit 0
fi

echo "release-bootstrap: $TAG exists at $TAG_SHA, which is NOT an ancestor of HEAD," >&2
echo "release-bootstrap: and no record file was found at $SHA_FILE." >&2
echo "release-bootstrap: this looks like real drift rather than a fresh clone." >&2
echo "release-bootstrap: refusing to proceed; investigate before re-running." >&2
exit 1
