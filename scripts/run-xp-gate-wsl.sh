#!/bin/bash
# Run the xp-gate hooks from inside WSL, against the WSL worktree.
#
# Why this exists
# ---------------
# This repo is developed primarily on Windows (see scripts/run-xp-gate-native.sh
# and AGENTS.md). WSL is a secondary environment, but it should still be able to
# run the gates on its *own* copy of the code. Two things stop that from working
# by accident, and this script fixes both without touching either environment's
# configuration:
#
#  1. PATH. The gates shell out to node, gitleaks, lizard, semgrep and
#     detect-secrets-hook. All of them live in ~/.local/bin, which ~/.profile
#     adds to PATH -- but ~/.profile is only read by *login* shells, and
#     ~/.bashrc returns early for non-interactive ones (Ubuntu's guard). A gate
#     shell therefore sees none of them and reports "not installed" for tools
#     that are installed. Adding ~/.local/bin here is the whole fix. node/npm/
#     npx are symlinked into ~/.local/bin so nvm does not need sourcing.
#
#  2. node_modules. /mnt/d is one directory seen by two operating systems, so a
#     checkout there has a single node_modules -- and `npm install` writes only
#     the native binaries for the platform that ran it. Windows writes
#     @biomejs/cli-win32-x64; WSL needs @biomejs/cli-linux-x64, which simply is
#     not there. Gate 1 then dies with
#         Cannot find module '@biomejs/cli-linux-x64/biome'
#     disguised as a lint failure. This script therefore refuses to run against
#     a checkout on /mnt/ and tells you to use the WSL worktree instead, where
#     WSL ran its own `npm ci` and the Linux binaries exist.
#
# The worktree is ~/dialog-survey-wsl (branch wsl/dev), on the Linux filesystem,
# created with:
#     git worktree add -b wsl/dev ~/dialog-survey-wsl master
#     cd ~/dialog-survey-wsl && npm ci
#
# It also carries its own core.hooksPath (worktree-scoped), because the shared
# .git/config points at C:/Users/think/.config/xp-gate/hooks, which does not
# exist inside WSL -- so without the override `git commit` silently skips every
# gate. Verify with: git config --show-origin --get core.hooksPath
#
# Usage:
#   bash scripts/run-xp-gate-wsl.sh pre-commit
#   bash scripts/run-xp-gate-wsl.sh pre-push
#
# See docs/quality-gates-audit-2026-10.md for what each gate inspects.
set -uo pipefail

HOOK="${1:-pre-commit}"

# --- 1. PATH: user bins first, no dependence on nvm being sourced ------------
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"

# --- 2. Refuse a /mnt checkout, where node_modules is the other platform's ----
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$PROJECT_ROOT" in
  /mnt/*)
    printf 'Refusing to run the gates from a /mnt/ checkout: %s\n' "$PROJECT_ROOT" >&2
    printf 'Its node_modules holds Windows native binaries, so Gate 1 dies on\n' >&2
    printf "  Cannot find module '@biomejs/cli-linux-x64/biome'\n" >&2
    printf 'Use the WSL worktree on the Linux filesystem instead:\n' >&2
    printf '  cd ~/dialog-survey-wsl && bash scripts/run-xp-gate-wsl.sh %s\n' "$HOOK" >&2
    exit 2
    ;;
esac

# --- Resolve the hook directory from git, so a stale path is visible ---------
HOOKS_DIR="$(git config --get core.hooksPath 2>/dev/null || true)"
if [ -z "$HOOKS_DIR" ]; then
  printf 'core.hooksPath is not set for this checkout.\n' >&2
  exit 2
fi
case "$HOOKS_DIR" in
  [A-Za-z]:/* | [A-Za-z]:\\*)
    printf 'core.hooksPath points at a Windows path: %s\n' "$HOOKS_DIR" >&2
    printf 'That path does not exist inside WSL, so every gate would be skipped.\n' >&2
    printf 'Set a worktree-scoped value instead:\n' >&2
    printf '  git config extensions.worktreeConfig true\n' >&2
    # $HOME below is literal example text for the user to copy, not a variable.
    # shellcheck disable=SC2016
    printf '  git config --worktree core.hooksPath "$HOME/.config/xp-gate/hooks"\n' >&2
    exit 2
    ;;
esac
if [ ! -f "$HOOKS_DIR/$HOOK" ]; then
  printf 'Hook not found: %s/%s\n' "$HOOKS_DIR" "$HOOK" >&2
  exit 2
fi

# --- Print what a gate will actually use, before it decides anything --------
# Same rationale as the Windows runner: a wrong interpreter should be visible in
# the first few lines, not inferred from a mystery SKIP later.
printf 'Gate environment (WSL):\n'
printf '  checkout             %s\n' "$PROJECT_ROOT"
printf '  hooks                %s\n' "$HOOKS_DIR/$HOOK"
for tool in node npx git gitleaks lizard semgrep detect-secrets-hook shellcheck; do
  resolved="$(command -v "$tool" 2>/dev/null || true)"
  printf '  %-20s %s\n' "$tool" "${resolved:-NOT FOUND}"
done

missing=0
for tool in node npx gitleaks; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'ERROR: %s not found on PATH (looked in ~/.local/bin).\n' "$tool" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  exit 2
fi

# semgrep on a cold cache is slow; the Windows runner needed 400s for the same
# reason (Gate 10 measured 2m49s once warm).
export XP_GATE_SEMGREP_TIMEOUT="${XP_GATE_SEMGREP_TIMEOUT:-400}"

exec bash "$HOOKS_DIR/$HOOK" "${@:2}"
