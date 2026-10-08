#!/bin/sh
# Automated database backup for Dialog Survey (issue #179).
#
# Usage:
#   ./scripts/backup.sh                    # one-shot backup
#   BACKUP_DIR=/var/backups RETENTION_DAYS=14 ./scripts/backup.sh
#
# Environment:
#   DATABASE_URL    postgres://user:pass@host:port/db   (required)
#   BACKUP_DIR      backup target directory            (default /var/backups/dialog-survey)
#   RETENTION_DAYS  delete backups older than N days   (default 14)
#
# Schedule with cron:      0 2 * * * /opt/dialog-survey/scripts/backup.sh >> /var/log/dialog-survey-backup.log 2>&1
# Or with systemd:         see docs/operations.md for the timer unit.
set -eu

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required (postgres://user:pass@host:port/db)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dialog-survey}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
HOSTNAME_TAG="$(hostname -s 2>/dev/null || echo host)"
TARGET="${BACKUP_DIR}/dialog-survey-${HOSTNAME_TAG}-${TIMESTAMP}.dump"
LOG_TAG="[backup ${TIMESTAMP}]"

log() {
  echo "${LOG_TAG} $1"
}

fail() {
  echo "${LOG_TAG} ERROR: $1" >&2
  exit 1
}

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found in PATH"

mkdir -p "${BACKUP_DIR}" || fail "cannot create backup directory ${BACKUP_DIR}"

log "starting backup to ${TARGET}"
pg_dump --format=custom --no-owner --no-privileges \
  --file="${TARGET}" \
  "${DATABASE_URL}" || fail "pg_dump failed (see PostgreSQL output above)"

# Custom-format dumps are already compressed; verify the file is non-empty.
if [ ! -s "${TARGET}" ]; then
  rm -f "${TARGET}"
  fail "pg_dump produced an empty file, removed"
fi

SIZE="$(du -h "${TARGET}" | cut -f1)"
log "backup completed: ${TARGET} (${SIZE})"

DELETED=$(find "${BACKUP_DIR}" -name 'dialog-survey-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  log "retention: removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

log "done"
