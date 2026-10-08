#!/bin/sh
# Restore a Dialog Survey backup produced by scripts/backup.sh (issue #179).
#
# Usage:
#   ./scripts/restore.sh /path/to/dialog-survey-host-20261008-020000.dump
#
# Environment:
#   DATABASE_URL   postgres://user:pass@host:port/db   (either this or PG* below, the TARGET database)
#   PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE   standard libpq variables
#                  (preferred: keeps the password out of the process list)
#   FORCE_RESTORE  set to 1 to skip the interactive confirmation — ALSO
#                  requires RESTORE_FORCE_CONFIRM=1 (destructive double guard)
#
# The restore REPLACES the schema and data of the target database
# (--clean --if-exists). Runbook: docs/operations.md.
set -eu

BACKUP_FILE="${1:?usage: ./scripts/restore.sh <backup.dump>}"

if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
  echo "ERROR: set DATABASE_URL, or standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE variables" >&2
  exit 1
fi

LOG_TAG="[restore $(date +%H%M%S)]"

log() {
  echo "${LOG_TAG} $1"
}

fail() {
  echo "${LOG_TAG} ERROR: $1" >&2
  exit 1
}

if [ -n "${DATABASE_URL:-}" ]; then
  log "target database: $(echo "${DATABASE_URL}" | sed -E 's#//[^@]+@#//***@#')"
else
  log "target database: ${PGDATABASE:-<unset>}@${PGHOST:-<unset>} (via PG* environment)"
fi
log "backup file:     ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

[ -f "${BACKUP_FILE}" ] || fail "backup file not found: ${BACKUP_FILE}"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found in PATH"

if [ "${FORCE_RESTORE:-0}" != "1" ]; then
  printf "This will REPLACE all data in the target database. Type 'RESTORE' to continue: "
  read -r ANSWER
  [ "${ANSWER}" = "RESTORE" ] || fail "aborted by operator"
else
  # Double-guard: FORCE_RESTORE alone must not let a stray automation run
  # wipe a database. Code-walkthrough F7.
  [ "${RESTORE_FORCE_CONFIRM:-0}" = "1" ] || fail "FORCE_RESTORE also requires RESTORE_FORCE_CONFIRM=1 (destructive-operation double guard)"
fi

log "verifying backup archive"
pg_restore --list "${BACKUP_FILE}" >/dev/null 2>&1 || fail "backup file is not a valid pg_dump custom archive"

log "restoring (this replaces schema and data)"
# With PG* env variables, pg_restore picks the target from PGDATABASE/PGHOST
# automatically; with DATABASE_URL it is passed explicitly via --dbname.
set -- --clean --if-exists --no-owner --no-privileges
if [ -n "${DATABASE_URL:-}" ]; then
  set -- "$@" --dbname="${DATABASE_URL}"
fi
set -- "$@" "${BACKUP_FILE}"
pg_restore "$@" || fail "pg_restore failed (see PostgreSQL output above)"

log "restore completed. Restart the application and verify /health before resuming traffic."
