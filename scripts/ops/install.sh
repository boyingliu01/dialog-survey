#!/usr/bin/env bash
# Install the Dialog Survey ops scripts on a deployment host.
#
# Usage:
#   bash scripts/ops/install.sh                 # copy scripts into $HOME/bin (root -> /usr/local/bin)
#   bash scripts/ops/install.sh --bin DIR       # choose the install directory
#   bash scripts/ops/install.sh --cron          # idempotently register the schedule (crontab)
#   bash scripts/ops/install.sh --systemd       # install + enable ds-net-repair timer (needs root)
#
# Nothing here sends credentials anywhere: ops.env holds only paths and thresholds,
# and the DingTalk credentials are read from the deployment .env at runtime.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${DS_BIN_DIR:-$HOME/bin}"
[ "$(id -u)" -eq 0 ] && BIN=/usr/local/bin
DO_CRON=0
DO_SYSTEMD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bin) BIN="$2"; shift 2 ;;
    --cron) DO_CRON=1; shift ;;
    --systemd) DO_SYSTEMD=1; shift ;;
    *) printf 'unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
done

SCRIPTS=(ds-alert.sh ds-alert-send.mjs ds-health-watch.sh ds-daily-report.sh
         ds-db-backup.sh ds-restore-drill.sh ds-smoke.sh ds-net-repair.sh ds-ops-env.sh)

mkdir -p "$BIN"
for f in "${SCRIPTS[@]}"; do
  install -m 0755 "$SRC/$f" "$BIN/$f"
done
printf 'installed %s scripts into %s\n' "${#SCRIPTS[@]}" "$BIN"

if [ "$DO_CRON" = 1 ]; then
  existing="$(crontab -l 2>/dev/null || true)"
  add() {
    local line="$1" tag="$2"
    if printf '%s\n' "$existing" | grep -q "$tag"; then
      printf 'cron %s already present\n' "$tag"
    else
      printf '%s\n%s %s\n' "$existing" "$line" "$tag" | sed '/^ *$/d' | crontab -
      printf 'cron added: %s\n' "$line"
    fi
  }
  add "*/1 * * * * $BIN/ds-health-watch.sh >/dev/null 2>&1" "# ds-health-watch"
  add "30 2 * * * $BIN/ds-db-backup.sh >> \$HOME/.ds-db-backup.log 2>&1" "# ds-db-backup"
  add "0 3 1 * * $BIN/ds-restore-drill.sh >> \$HOME/.ds-restore-drill.log 2>&1" "# ds-restore-drill"
  add "0 9 * * * $BIN/ds-daily-report.sh >/dev/null 2>&1" "# ds-daily-report"
fi

if [ "$DO_SYSTEMD" = 1 ]; then
  if [ "$(id -u)" -ne 0 ]; then
    printf -- '--systemd needs root (sudo bash scripts/ops/install.sh --systemd)\n' >&2
    exit 1
  fi
  install -m 0644 "$SRC/ds-net-repair.service" /etc/systemd/system/ds-net-repair.service
  install -m 0644 "$SRC/ds-net-repair.timer" /etc/systemd/system/ds-net-repair.timer
  systemctl daemon-reload
  systemctl enable --now ds-net-repair.timer
  systemctl list-timers ds-net-repair.timer --no-pager
fi

cat <<EOF

Next steps
  1. ops config (paths, thresholds, recipients):
       cp scripts/ops/ops.env.example ~/.config/dialog-survey-ops.env   # then edit
     /etc/default/dialog-survey-ops is read instead when it exists.
  2. Windows-side fallback (covers the case where WSL itself is down):
       copy scripts/ops/ds-win-watch.ps1 to %LOCALAPPDATA%\\DialogSurvey\\
       schtasks /Create /SC MINUTE /MO 5 /TN dialog-survey-win-watch ...
     see docs/ops-watchdog-alerting.md
  3. verify: bash $BIN/ds-smoke.sh    (sudo for the iptables check)
EOF
