#!/usr/bin/env bash
set -euo pipefail

# Release wrapper around release-it.
#
# DRY RUN BY DEFAULT. Releasing creates an annotated tag and a GitHub Release,
# both of which are awkward to retract, so the destructive path must be asked
# for explicitly with --execute. Running this script with no arguments is always
# safe: it reports what release-it WOULD do and changes nothing.
#
# A dry run does not execute the `after:bump` hooks (release-it skips hooks in
# dry-run mode), so a green dry run does NOT prove VERSION and AGENTS.md get
# written. That is verified by the integration test, not here.
#
# Usage:
#   scripts/release.sh                 # dry run (safe)
#   scripts/release.sh --execute       # real release: tag + GitHub Release
#   scripts/release.sh --execute 1.2.3 # real release with an explicit version
#
# The exit code of release-it is passed through unchanged, so CI or a caller can
# tell "nothing to release" from "the release failed".

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Release the repository containing the CURRENT directory rather than the one
# this script lives in. Releasing is irreversible (annotated tag + GitHub
# Release), so "which repository am I about to release?" must never be inferred
# from where a script happens to be checked out. cd-ing to the script's own
# location would silently release the wrong repository - observed in testing,
# where the pre-check passed against production while the caller expected a
# fixture.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "release: not inside a git work tree" >&2
  exit 1
}
cd "$ROOT"

DRY_RUN=1
VERSION_ARG=""

for arg in "$@"; do
  case "$arg" in
    --execute)
      DRY_RUN=0
      ;;
    --help | -h)
      sed -n '3,20p' "$0"
      exit 0
      ;;
    -*)
      echo "release: unknown flag '$arg'" >&2
      echo "release: usage: scripts/release.sh [--execute] [<version>]" >&2
      exit 1
      ;;
    *)
      if [ -n "$VERSION_ARG" ]; then
        echo "release: more than one version argument given" >&2
        exit 1
      fi
      VERSION_ARG="$arg"
      ;;
  esac
done

# Precondition: VERSION must already equal package.json's version. This catches
# the "a previous release half-updated the tree" state - exactly the failure the
# hook key bug used to produce - before it can be compounded by another release.
# It cannot detect "the hook did not write VERSION at all" (both files would
# simply agree at the old value); that is what the integration test covers.
if [ ! -f VERSION ]; then
  echo "release: no VERSION file - run scripts/release-bootstrap.sh first?" >&2
  exit 1
fi
if [ ! -f package.json ]; then
  echo "release: no package.json" >&2
  exit 1
fi

FILE_VERSION="$(LC_ALL=C tr -d '[:space:]' < VERSION)"
PKG_VERSION="$(node -p "require('./package.json').version")"

if [ "$FILE_VERSION" != "$PKG_VERSION" ]; then
  echo "release: VERSION ($FILE_VERSION) != package.json ($PKG_VERSION)" >&2
  echo "release: refusing to release from an inconsistent tree." >&2
  echo "release: reconcile them first (VERSION is written by the after:bump hook)." >&2
  exit 1
fi

ARGS=()
if [ "$DRY_RUN" -eq 1 ]; then
  ARGS+=(--dry-run)
  echo "release: DRY RUN (no tag, no GitHub Release). Pass --execute to release for real."
else
  echo "release: EXECUTING a real release from $PWD"
fi

if [ -n "$VERSION_ARG" ]; then
  ARGS+=("$VERSION_ARG")
fi

npx --no-install release-it "${ARGS[@]}"
