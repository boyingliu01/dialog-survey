#!/usr/bin/env bash
# Restore drill: replay the newest backup into a throwaway PG16 container
# (--network none, removed on exit) and prove the dump really restores the tables
# the app needs. A backup that has never been restored is not a backup.
#
# Usage:
#   ds-restore-drill.sh [dump-file]     defaults to the newest *.dump in $DS_BACKUP_DIR
# Exit codes: 0 drill passed; 1 restore or verification failed (alert pushed)
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

DUMP_DIR="${DS_BACKUP_DIR:-$HOME/backups/db}"
IMAGE="${DS_PG_IMAGE:-postgres:16-alpine}"
PROD_CONTAINER="${DS_DB:-dialog-survey-db}"
PROD_DB="${DS_DB_NAME:-dialog_survey}"
PROD_USER="${DS_DB_USER:-dialog_survey}"
LOG="${DS_DRILL_LOG:-$HOME/.ds-restore-drill.log}"
ALERT_BIN="${DS_ALERT_BIN:-$HOME/bin/ds-alert.sh}"
CORE_TABLES="${DS_CORE_TABLES:-Interview InterviewPlan Template AnalysisReport Message Response}"
CONTAINER="ds-restore-drill-$$"
DRILL_DB="drill"
PW="drill_$(date +%s)_$$"
TMP_ERR="/tmp/ds-drill-$$.err"
TMP_RESTORE="/tmp/ds-drill-$$.restore"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }
fail() {
  log "FAILED: $*"
  [ -x "$ALERT_BIN" ] && "$ALERT_BIN" "数据库恢复演练失败" "$*" >/dev/null 2>&1
  exit 1
}
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -f "$TMP_ERR" "$TMP_RESTORE"; }
trap cleanup EXIT

dump="${1:-}"
if [ -z "$dump" ]; then
  dump="$(ls -1t "$DUMP_DIR"/*.dump 2>/dev/null | head -1)"
fi
[ -n "$dump" ] && [ -f "$dump" ] || fail "找不到备份文件（目录 $DUMP_DIR）"
dump_dir="$(cd "$(dirname "$dump")" && pwd)"
dump_name="$(basename "$dump")"
log "开始演练 dump=$dump_name size=$(stat -c%s "$dump")B"

command -v docker >/dev/null || fail "docker 不可用"
docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "本机没有镜像 $IMAGE"

docker run --rm -v "$dump_dir:/dumps:ro" --entrypoint pg_restore "$IMAGE" -l "/dumps/$dump_name" >/dev/null 2>"$TMP_ERR" \
  || fail "归档头校验失败（$(head -c 200 "$TMP_ERR" | tr '\n' ' ')）"
log "归档头校验 OK"

start="$(date +%s)"
docker run -d --rm --name "$CONTAINER" --network none \
  -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB="$DRILL_DB" \
  -v "$dump_dir:/dumps:ro" -v /var/lib/postgresql/data "$IMAGE" >/dev/null \
  || fail "临时 PG 容器启动失败"

ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d "$DRILL_DB" -tAc 'select 1' >/dev/null 2>&1; then ready=1; break; fi
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ] || break
  sleep 1
done
[ "$ready" = 1 ] || fail "临时 PG 未在 60s 内就绪（$(docker logs --tail 5 "$CONTAINER" 2>&1 | tr '\n' ' ')）"
log "临时 PG 就绪"

docker exec "$CONTAINER" pg_restore -U postgres -d "$DRILL_DB" --no-owner --no-privileges --exit-on-error \
  "/dumps/$dump_name" >"$TMP_RESTORE" 2>&1 \
  || fail "pg_restore 失败（$(tail -5 "$TMP_RESTORE" | tr '\n' ' ')）"
log "还原完成"

tbl_count="$(docker exec "$CONTAINER" psql -U postgres -d "$DRILL_DB" -tAc \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" | tr -d ' ')"
[ "${tbl_count:-0}" -ge 10 ] || fail "还原后表数量异常: ${tbl_count:-0}"

summary=""
for t in $CORE_TABLES; do
  n="$(docker exec "$CONTAINER" psql -U postgres -d "$DRILL_DB" -tAc "select count(*) from \"$t\"" 2>/dev/null | tr -d ' ')"
  [ -n "$n" ] || fail "表 $t 不可读"
  summary="${summary}${t}=${n} "
  case "$t" in
    Interview|InterviewPlan|Template)
      [ "$n" -gt 0 ] || fail "核心表 $t 还原后行数为 0"
      ;;
  esac
done
log "还原行数: $summary"

# Compare with production: an older backup is normal, but a restored row count far
# below production hints that the dump itself lost data.
if docker exec "$PROD_CONTAINER" pg_isready -U "$PROD_USER" -d "$PROD_DB" >/dev/null 2>&1; then
  for t in Interview InterviewPlan Template; do
    p="$(docker exec "$PROD_CONTAINER" psql -U "$PROD_USER" -d "$PROD_DB" -tAc "select count(*) from \"$t\"" 2>/dev/null | tr -d ' ')"
    r="$(echo "$summary" | tr ' ' '\n' | sed -n "s/^$t=//p")"
    if [ -n "${p:-}" ] && [ -n "${r:-}" ] && [ "$r" -lt "$p" ]; then
      log "WARN $t 还原=$r < 现网=$p（备份较旧，差异应能由备份时间解释）"
    fi
  done
else
  log "跳过与现网对比（$PROD_CONTAINER 不可用）"
fi

elapsed=$(( $(date +%s) - start ))
log "PASS 演练通过，用时 ${elapsed}s，临时容器已清理"
exit 0
