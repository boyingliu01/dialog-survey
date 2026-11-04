#!/usr/bin/env bash
# Per-minute availability probe: container state + /health + DingTalk Stream status.
#
# Alerting rules (learned the hard way — see docs/ops-watchdog-alerting.md):
#   * FAIL_THRESHOLD consecutive failures are required before alerting, because
#     /health calls the LLM gateway live and a slow upstream window otherwise
#     produced several false "down/up" pairs per day.
#   * a still-failing service re-alerts every REALERT_SECONDS;
#   * the recovery notice is only sent after an outage was actually alerted.
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

APP="${DS_APP:-dialog-survey-app}"
DB="${DS_DB:-dialog-survey-db}"
HEALTH_URL="${DS_HEALTH_URL:-http://127.0.0.1:3001/health}"
APP_PORT="${DS_APP_PORT:-3001}"
STATE_DIR="${DS_STATE_DIR:-$HOME/.local/state}"
STATE_FILE="$STATE_DIR/ds-health.state"
LOG_FILE="${DS_WATCH_LOG:-$HOME/.ds-health-watch.log}"
ALERT_BIN="${DS_ALERT_BIN:-$HOME/bin/ds-alert.sh}"
REALERT_SECONDS="${DS_REALERT_SECONDS:-1800}"
FAIL_THRESHOLD="${DS_FAIL_THRESHOLD:-2}"
HEALTH_TIMEOUT="${DS_HEALTH_TIMEOUT:-40}"
LOCK_FILE="${DS_LOCK_FILE:-/tmp/ds-health-watch.lock}"

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE" || exit 0
flock -n 9 || exit 0

now=$(date +%s)
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; }

problems=()

cstate="$(docker inspect -f '{{.State.Status}}' "$APP" 2>/dev/null || echo missing)"
dstate="$(docker inspect -f '{{.State.Health.Status}}' "$DB" 2>/dev/null || echo missing)"
[ "$cstate" = "running" ] || problems+=("app 容器状态=$cstate")
[ "$dstate" = "healthy" ] || problems+=("db 容器健康=$dstate")

tcp_ok=0
if timeout 3 bash -c "exec 3<>/dev/tcp/127.0.0.1/$APP_PORT" 2>/dev/null; then tcp_ok=1; fi

body="$(curl -sS -m "$HEALTH_TIMEOUT" "$HEALTH_URL" 2>/dev/null || true)"
status="$(printf '%s' "$body" | jq -r '.status // empty' 2>/dev/null)"
if [ "$status" != "healthy" ]; then
  if [ -z "$status" ] && [ "$tcp_ok" = 1 ]; then
    problems+=("/health 超时（${HEALTH_TIMEOUT}s，端口可连，疑似上游 LLM 慢）")
  elif [ -z "$status" ]; then
    problems+=("/health 无响应（端口不可连）")
  else
    problems+=("/health=${status} $(printf '%s' "$body" | jq -c '.checks // {}' 2>/dev/null)")
  fi
fi

stream_last="$(docker logs --since 24h "$APP" 2>&1 | grep -E 'Connected to DingTalk Stream|Stream connection failed' | tail -1)"
case "$stream_last" in
  *"Connected to DingTalk Stream"*) ;;
  *) problems+=("钉钉 Stream 未连接: ${stream_last:-无日志}") ;;
esac

prev=ok
prev_alert=0
fail_count=0
alerted=0
if [ -f "$STATE_FILE" ]; then
  read -r prev prev_alert fail_count alerted < "$STATE_FILE" || true
fi
case "$prev" in ok|fail) ;; *) prev=ok ;; esac
case "$prev_alert" in ''|*[!0-9]*) prev_alert=0 ;; esac
case "$fail_count" in ''|*[!0-9]*) fail_count=0 ;; esac
case "$alerted" in ''|*[!0-9]*) alerted=0 ;; esac

if [ "${#problems[@]}" -gt 0 ]; then
  fail_count=$((fail_count + 1))
  summary="$(printf '%s; ' "${problems[@]}")"
  log "FAIL(${fail_count}) $summary"
  if [ "$fail_count" -ge "$FAIL_THRESHOLD" ] && { [ "$alerted" != "1" ] || [ $((now - prev_alert)) -ge "$REALERT_SECONDS" ]; }; then
    "$ALERT_BIN" "访谈机器人异常" "连续 ${fail_count} 次: ${summary}" || log "告警推送失败"
    prev_alert=$now
    alerted=1
  fi
  cur=fail
else
  if [ "$alerted" = "1" ]; then
    log "RECOVERED"
    "$ALERT_BIN" "访谈机器人已恢复" "容器、/health、钉钉 Stream 均恢复正常" || log "恢复通知推送失败"
  elif [ "$prev" = "fail" ]; then
    log "RECOVERED(未告警)"
  fi
  cur=ok
  fail_count=0
  alerted=0
fi

printf '%s %s %s %s\n' "$cur" "$prev_alert" "$fail_count" "$alerted" > "$STATE_FILE"
exit 0
