#!/usr/bin/env bash
# Detect whether dockerd failed to program the per-network iptables rules for a
# compose network, and self-heal by restarting dockerd.
#
# Background: after an unclean WSL shutdown / VM upgrade, dockerd fails to restore
# old sandboxes ("error locating sandbox id ... not found") and then skips the
# DOCKER-FORWARD / DOCKER-CT / DOCKER-BRIDGE rules of the network. Containers look
# healthy but every egress connection is dropped by the FORWARD policy (DROP), so
# /health returns 503 (db timeout + llm "fetch failed"). `systemctl restart docker`
# reprograms everything; this script makes that reaction automatic.
#
# Usage:
#   ds-net-repair.sh              detect and repair (default; needs root)
#   DS_REPAIR_ACTION=detect ...   detect only, exit 1 when rules are missing
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

NET="${DS_NETWORK:-dialog-survey-src_default}"
ACTION="${DS_REPAIR_ACTION:-repair}"
LOG="${DS_REPAIR_LOG:-$HOME/.ds-net-repair.log}"
STATE="${DS_REPAIR_STATE:-/run/ds-net-repair.last}"
MIN_INTERVAL="${DS_REPAIR_MIN_INTERVAL:-600}"
ALERT_BIN="${DS_ALERT_BIN:-$HOME/bin/ds-alert.sh}"
IPTABLES="$(command -v iptables || echo /usr/sbin/iptables)"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }

exec 9>/run/ds-net-repair.lock || exit 0
flock -n 9 || exit 0

br_id="$(docker network inspect "$NET" --format '{{.Id}}' 2>/dev/null | cut -c1-12)"
if [ -z "$br_id" ]; then
  log "skip: network $NET not found (docker 未就绪或网络未创建)"
  exit 0
fi
br="br-$br_id"

missing=""
check_rules() {
  missing=""
  "$IPTABLES" -C DOCKER-FORWARD -i "$br" -j ACCEPT >/dev/null 2>&1 || missing="${missing}FORWARD "
  "$IPTABLES" -C DOCKER-CT -o "$br" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT >/dev/null 2>&1 || missing="${missing}CT "
  "$IPTABLES" -C DOCKER-BRIDGE -o "$br" -j DOCKER >/dev/null 2>&1 || missing="${missing}BRIDGE "
  return 0
}

check_rules
if [ -z "$missing" ]; then
  exit 0
fi

log "missing rules for $br: ${missing}"
if [ "$ACTION" = "detect" ]; then
  exit 1
fi

now="$(date +%s)"
last="$(cat "$STATE" 2>/dev/null || echo 0)"
case "$last" in ''|*[!0-9]*) last=0 ;; esac
if [ $((now - last)) -lt "$MIN_INTERVAL" ]; then
  log "last repair $((now - last))s ago, skip to avoid restart loop"
  exit 1
fi

echo "$now" >"$STATE"
log "restarting docker to reprogram rules for $br"
systemctl restart docker >>"$LOG" 2>&1
sleep 12

check_rules
if [ -z "$missing" ]; then
  log "repair OK for $br"
  exit 0
fi

log "repair FAILED for $br, still missing: ${missing}"
[ -x "$ALERT_BIN" ] && "$ALERT_BIN" "网络规则自愈失败" "Docker 网络 $NET ($br) 的 iptables 规则重启后仍缺失: ${missing}；访谈机器人可能无法访问数据库/LLM。" >/dev/null 2>&1
exit 1
