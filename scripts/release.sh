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

# --- Post-release verification -------------------------------------------------
# The pre-check cannot detect that the release itself misbehaved: it runs before,
# and it only proves VERSION and package.json agreed at that moment. If the
# after:bump hook silently fails to run - which is exactly what a wrong hook key
# produces - release-it still exits 0, still commits and still tags, leaving
# VERSION and AGENTS.md stale in the released tree. xp-gate's Gate 0 cannot be
# relied on for this either: measured, it PASSES a staged VERSION that contradicts
# package.json (exit 0, commit lands). So this check is the backstop, and it fails
# loudly rather than letting a corrupt release stand.
#
# The whole block is a callable function so a test can genuinely EXERCISE it by
# running `RELEASE_VERIFY_ONLY=1 scripts/release.sh [tags_before]`, rather than
# only asserting that its source contains certain strings. That matters: the header
# grep's `|| true` is a load-bearing guard whose branch is unreachable without it,
# and a source assertion cannot see whether the branch is actually reached.
run_post_release_check() {
  POST_FAIL=0

  # Identify the tag this release created. This must not use `comm`: comm exits
  # non-zero when either input is not in sorted order, and under
  # `set -euo pipefail` that non-zero status inside a command substitution ABORTS
  # the script - measured, exit 1 with no rollback guidance printed. Instead, take
  # the most recently created tag and confirm it was not already present before.
  POST_NEW_TAG="$(git tag -l --sort=-creatordate | head -n 1)"
  if [ -n "$POST_NEW_TAG" ]; then
    case "$(printf '%s\n' "$TAGS_BEFORE" | grep -Fx -- "$POST_NEW_TAG" || true)" in
      "") ;; # not present before => this release created it
      *)
        POST_NEW_TAG=""
        ;;
    esac
  fi

  fail_post() {
    echo "release: POST-RELEASE CHECK FAILED: $1" >&2
    POST_FAIL=1
  }

  # 1. Three-way version equality. POST_AGENTS keeps the leading 'v' (the header
  #    form is "(v1.2.3)"), so it is compared against "v$POST_VERSION" - an earlier
  #    form compared it against the bare version and failed every correct release.
  POST_VERSION="$(LC_ALL=C tr -d '[:space:]' < VERSION)"
  POST_PKG="$(node -p "require('./package.json').version")"
  # `|| true` is load-bearing, NOT defensive padding. grep exits 1 when it matches
  # nothing, and under `set -euo pipefail` that status propagates through the
  # pipeline and ABORTS the shell on the assignment - so the `-z` branch just below
  # would be unreachable. Measured: without `|| true` a header-less AGENTS.md exits
  # 1 having printed NO message, after the commit and tag already exist.
  POST_AGENTS="$(LC_ALL=C grep -oE '\(v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?\)' AGENTS.md 2>/dev/null | head -n 1 | tr -d '()' || true)"

  if [ "$POST_VERSION" != "$POST_PKG" ]; then
    fail_post "VERSION ($POST_VERSION) != package.json ($POST_PKG)"
  fi
  if [ -z "$POST_AGENTS" ]; then
    fail_post "AGENTS.md carries no (vX.Y.Z) header version"
  elif [ "$POST_AGENTS" != "v$POST_VERSION" ]; then
    fail_post "AGENTS.md ($POST_AGENTS) != VERSION (v$POST_VERSION)"
  fi

  # 2. There must BE a release commit, and it must carry the version records.
  #    Verify the commit explicitly rather than assuming HEAD moved: a release whose
  #    commit step was skipped would otherwise have `git show HEAD` describe the
  #    PREVIOUS commit, and the file check below would pass or fail for reasons that
  #    have nothing to do with this release.
  HEAD_AFTER="$(git rev-parse HEAD)"
  if [ "$HEAD_AFTER" = "$HEAD_BEFORE" ]; then
    fail_post "no release commit was created (HEAD is unchanged at $HEAD_AFTER)"
  fi

  #    A silently-dead hook yields a commit without VERSION or AGENTS.md. The
  #    changelog plugin's omission is equally invisible, so CHANGELOG.md is included.
  RELEASE_FILES="$(git show --name-only --format= "$HEAD_AFTER" | LC_ALL=C sort | tr '\n' ' ')"
  for expected in VERSION AGENTS.md package.json CHANGELOG.md; do
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
    return 1
  fi

  echo "release: post-release checks passed (VERSION = package.json = AGENTS.md = $POST_VERSION, tag $POST_NEW_TAG)."
}

# RELEASE_VERIFY_ONLY=1 is a test-only entry point. It does not release anything:
# it runs the post-release checks so a test can EXERCISE that exact code rather than
# asserting that the source contains certain strings. It must run BEFORE any
# release-it interaction (which would otherwise try to reach npm). The first
# argument, when present, overrides TAGS_BEFORE so the tag-set logic can be driven.
if [ "${RELEASE_VERIFY_ONLY:-0}" = "1" ]; then
  TAGS_BEFORE="${1:-$(git tag -l | LC_ALL=C sort)}"
  HEAD_BEFORE="$(git rev-parse HEAD)"
  run_post_release_check
  exit $?
fi

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

# Pre-flight: an absent GITHUB_TOKEN makes release-it skip the GitHub Release and
# still exit 0. Measured: with github.release=true and no token, release-it prints
# a warning, falls back to a web URL, completes the commit and tag, and returns 0.
# An unattended run therefore "succeeds" while silently omitting a configured
# artifact. Fail fast when that is about to happen instead of reporting success;
# RELEASE_ALLOW_NO_GITHUB_TOKEN=1 is the explicit override for someone who really
# does want a tag-only release.
if [ "$DRY_RUN" -eq 0 ]; then
  GITHUB_RELEASE_ENABLED="$(node -p "String(require('./.release-it.json').github?.release ?? true)")"
  if [ "$GITHUB_RELEASE_ENABLED" = "true" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
    if [ "${RELEASE_ALLOW_NO_GITHUB_TOKEN:-}" = "1" ]; then
      echo "release: WARNING GITHUB_TOKEN is unset; continuing because RELEASE_ALLOW_NO_GITHUB_TOKEN=1." >&2
      echo "release: no GitHub Release will be created for this tag." >&2
    else
      echo "release: GITHUB_TOKEN is not set but .release-it.json has github.release=true." >&2
      echo "release: release-it would skip the GitHub Release and still exit 0, so this" >&2
      echo "release: run would report success while silently omitting it." >&2
      echo "release: set GITHUB_TOKEN, or pass RELEASE_ALLOW_NO_GITHUB_TOKEN=1 to release a tag only." >&2
      exit 1
    fi
  fi
fi

# Pre-flight: the release commit must not run an unrelated global hook chain.
# A developer-global core.hooksPath puts the xp-gate 12-gate chain in the path of
# the release commit. That chain is slow, and measured it hard-blocks a repository
# without an architecture.yaml (Gate 6), aborting the release AFTER the after:bump
# hooks have already rewritten VERSION and AGENTS.md - leaving the tree dirty and
# the release half-applied.
#
# The override must not PERSIST. Writing `core.hooksPath=""` into the local config
# and leaving it there would silently disable the gate chain for every later commit
# in this clone and deactivate any hook installed by install-git-hooks.sh - the
# exact hazard that installer guards with a record file. An EXIT trap would still
# leave the window open on SIGKILL.
#
# Instead the override is scoped to this process tree via git's GIT_CONFIG_COUNT
# environment mechanism, which release-it's own `git commit` inherits. Nothing is
# written to any config file, so there is no state to restore: no local value needs
# to be captured, and nothing needs unwinding on a crash or a SIGKILL.
EFFECTIVE_HOOKS_PATH="$(git config --get core.hooksPath 2>/dev/null || true)"

# NOTE: `git rev-parse --git-path hooks` HONOURS core.hooksPath, so it returns the
# configured path rather than the default hooks directory. Comparing the effective
# value against it is therefore always equal and the override below would never
# run - measured, and it is why the first version of this guard silently did
# nothing. The default hooks directory is derived from the git dir instead, with
# core.hooksPath suppressed for that one query.
DEFAULT_HOOKS_PATH="$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0= \
  git rev-parse --git-path hooks 2>/dev/null || true)"

if [ -n "$EFFECTIVE_HOOKS_PATH" ] && [ "$EFFECTIVE_HOOKS_PATH" != "$DEFAULT_HOOKS_PATH" ]; then
  echo "release: core.hooksPath resolves to '$EFFECTIVE_HOOKS_PATH'; suppressing it for the"
  echo "release: duration of this release so the release commit does not run an unrelated"
  echo "release: hook chain. No config file is modified; this is process-scoped."
  GIT_CONFIG_COUNT=1
  GIT_CONFIG_KEY_0=core.hooksPath
  GIT_CONFIG_VALUE_0=
  export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
fi

ARGS=()
if [ "$DRY_RUN" -eq 1 ]; then
  ARGS+=(--dry-run)
  echo "release: DRY RUN (no tag, no GitHub Release). Pass --execute to release for real."
else
  echo "release: EXECUTING a real release from $PWD"
fi

# --ci makes release-it non-interactive. Without it the "Commit (chore(release):
# vX.Y.Z)?" prompt waits for input that a scripted or unattended run cannot
# provide; measured, it then aborts with "User force closed the prompt" AFTER the
# after:bump hooks have already rewritten VERSION and AGENTS.md, leaving the tree
# modified and the release half-applied. The version files are written by the
# hooks, so that state needs manual reconciliation. Always pass it.
ARGS+=(--ci)

if [ -n "$VERSION_ARG" ]; then
  ARGS+=("$VERSION_ARG")
fi

# Capture the tag set and HEAD before the release so the post-check can identify
# what actually changed without guessing. HEAD_BEFORE is load-bearing: without it
# the post-check cannot tell "the release commit" from "whatever HEAD happens to
# be", so a release whose commit step was skipped would inspect the PREVIOUS commit
# and pass or fail for the wrong reason.
TAGS_BEFORE="$(git tag -l | LC_ALL=C sort)"
HEAD_BEFORE="$(git rev-parse HEAD)"

# `set -e` already aborts the script if release-it exits non-zero, so there is
# deliberately no `RELEASE_EXIT=$?` here: under `set -e` that line is unreachable
# (release-it's failure exits the shell first) and it read like real error handling
# while doing nothing. If release-it fails, the EXIT trap and shell handle it, and
# the operator sees release-it's own diagnostics plus its non-zero status.
npx --no-install release-it "${ARGS[@]}"

# A dry run changes nothing, so there is nothing to verify.
if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

# The execute path: run the post-release verification defined near the top. It
# verifies the release actually produced a consistent tree rather than just
# trusting release-it's own success.
echo "release: verifying the release..."
run_post_release_check
exit 0
