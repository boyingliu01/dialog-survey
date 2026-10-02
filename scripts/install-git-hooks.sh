#!/usr/bin/env bash
set -euo pipefail

# Opt-in installer for a LOCAL commit-msg hook that enforces Conventional Commits.
#
# WHY THIS IS OPT-IN AND WHY IT WARNS LOUDLY
# ------------------------------------------
# git reads hooks from exactly ONE directory: `core.hooksPath`. On machines where
# xp-gate installed its gate chain globally (core.hooksPath=~/.config/xp-gate/hooks),
# pointing core.hooksPath at this repository's `githooks/` directory makes ALL of
# those gates stop running for this repository while the hook is installed. That is
# a real cost, which is why nothing installs this by default and why the uninstall
# path restores the previous value BYTE-EXACTLY.
#
# CI remains the enforcement point of record (see .github/workflows/pr.yml); this
# local hook is a convenience that fails fast before a push.
#
# USAGE
#   scripts/install-git-hooks.sh                 # install
#   scripts/install-git-hooks.sh --uninstall     # restore the recorded value
#   scripts/install-git-hooks.sh --uninstall --force
#
# RECORD SEMANTICS
#   The pre-install value is stored in .git/xp-gate-uninstall-record, using the
#   sentinel __UNSET__ when core.hooksPath was not set at all. A repeat install
#   NEVER overwrites an existing record (otherwise the true original value would be
#   lost). Uninstall refuses to clobber a value that no longer matches the record
#   unless --force is given; --force restores the recorded value and prints the
#   value it overwrote so nothing is discarded silently.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# NOTE: deliberately do NOT `cd` here. The repository acted on is the one
# containing the caller's current directory; chdir-ing to the script's own
# location would silently operate on the wrong repository.
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || {
  echo "install-git-hooks: not inside a git repository" >&2
  exit 1
}
TARGET_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "install-git-hooks: not inside a git work tree" >&2
  exit 1
}
# `git rev-parse --git-dir` may return a relative path; resolve it against the
# work tree root so the record file works regardless of the caller's cwd.
case "$GIT_DIR" in
  /* | [A-Za-z]:[\\/]*) ;;
  *) GIT_DIR="$TARGET_ROOT/$GIT_DIR" ;;
esac

RECORD_FILE="$GIT_DIR/xp-gate-uninstall-record"
# Persistent audit trail for destructive (--force / --reset-unset) operations.
LOG_FILE="$GIT_DIR/xp-gate-uninstall.log"
SENTINEL_UNSET="__UNSET__"
# Installed into the TARGET repository. The hook itself lives in the repository
# that owns this script when the two differ; for the normal in-repo invocation
# they are the same directory.
HOOKS_DIR="$TARGET_ROOT/githooks"
HOOK_PATH="$HOOKS_DIR/commit-msg"

MODE="install"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --reset-unset) MODE="reset-unset" ;;
    --force) FORCE=1 ;;
    --help | -h)
      echo "Usage: scripts/install-git-hooks.sh [--uninstall [--force] | --reset-unset]"
      echo ""
      echo "  (no args)      Install the local commit-msg hook (opt-in)."
      echo "  --uninstall    Restore the core.hooksPath value recorded at install."
      echo "  --force        With --uninstall: restore even if the current value diverged."
      echo "  --reset-unset  Unset the local core.hooksPath (single-purpose escape hatch)."
      exit 0
      ;;
    *)
      echo "install-git-hooks: unknown argument '$arg'" >&2
      exit 1
      ;;
  esac
done

# Read and write the LOCAL config only. git resolves core.hooksPath from the
# merged config, so a bare `git config --get` would report a machine-global value
# (e.g. ~/.config/xp-gate/hooks) that this repository never set — recording that as
# "the previous value" and later re-writing it back would silently promote a
# global setting into the repository's config. The uninstall path must remove the
# LOCAL override and let the inherited global value show through again.
current_local_hooks_path() {
  git -C "$TARGET_ROOT" config --local --get core.hooksPath 2>/dev/null || true
}

recorded_hooks_path() {
  if [ -f "$RECORD_FILE" ]; then
    # Read the whole file minus trailing newline; the sentinel is meaningful.
    printf '%s' "$(cat "$RECORD_FILE")"
  fi
}

write_record() {
  printf '%s\n' "$1" > "$RECORD_FILE"
}

install_hook() {
  # Record the pre-install LOCAL value only once. A repeat install must not
  # clobber it, or the original value would be lost forever.
  if [ ! -f "$RECORD_FILE" ]; then
    local previous
    previous="$(current_local_hooks_path)"
    if [ -z "$previous" ]; then
      write_record "$SENTINEL_UNSET"
    else
      write_record "$previous"
    fi
  fi

  mkdir -p "$HOOKS_DIR"

  cat > "$HOOK_PATH" <<'HOOK'
#!/usr/bin/env bash
# Local commit-msg hook enforcing Conventional Commits (installed by
# scripts/install-git-hooks.sh). Invokes the pinned @commitlint/cli through node
# directly rather than through a shell-resolved `commitlint`, because on Windows
# `bash` may resolve to WSL, whose PATH has no node/npx.
set -euo pipefail

# Resolve the repository being committed to, not the directory this hook lives
# in. They are normally the same, but a hook installed from elsewhere must still
# lint against the right node_modules.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi
cd "$ROOT"

CLI="node_modules/@commitlint/cli/lib/cli.js"
if [ ! -f "$CLI" ]; then
  echo "commit-msg: @commitlint/cli is not installed; run 'npm ci' first." >&2
  echo "commit-msg: skipping check (CI still enforces Conventional Commits)." >&2
  exit 0
fi

exec node "$CLI" --edit "$1"
HOOK
  chmod +x "$HOOK_PATH"

  # Point git at this repository's hooks directory. This is the step that shadows
  # any global xp-gate gate chain for this repository.
  git -C "$TARGET_ROOT" config --local core.hooksPath "$HOOKS_DIR"

  echo "install-git-hooks: installed $HOOK_PATH"
  echo ""
  echo "⚠️  WARNING: core.hooksPath now points at $HOOKS_DIR"
  echo "    While installed, this repository's GLOBAL xp-gate gate chain"
  echo "    (pre-commit / pre-push checks) no longer runs. Only the commit-msg"
  echo "    hook below is active. CI still enforces Conventional Commits."
  echo "    Restore the previous value with: scripts/install-git-hooks.sh --uninstall"
  echo ""
}

uninstall_hook() {
  if [ ! -f "$RECORD_FILE" ]; then
    echo "install-git-hooks: no install record at $RECORD_FILE — nothing to restore." >&2
    echo "install-git-hooks: refusing to guess the previous core.hooksPath value." >&2
    exit 1
  fi

  local recorded current overwrote restored
  recorded="$(recorded_hooks_path)"
  current="$(current_local_hooks_path)"
  overwrote=""

  if [ "$recorded" = "$SENTINEL_UNSET" ]; then
    restored="(unset)"
  else
    restored="$recorded"
  fi

  # A value that is neither the installed one nor the recorded original means
  # something else changed it after installation. Refuse to guess.
  if [ -n "$current" ] && [ "$current" != "$HOOKS_DIR" ] && [ "$current" != "$recorded" ]; then
    if [ "$FORCE" -ne 1 ]; then
      echo "install-git-hooks: core.hooksPath is '$current', not the value this tool set." >&2
      echo "install-git-hooks: re-run with --force to restore '$restored'." >&2
      exit 1
    fi
    overwrote="$current"
  fi

  if [ "$recorded" = "$SENTINEL_UNSET" ]; then
    git -C "$TARGET_ROOT" config --local --unset core.hooksPath 2>/dev/null || true
  else
    git -C "$TARGET_ROOT" config --local core.hooksPath "$recorded"
  fi

  # Persistent audit record of a destructive overwrite. stderr scrolls away;
  # this file does not. Only written when --force actually replaced a divergent
  # value, so it stays a record of real events rather than of every uninstall.
  if [ "$overwrote" != "" ]; then
    {
      printf '%s\tcore.hooksPath: %s -> %s\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$overwrote" "$restored"
    } >>"$LOG_FILE"
    echo "install-git-hooks: --force overwrote core.hooksPath '$overwrote'" >&2
    echo "install-git-hooks: recorded in $LOG_FILE" >&2
  fi

  rm -f "$HOOK_PATH" "$RECORD_FILE"
  # Remove the directory only if this tool left it empty.
  rmdir "$HOOKS_DIR" 2>/dev/null || true

  echo "install-git-hooks: uninstalled; core.hooksPath restored"
}

# ---------------------------------------------------------------------------
# --reset-unset: a separate, single-meaning escape hatch.
#
# It exists so that `--force` never has to carry two destructive meanings. This
# flag does exactly one thing - remove the LOCAL core.hooksPath - and therefore
# needs no record file: the machine-global value (if any) shows through again.
# ---------------------------------------------------------------------------
reset_unset() {
  local current
  current="$(current_local_hooks_path)"

  if [ -n "$current" ]; then
    {
      printf '%s\tcore.hooksPath: %s -> (unset) via --reset-unset\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$current"
    } >>"$LOG_FILE"
  fi

  git -C "$TARGET_ROOT" config --local --unset core.hooksPath 2>/dev/null || true
  rm -f "$HOOK_PATH" "$RECORD_FILE"
  rmdir "$HOOKS_DIR" 2>/dev/null || true

  echo "install-git-hooks: core.hooksPath unset (--reset-unset); recorded in $LOG_FILE"
}

case "$MODE" in
  install) install_hook ;;
  uninstall) uninstall_hook ;;
  reset-unset) reset_unset ;;
esac
