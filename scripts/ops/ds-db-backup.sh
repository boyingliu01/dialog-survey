#!/usr/bin/env bash
# Daily logical database backup for the Docker deployment: pg_dump -Fc + archive
# validation + retention + optional second copy outside the WSL VHD.
#
# The archive is validated with the pg_restore inside the db container: a host
# client older than the server cannot read the PG16 archive header at all.
# Failures are pushed through ds-alert.sh.
set -euo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

DB="${DS_DB:-dialog-survey-db}"
DB_USER="${DS_DB_USER:-dialog_survey}"
DB_NAME="${DS_DB_NAME:-dialog_survey}"
LOCAL_DIR="${DS_BACKUP_DIR:-$HOME/backups/db}"
OFFSITE_DIR="${DS_OFFSITE_DIR:-}"
KEEP="${DS_BACKUP_KEEP:-14}"
LOG="${DS_BACKUP_LOG:-$HOME/.ds-db-backup.log}"
ALERT_BIN="${DS_ALERT_BIN:-$HOME/bin/ds-alert.sh}"

STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="dialog-survey-$STAMP.dump"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }
fail() { log "ERROR $*"; "$ALERT_BIN" "数据库备份失败" "$*" >/dev/null 2>&1 || true; exit 1; }

mkdir -p "$LOCAL_DIR" || fail "无法创建备份目录 $LOCAL_DIR"
if [ -n "$OFFSITE_DIR" ]; then
  mkdir -p "$OFFSITE_DIR" || fail "无法创建异地备份目录 $OFFSITE_DIR"
fi

tmp="$LOCAL_DIR/.$NAME.part"
docker exec "$DB" pg_dump -U "$DB_USER" -Fc -d "$DB_NAME" > "$tmp" || fail "pg_dump 失败"
docker exec -i "$DB" pg_restore -l >/dev/null < "$tmp" || fail "归档校验失败 ($NAME)"
mv -f "$tmp" "$LOCAL_DIR/$NAME"
size="$(du -h "$LOCAL_DIR/$NAME" | cut -f1)"

if [ -n "$OFFSITE_DIR" ]; then
  cp -f "$LOCAL_DIR/$NAME" "$OFFSITE_DIR/$NAME" || fail "同步到 $OFFSITE_DIR 失败"
  ls -1t "$OFFSITE_DIR"/*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f
fi

ls -1t "$LOCAL_DIR"/*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f

log "OK $NAME size=$size local=$(ls -1 "$LOCAL_DIR"/*.dump 2>/dev/null | wc -l)$([ -n "$OFFSITE_DIR" ] && printf ' offsite=%s' "$(ls -1 "$OFFSITE_DIR"/*.dump 2>/dev/null | wc -l)")"
