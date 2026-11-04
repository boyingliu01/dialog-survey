#!/usr/bin/env bash
# Daily inspection digest (DingTalk): containers / /health / Stream / alerts in the
# last 24h / latest backup / last restore drill.
#
# Why this exists: a WSL-side watchdog cannot report an outage it cannot observe —
# when the VM is being upgraded or restarted, the cron job itself is down. The daily
# digest makes the monitoring itself observable, and ds-win-watch.ps1 covers the
# VM-down case from the Windows side.
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

APP="${DS_APP:-dialog-survey-app}"
DB="${DS_DB:-dialog-survey-db}"
HEALTH_URL="${DS_HEALTH_URL:-http://127.0.0.1:3001/health}"
ALERT_BIN="${DS_ALERT_BIN:-$HOME/bin/ds-alert.sh}"
WATCH_LOG="${DS_WATCH_LOG:-$HOME/.ds-health-watch.log}"
DRILL_LOG="${DS_DRILL_LOG:-$HOME/.ds-restore-drill.log}"
BACKUP_DIR="${DS_BACKUP_DIR:-$HOME/backups/db}"

cstate="$(docker inspect -f '{{.State.Status}}' "$APP" 2>/dev/null || echo missing)"
chealth="$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo unknown)"
dstate="$(docker inspect -f '{{.State.Health.Status}}' "$DB" 2>/dev/null || echo missing)"

body="$(curl -sS -m 40 "$HEALTH_URL" 2>/dev/null || true)"
status="$(printf '%s' "$body" | jq -r '.status // empty' 2>/dev/null)"
dbms="$(printf '%s' "$body" | jq -r '.checks.db.latencyMs // "-"' 2>/dev/null)"

stream="未连接"
docker logs --since 24h "$APP" 2>&1 | grep -q 'Connected to DingTalk Stream' && stream="已连接"

since="$(date -d '24 hours ago' '+%F %T')"
fails="$(awk -v s="$since" '$0 >= s' "$WATCH_LOG" 2>/dev/null | grep -c 'FAIL' || true)"
recovers="$(awk -v s="$since" '$0 >= s' "$WATCH_LOG" 2>/dev/null | grep -c 'RECOVERED' || true)"
last_fail="$(grep 'FAIL' "$WATCH_LOG" 2>/dev/null | tail -1 | cut -c1-19)"

latest_dump="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1)"
if [ -n "$latest_dump" ]; then
  backup_line="$(basename "$latest_dump") $(du -h "$latest_dump" | cut -f1) @ $(date -r "$latest_dump" '+%F %H:%M')"
else
  backup_line="无备份文件"
fi
drill_line="$(grep -E 'PASS|FAILED' "$DRILL_LOG" 2>/dev/null | tail -1 | cut -c1-60)"
[ -n "$drill_line" ] || drill_line="未执行"

overall="正常"
[ "$cstate" = "running" ] && [ "$dstate" = "healthy" ] && [ "$status" = "healthy" ] && [ "$stream" = "已连接" ] || overall="异常"

msg="状态: ${overall}
容器: app=${cstate}/${chealth}, db=${dstate}
/health: ${status:-无响应} (db=${dbms}ms)
钉钉Stream: ${stream}
近24h: 异常${fails:-0}次 / 恢复${recovers:-0}次
最近异常: ${last_fail:-无}
最近备份: ${backup_line}
恢复演练: ${drill_line}
WSL: $(uptime -p)"

"$ALERT_BIN" "访谈机器人巡检日报" "$msg"
exit 0
