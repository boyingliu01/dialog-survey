#!/bin/bash
# Run the xp-gate hooks (pre-commit / pre-push) with a PATH built for WSL.
#
# Why this wrapper exists
# -----------------------
# This machine's WSL sets `[interop] appendWindowsPath = false` (/etc/wsl.conf),
# so bash starts with no Windows directory on PATH. The xp-gate hooks are bash
# scripts that shell out to `npx`, `node`, `npm`, `gitleaks` and friends; every
# JS-based gate then either SKIPs ("npx not available") or reports BLOCK, which
# reads as a code-quality failure but is really an environment gap. Windows git
# starts these hooks too (core.hooksPath points at C:), where the `#!/bin/bash`
# shebang resolves to this same WSL bash, so the gap applies on both paths.
#
# Three further mismatches are repaired here, each of which the hooks otherwise
# report as a finding rather than as an environment problem:
#
#  1. bash's `command -v` ignores the `.exe` suffix, so `gitleaks.exe` sitting on
#     PATH is "not installed" and Gate 8 fail-closes. Scoop's own `shims/`
#     launcher does not help: it reads a sidecar file through a Windows path and
#     dies with "Cannot open shim file for read". A POSIX wrapper per tool (no
#     suffix, has a shebang) is the one form bash and the tool both accept.
#  2. The WSL user and the Windows user differ (/home/boyingliu01 vs
#     C:\Users\think), so Windows-side locations must come from USERPROFILE.
#  3. `$HOME` is /home/<wsl-user>, but node.exe resolves that string to
#     `D:\home\<wsl-user>\...`. The hooks build module paths as
#     "$HOME/.config/xp-gate/modules/<gate>.ts" and hand them to node, so Gate 9
#     died with ERR_MODULE_NOT_FOUND → "Build integrity check failed".
#
# This wrapper only builds the environment and resolves the hook directory. It
# changes nothing about what a gate decides, and it never bypasses a gate.
#
# Usage:
#   bash scripts/run-xp-gate.sh pre-commit
#   bash scripts/run-xp-gate.sh pre-push
#
# Optional env:
#   XP_GATE_NODE_BIN    directory holding node.exe/npm.cmd/npx.cmd
#                       (default: /mnt/c/Program Files/nodejs)
#   XP_GATE_HOOKS_DIR   override the detected hook directory
#
# See docs/quality-gates-audit-2026-10.md for what each gate inspects.
set -uo pipefail

HOOK="${1:-pre-commit}"
NODE_BIN="${XP_GATE_NODE_BIN:-/mnt/c/Program Files/nodejs}"
CMD_EXE="/mnt/c/Windows/System32/cmd.exe"

# Absolute invocation matters: a bare `cmd.exe` is not on PATH when
# appendWindowsPath=false, and the failure is silent (empty output).
win_env() {
  "$CMD_EXE" /c "echo %$1%" 2>/dev/null | tr -d '\r'
}

# --- Windows profile first: EVERYTHING below keys off it (mismatch 2) --------
# Capture the *WSL* home before anything overwrites HOME: pip-installed gate
# tools (`lizard`, `semgrep`, `detect-secrets-hook`) live in the Linux user's
# ~/.local/bin, which is not the Windows profile.
wsl_home="$HOME"
win_home=""
userprofile="$(win_env USERPROFILE)"
if [ -n "$userprofile" ]; then
  win_home="$(wslpath -u "$userprofile" 2>/dev/null || true)"
fi

# The hook modules live in the Windows profile, so HOME must point there: it
# keeps one path string valid for bash AND for node.exe (mismatch 3), and it is
# also the directory the shim cache is written to.
if [ -n "$win_home" ] && [ -d "$win_home/.config/xp-gate" ]; then
  export HOME="$win_home"
fi

# --- resolve the hook directory from what git actually uses -------------------
# `git config --get core.hooksPath` returns the Windows form (C:/Users/...),
# which bash cannot stat. Only the drive letter needs translating; bash accepts
# both separators under /mnt/<drive>/.
if [ -z "${XP_GATE_HOOKS_DIR:-}" ]; then
  hp="$(git config --get core.hooksPath 2>/dev/null || true)"
  case "$hp" in
    [A-Za-z]:/*)
      drive="$(printf '%s' "${hp:0:1}" | tr '[:upper:]' '[:lower:]')"
      XP_GATE_HOOKS_DIR="/mnt/$drive${hp:2}"
      ;;
    /*) XP_GATE_HOOKS_DIR="$hp" ;;
    *) XP_GATE_HOOKS_DIR="${win_home:-/home/$USER}/.config/xp-gate/hooks" ;;
  esac
fi
HOOK_DIR="$XP_GATE_HOOKS_DIR"

if [ ! -f "$HOOK_DIR/$HOOK" ]; then
  echo "xp-gate hook not found: $HOOK_DIR/$HOOK" >&2
  echo "Set XP_GATE_HOOKS_DIR to the directory holding the hooks." >&2
  exit 2
fi

# --- PATH: node first, then POSIX standard dirs, then tool shims -------------
if [ ! -x "$NODE_BIN/node.exe" ]; then
  echo "node.exe not found at $NODE_BIN" >&2
  echo "Set XP_GATE_NODE_BIN to the directory containing node.exe." >&2
  exit 2
fi
export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin:$PATH"

# --- pip-installed gate tools (`~/.local/bin`) -------------------------------
# Gate 3 needs `lizard`, Gate 10 needs `semgrep`, Gate 8 wants
# `detect-secrets-hook`. All three are pip installs, so they land in the Linux
# user's ~/.local/bin — and that directory is NOT on PATH here.
#
# This is why "the tool is not installed" kept appearing after it had been
# installed. ~/.profile:25 and ~/.bashrc:188 both add ~/.local/bin, but those
# are read by *interactive login* shells only; the gates run from a
# non-interactive shell that reads neither. So the tools are present and
# executable while `command -v` cannot see them, and the gate correctly reports
# what it observes: no tool.
#
# Must use $wsl_home, not $HOME: the block above repointed HOME at the Windows
# profile so Gate 9 can resolve its node modules.
#
# Prepending (rather than appending) so a pip-installed `semgrep` wins over any
# distro copy. `pysemgrep` lives in the same directory and semgrep execs it by
# bare name, so both must be reachable.
if [ -d "$wsl_home/.local/bin" ]; then
  export PATH="$wsl_home/.local/bin:$PATH"
fi

# Python resolves the *user* site-packages directory from $HOME, and the block
# above repointed HOME at the Windows profile (needed by Gate 9). That makes
# pip-installed console scripts findable on PATH but their modules unimportable:
#   File ".../.local/bin/semgrep", line 5, in <module>
#     from semgrep.console_scripts.entrypoint import main
#   ModuleNotFoundError: No module named 'semgrep'
# PYTHONUSERBASE pins that lookup to the Linux home independently of HOME, so
# semgrep / detect-secrets work alongside the Windows-HOME requirement.
if [ -d "$wsl_home/.local/lib" ]; then
  export PYTHONUSERBASE="$wsl_home/.local"
fi

# semgrep's default budget is 180s (gate-10.sh: XP_GATE_SEMGREP_TIMEOUT). A full
# `--config=auto` pass over src/ measures 169s here (config fetch alone ~10s),
# so the run routinely lands on the limit and the gate reports "timed out — no
# verdict", which is neither a pass nor a finding. 400s leaves headroom for a
# slow network or a cold rule cache while still bounding a wedged run.
export XP_GATE_SEMGREP_TIMEOUT="${XP_GATE_SEMGREP_TIMEOUT:-400}"

SHIM_DIR="$HOME/.cache/xp-gate-shims"
if mkdir -p "$SHIM_DIR" 2>/dev/null; then
  # Write a POSIX wrapper for a Windows executable, unless one already matches.
  link_shim() {
    local exe="$1" name="$2" shim="$SHIM_DIR/$2"
    [ -f "$exe" ] || return 0
    if [ ! -f "$shim" ] || ! grep -qxF "exec \"$exe\" \"\$@\"" "$shim" 2>/dev/null; then
      {
        printf '#!/bin/sh\n'
        printf '# Generated by scripts/run-xp-gate.sh - see the header there.\n'
        printf 'exec "%s" "$@"\n' "$exe"
      } > "$shim" 2>/dev/null && chmod +x "$shim" 2>/dev/null
    fi
  }

  # node/npm/npx always: the hook calls them directly, and a missing shim is the
  # difference between a gate running and a gate lying (mismatch 1).
  #
  # The node shim also translates /mnt/<drive>/... arguments to <drive>:\...
  # That is mismatch 4: bash sees the repository as /mnt/d/..., node.exe resolves
  # that string to <cwd-drive>:\mnt\d\... — a path that does not exist. Several
  # gates pass absolute repository paths to node (Gate 9's `--project-root`,
  # `run_tsx "$PROJECT_ROOT/node_modules/tsx/dist/cli.mjs"`), and every one of
  # them failed with MODULE_NOT_FOUND → "Build integrity check failed". Relative
  # paths (`node -e`, `node scripts/x.cjs`) are left untouched, so they keep
  # resolving against the current working directory exactly as before.
  if [ ! -f "$SHIM_DIR/node" ] || ! grep -qF 'mount-translating' "$SHIM_DIR/node" 2>/dev/null; then
    cat > "$SHIM_DIR/node" <<'NODE_SHIM'
#!/bin/sh
# Generated by scripts/run-xp-gate.sh - mount-translating node shim.
# Translates /mnt/<drive>/... arguments to <drive>:\... so node.exe can open
# absolute repository paths; every other argument passes through unchanged.
NODE_EXE="${XP_GATE_NODE_EXE:?XP_GATE_NODE_EXE must be set}"
has_mount=0
for arg in "$@"; do
  case "$arg" in
    /mnt/*) has_mount=1 ;;
  esac
done
if [ "$has_mount" -eq 0 ]; then
  exec "$NODE_EXE" "$@"
fi
translated=$(
  for arg in "$@"; do
    case "$arg" in
      /mnt/*) wslpath -w "$arg" ;;
      *) printf '%s\n' "$arg" ;;
    esac
  done
)
# Word splitting is intended: each line is one translated argument.
# shellcheck disable=SC2086
exec "$NODE_EXE" $translated
NODE_SHIM
    chmod +x "$SHIM_DIR/node" 2>/dev/null
  fi
  export XP_GATE_NODE_EXE="$NODE_BIN/node.exe"
  # npm/npx: the Windows `.cmd` wrappers are CMD batch files and cannot be exec'd
  # from bash ("Syntax error: Unterminated quoted string"). The Node installer
  # also ships extension-less bash scripts next to them; those are what bash
  # needs. They exec node internally, so an absolute POSIX path is fine.
  link_shim "$NODE_BIN/npm" npm
  link_shim "$NODE_BIN/npx" npx

  # Then every Scoop-installed native tool (gitleaks, semgrep, ...).
  if [ -n "$win_home" ] && [ -d "$win_home/scoop/apps" ]; then
    while IFS= read -r exe; do
      name="$(basename "$exe" .exe)"
      command -v "$name" >/dev/null 2>&1 && continue
      link_shim "$exe" "$name"
    done < <(find "$win_home/scoop/apps" -mindepth 3 -maxdepth 3 -name '*.exe' -type f 2>/dev/null)
  fi

  # `cygpath` is a Git-for-Windows/MSYS tool with no WSL counterpart. Gates probe
  # for it and, when present, hand native binaries a translated path; without it
  # they pass a /mnt/... path the native binary cannot open. Gate 8 hit exactly
  # that ("FTL unable to load gitleaks config ... /mnt/d/.../.gitleaks.toml"),
  # and reported it as a detected secret. wslpath is the correct translator.
  if ! command -v cygpath >/dev/null 2>&1; then
    if [ ! -f "$SHIM_DIR/cygpath" ]; then
      cat > "$SHIM_DIR/cygpath" <<'CYGPATH_SHIM'
#!/bin/sh
# Generated by scripts/run-xp-gate.sh - wslpath under the name the gates probe for.
format=unix
target=''
for arg in "$@"; do
  case "$arg" in
    -w|-m) format=windows ;;
    -u) format=unix ;;
    -*) ;;
    *) target="$arg" ;;
  esac
done
[ -n "$target" ] || exit 1
if [ "$format" = windows ]; then
  exec wslpath -w "$target"
fi
exec wslpath -u "$target"
CYGPATH_SHIM
      chmod +x "$SHIM_DIR/cygpath" 2>/dev/null
    fi
  fi

  export PATH="$SHIM_DIR:$PATH"
fi

# Gate invocations must not rewrite the lockfile behind our back.
export npm_config_audit=false
export npm_config_fund=false

exec bash "$HOOK_DIR/$HOOK" "${@:2}"
