#!/usr/bin/env bash
# Ops alert delivery — sends a DingTalk work notification.
# Usage: ds-alert.sh "title" "body"
#
# Credentials are never committed: DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET /
# DINGTALK_AGENT_ID are read at runtime from the deployment .env ($DS_ENV_FILE),
# and ALERT_USERIDS from the ops env file ($DS_OPS_ENV) or $DS_ALERT_CONF.
#
# Delivery paths, tried in order:
#   1) throwaway container on the default bridge network — the compose network may
#      be exactly what is broken, so alerts must not depend on it
#   2) host curl — works where the host can reach oapi.dingtalk.com directly
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

ENV_FILE="${DS_ENV_FILE:-$HOME/dialog-survey-src/.env}"
CONF_FILE="${DS_ALERT_CONF:-$HOME/.config/dialog-survey-alert.env}"
LOG_FILE="${DS_ALERT_LOG:-$HOME/.ds-alert.log}"
SEND_JS="${DS_ALERT_SEND_JS:-$HOME/bin/ds-alert-send.mjs}"
IMAGE="${DS_ALERT_IMAGE:-dialog-survey:local-build}"

read_env() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2-; }

APP_KEY="$(read_env DINGTALK_CLIENT_ID "$ENV_FILE")"
APP_SECRET="$(read_env DINGTALK_CLIENT_SECRET "$ENV_FILE")"
AGENT_ID="$(read_env DINGTALK_AGENT_ID "$ENV_FILE")"
ALERT_USERIDS="${ALERT_USERIDS:-$(read_env ALERT_USERIDS "$CONF_FILE")}"

TITLE="${1:-Dialog Survey alert}"
BODY="${2:-}"
CONTENT="[$TITLE] $BODY
主机: $(hostname)  时间: $(date '+%F %T %Z')"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE"; }

if [ -z "$APP_KEY" ] || [ -z "$APP_SECRET" ] || [ -z "$AGENT_ID" ]; then
  log "ERROR 钉钉凭据缺失: $ENV_FILE"
  exit 2
fi
if [ -z "${ALERT_USERIDS:-}" ]; then
  log "ERROR ALERT_USERIDS 未配置（${DS_OPS_ENV:-未找到 ops env} 或 $CONF_FILE）"
  exit 3
fi

PAYLOAD="$(jq -cn --arg k "$APP_KEY" --arg s "$APP_SECRET" --arg a "$AGENT_ID" \
  --arg u "$ALERT_USERIDS" --arg c "$CONTENT" \
  '{appKey:$k, appSecret:$s, agentId:$a, userIds:$u, content:$c}')"

# Path 1: throwaway container on the default bridge network
if command -v docker >/dev/null 2>&1 && [ -f "$SEND_JS" ]; then
  RESULT="$(printf '%s' "$PAYLOAD" | timeout 45 docker run --rm -i --network bridge \
    -v "$SEND_JS:/tmp/alert-send.mjs:ro" --entrypoint node "$IMAGE" /tmp/alert-send.mjs 2>/dev/null | tail -1)"
  if [ -n "$RESULT" ] && [ "$(printf '%s' "$RESULT" | jq -r '.ok // false' 2>/dev/null)" = "true" ]; then
    log "OK(container) 已推送 \"$TITLE\" -> $ALERT_USERIDS"
    exit 0
  fi
  log "WARN(container) 推送失败: $(printf '%s' "$RESULT" | head -c 300)"
fi

# Path 2: host curl
TOKEN_JSON="$(curl -sS -m 10 "https://oapi.dingtalk.com/gettoken?appkey=$(printf '%s' "$APP_KEY" | jq -sRr @uri)&appsecret=$(printf '%s' "$APP_SECRET" | jq -sRr @uri)" 2>/dev/null)"
TOKEN="$(printf '%s' "$TOKEN_JSON" | jq -r '.access_token // empty' 2>/dev/null)"
if [ -n "$TOKEN" ]; then
  MSG="$(jq -cn --arg c "$CONTENT" '{msgtype:"text",text:{content:$c}}')"
  RESP="$(curl -sS -m 10 -X POST "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=$(printf '%s' "$TOKEN" | jq -sRr @uri)" \
    --data-urlencode "agent_id=$AGENT_ID" \
    --data-urlencode "userid_list=$ALERT_USERIDS" \
    --data-urlencode "msg=$MSG" 2>/dev/null)"
  RC="$(printf '%s' "$RESP" | jq -r '.errcode // "-1"' 2>/dev/null)"
  if [ "$RC" = "0" ]; then
    log "OK(host) 已推送 \"$TITLE\" -> $ALERT_USERIDS"
    exit 0
  fi
  log "ERROR(host) errcode=$RC resp=$(printf '%s' "$RESP" | jq -c '{errcode,errmsg}' 2>/dev/null)"
fi

log "ERROR 所有告警通道均失败: \"$TITLE\""
exit 4
