#!/bin/bash
# Run the xp-gate hooks natively on Windows, with no WSL involvement.
#
# Why this exists
# ---------------
# `core.hooksPath` points at C:/Users/think/.config/xp-gate/hooks and the hooks
# start with `#!/bin/bash`. On this machine `bash` on PATH resolves to
# C:\WINDOWS\system32\bash.exe — the *WSL launcher*, not Git Bash — so a plain
# `git commit` from Windows silently runs the gate suite inside WSL. That is the
# whole reason scripts/run-xp-gate.sh exists and needs mount-translating node
# shims, .exe shims and a Windows HOME: it was patching up a cross-environment
# jump that nothing asked for.
#
# Every tool the gates need is already installed on the Windows side:
#
#   node / npx        C:\Program Files\nodejs
#   git               C:\Program Files\Git
#   gitleaks          C:\Users\think\scoop\shims
#   lizard            C:\Users\think\.local\bin\lizard.exe
#   semgrep           C:\Users\think\bin\semgrep.exe
#   detect-secrets    %APPDATA%\Python\Python312\Scripts\detect-secrets-hook.exe
#
# Run the hooks through Git Bash instead and the entire cross-environment
# problem disappears: one filesystem, one PATH, one Python, no path translation.
# Verified: a full pre-commit run from Git Bash scores 10.0/10 with zero /mnt/
# paths in the log and no WSL process involved.
#
# Usage:
#   bash scripts/run-xp-gate-native.sh pre-commit
#   bash scripts/run-xp-gate-native.sh pre-push
#   powershell -File scripts/run-xp-gate-native.ps1 pre-commit   # same thing
#
# Optional env:
#   XP_GATE_HOOKS_DIR   override the detected hook directory
#   XP_GATE_GIT_BASH    override the Git Bash executable path
#
# See docs/xp-gate-defects-2026-10.md and AGENTS.md ("Running the gates").
set -uo pipefail

HOOK="${1:-pre-commit}"
GIT_BASH="${XP_GATE_GIT_BASH:-/c/Program Files/Git/bin/bash.exe}"

if [ ! -x "$GIT_BASH" ]; then
  echo "Git Bash not found at $GIT_BASH" >&2
  echo "Set XP_GATE_GIT_BASH to the path of git's bash.exe." >&2
  exit 2
fi

# --- hook directory ----------------------------------------------------------
# `git config --get core.hooksPath` returns C:/Users/... ; Git Bash accepts the
# /c/Users/... form. Only the drive letter needs rewriting.
to_posix() {
  case "$1" in
    [A-Za-z]:/*) printf '/%s/%s' "$(printf '%s' "${1%%:*}" | tr '[:upper:]' '[:lower:]')" "${1#*:}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# Local config wins over global, and a wrapper directory can point core.hooksPath
# back at itself — which would make this script call itself forever. Read the
# *global* value explicitly instead of whatever core.hooksPath currently says, so
# the target is always the real xp-gate hooks.
if [ -z "${XP_GATE_HOOKS_DIR:-}" ]; then
  hp="$(git config --global --get core.hooksPath 2>/dev/null || true)"
  if [ -n "$hp" ]; then
    XP_GATE_HOOKS_DIR="$(to_posix "$hp")"
  else
    XP_GATE_HOOKS_DIR="$HOME/.config/xp-gate/hooks"
  fi
fi

# Guard against a self-referential configuration regardless of how it arose:
# refuse to exec a hook that is this very script.
self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target_dir="$(cd "$XP_GATE_HOOKS_DIR" 2>/dev/null && pwd || true)"
if [ -n "$target_dir" ] && [ "$target_dir" = "$self_dir" ]; then
  # The hook directory contains this script; fall back to xp-gate's own.
  XP_GATE_HOOKS_DIR="$(to_posix "$(git config --global --get core.hooksPath 2>/dev/null || printf '%s' "$HOME/.config/xp-gate/hooks")")"
fi

if [ ! -f "$XP_GATE_HOOKS_DIR/$HOOK" ]; then
  echo "xp-gate hook not found: $XP_GATE_HOOKS_DIR/$HOOK" >&2
  echo "Set XP_GATE_HOOKS_DIR to the directory holding the hooks." >&2
  exit 2
fi

# --- tool paths that are installed but not always on PATH -------------------
# Semgrep and lizard are user-level installs whose directories exist on the user
# PATH but may be missing from an older process's inherited environment; adding
# them here is idempotent and costs nothing when they are already present.
add_path() {
  case ":$PATH:" in
    *":$1:"*) : ;;
    *) [ -d "$1" ] && PATH="$1:$PATH" ;;
  esac
}

add_path "$HOME/.local/bin"
add_path "$HOME/bin"
add_path "$APPDATA/Python/Python312/Scripts"
add_path "/c/Program Files/nodejs"
export PATH

# --- report what we are about to use, so a wrong tool is obvious -------------
# A gate that silently picks up a different interpreter is exactly the failure
# this script removes, so make the resolution visible.
resolve() {
  local name="$1" found
  found="$(command -v "$name" 2>/dev/null || true)"
  if [ -n "$found" ]; then
    printf '  %-20s %s\n' "$name" "$found"
  else
    printf '  %-20s %s\n' "$name" "(not found)"
  fi
}

echo "xp-gate (native Windows / Git Bash) — hook: $HOOK"
echo "  tools:"
for tool in node npx git gitleaks lizard semgrep detect-secrets-hook; do
  resolve "$tool"
done
echo ""

# Gate 10's default 180s budget is too small for this repo: a full
# `--config=auto` pass over src/ takes ~169s on the WSL side, and the native run
# adds process-startup overhead on top. 400s keeps a real verdict while still
# bounding a wedged scan.
export XP_GATE_SEMGREP_TIMEOUT="${XP_GATE_SEMGREP_TIMEOUT:-400}"

exec "$GIT_BASH" "$XP_GATE_HOOKS_DIR/$HOOK" "${@:2}"
