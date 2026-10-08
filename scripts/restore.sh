#!/bin/sh
# Restore a Dialog Survey backup produced by scripts/backup.sh (issue #179).
#
# Usage:
#   ./scripts/restore.sh /path/to/dialog-survey-host-20261008-020000.dump
#
# Environment:
#   DATABASE_URL   postgres://user:pass@host:port/db   (required, the TARGET database)
#   FORCE_RESTORE  set to 1 to skip the interactive confirmation
#
# The restore REPLACES the schema and data of the target database
# (--clean --if-exists). Runbook: docs/operations.md.
set -eu

BACKUP_FILE="${1:?usage: ./scripts/restore.sh <backup.dump>}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required (postgres://user:pass@host:port/db)}"

LOG_TAG="[restore $(date +%H%M%S)]"

log() {
  echo "${LOG_TAG} $1"
}

fail() {
  echo "${LOG_TAG} ERROR: $1" >&2
  exit 1
}

[ -f "${BACKUP_FILE}" ] || fail "backup file not found: ${BACKUP_FILE}"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found in PATH"

log "target database: $(echo "${DATABASE_URL}" | sed -E 's#//[^@]+@#//***@#')"
log "backup file:     ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

if [ "${FORCE_RESTORE:-0}" != "1" ]; then
  printf "This will REPLACE all data in the target database. Type 'RESTORE' to continue: "
  read -r ANSWER
  [ "${ANSWER}" = "RESTORE" ] || fail "aborted by operator"
fi

log "verifying backup archive"
pg_restore --list "${BACKUP_FILE}" >/dev/null 2>&1 || fail "backup file is not a valid pg_dump custom archive"

log "restoring (this replaces schema and data)"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="${DATABASE_URL}" \
  "${BACKUP_FILE}" || fail "pg_restore failed (see PostgreSQL output above)"

log "restore completed. Restart the application and verify /health before resuming traffic."
