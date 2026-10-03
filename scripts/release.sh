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

# Capture the tag set and HEAD before the release so the post-check can identify
# what actually changed without guessing.
TAGS_BEFORE="$(git tag -l | LC_ALL=C sort)"

npx --no-install release-it "${ARGS[@]}"
RELEASE_EXIT=$?
if [ "$RELEASE_EXIT" -ne 0 ]; then
  exit "$RELEASE_EXIT"
fi

# A dry run changes nothing, so there is nothing to verify.
if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

# --- Post-release verification -------------------------------------------------
# The pre-check above cannot detect that the release itself misbehaved: it runs
# before, and it only proves VERSION and package.json agreed at that moment. If
# the after:bump hook silently fails to run - which is exactly what a wrong hook
# key produces - release-it still exits 0, still commits and still tags, leaving
# VERSION and AGENTS.md stale in the released tree.
#
# xp-gate's Gate 0 cannot be relied on for this either: measured, it PASSES a
# staged VERSION that contradicts package.json (exit 0, commit lands). So this
# check is the backstop, and it fails loudly rather than letting a corrupt
# release stand.
echo "release: verifying the release..."

POST_FAIL=0
POST_NEW_TAG="$(git tag -l | LC_ALL=C sort | comm -13 <(printf '%s\n' "$TAGS_BEFORE") - | tail -n 1)"

fail_post() {
  echo "release: POST-RELEASE CHECK FAILED: $1" >&2
  POST_FAIL=1
}

# 1. Three-way version equality.
POST_VERSION="$(LC_ALL=C tr -d '[:space:]' < VERSION)"
POST_PKG="$(node -p "require('./package.json').version")"
POST_AGENTS="$(LC_ALL=C grep -oE '\(v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?\)' AGENTS.md | head -n 1 | tr -d '()')"

if [ "$POST_VERSION" != "$POST_PKG" ]; then
  fail_post "VERSION ($POST_VERSION) != package.json ($POST_PKG)"
fi
if [ -n "$POST_AGENTS" ] && [ "$POST_AGENTS" != "$POST_VERSION" ]; then
  fail_post "AGENTS.md ($POST_AGENTS) != VERSION ($POST_VERSION)"
fi
if [ "$POST_AGENTS" != "v$POST_VERSION" ]; then
  fail_post "AGENTS.md does not carry the released version (expected v$POST_VERSION, found '${POST_AGENTS:-none}')"
fi

# 2. The release commit must carry the version records, not just the manifest.
#    A silently-dead hook yields a commit without VERSION or AGENTS.md.
RELEASE_FILES="$(git show --name-only --format= HEAD | LC_ALL=C sort | tr '\n' ' ')"
for expected in VERSION AGENTS.md package.json; do
  case " $RELEASE_FILES " in
    *" $expected "*) ;;
    *) fail_post "release commit is missing $expected (found: ${RELEASE_FILES:-none})" ;;
  esac
done

# 3. The working tree must be clean, so the tag matches what is on disk.
if [ -n "$(git status --porcelain)" ]; then
  fail_post "working tree is dirty after the release"
fi

# 4. A new tag must exist and carry the v prefix.
if [ -z "$POST_NEW_TAG" ]; then
  fail_post "no new tag was created"
elif [ "${POST_NEW_TAG#v}" = "$POST_NEW_TAG" ]; then
  fail_post "tag '$POST_NEW_TAG' is missing the 'v' prefix"
fi

if [ "$POST_FAIL" -ne 0 ]; then
  cat >&2 <<'ROLLBACK'

release: a release was published but the post-release checks failed, which means
release: the released tree may be inconsistent (for example VERSION or AGENTS.md
release: left stale by a hook that did not run).
release:
release: Roll back before re-releasing:
release:   1. Delete the tag locally and on the remote:
release:        git tag -d <tag> && git push origin :refs/tags/<tag>
release:   2. Revert the release commit:
release:        git revert --no-edit HEAD && git push
release:   3. Delete or re-cut the GitHub Release for that tag.
release:   4. Fix the cause, then re-run scripts/release.sh --execute.
release:
release: See docs/contributing.md for the full rollback procedure.
ROLLBACK
  exit 1
fi

echo "release: post-release checks passed (VERSION = package.json = AGENTS.md = $POST_VERSION, tag $POST_NEW_TAG)."
