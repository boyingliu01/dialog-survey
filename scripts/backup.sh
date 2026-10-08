#!/bin/sh
# Automated database backup for Dialog Survey (issue #179).
#
# Usage:
#   ./scripts/backup.sh                    # one-shot backup
#   BACKUP_DIR=/var/backups RETENTION_DAYS=14 ./scripts/backup.sh
#
# Environment:
#   DATABASE_URL    postgres://user:pass@host:port/db   (either this or PG* below)
#   PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE   standard libpq variables
#                   (preferred: keeps the password out of the process list)
#   BACKUP_DIR      backup target directory            (default /var/backups/dialog-survey)
#   RETENTION_DAYS  delete backups older than N days   (default 14)
#
# Schedule with cron:      0 2 * * * /opt/dialog-survey/scripts/backup.sh >> /var/log/dialog-survey-backup.log 2>&1
# Or with systemd:         see docs/operations.md for the timer unit.
set -eu
# Dumps contain the full database (interviews, user ids, message content — PII).
# Keep them private to the invoking user regardless of cron/systemd umask.
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dialog-survey}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
  echo "ERROR: set DATABASE_URL, or standard PGHOST/PGUSER/PGPASSWORD/PGDATABASE variables" >&2
  exit 1
fi

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

# Write to a temp name first so a failed pg_dump never leaves a truncated
# file that retention could later pick as a restore source.
TMP_TARGET="${TARGET}.partial"

log "starting backup to ${TARGET}"
# When DATABASE_URL is unset, pg_dump falls back to PG* libpq environment
# variables — the password never appears in the process list.
set -- --format=custom --no-owner --no-privileges --file="${TMP_TARGET}"
if [ -n "${DATABASE_URL:-}" ]; then
  set -- "$@" "${DATABASE_URL}"
fi
pg_dump "$@" || {
  rm -f "${TMP_TARGET}"
  fail "pg_dump failed (see PostgreSQL output above)"
}

# Custom-format dumps are already compressed; verify the file is non-empty.
if [ ! -s "${TMP_TARGET}" ]; then
  rm -f "${TMP_TARGET}"
  fail "pg_dump produced an empty file, removed"
fi

mv "${TMP_TARGET}" "${TARGET}"

SIZE="$(du -h "${TARGET}" | cut -f1)"
log "backup completed: ${TARGET} (${SIZE})"

# Prune only this host's dumps — a shared BACKUP_DIR (e.g. NFS) must not
# let one host delete another host's backups. Also remove stale .partial
# files left behind by a SIGKILLed run (code-walkthrough N2).
DELETED=$(find "${BACKUP_DIR}" \( -name "dialog-survey-${HOSTNAME_TAG}-*.dump" -o -name "dialog-survey-${HOSTNAME_TAG}-*.dump.partial" \) -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  log "retention: removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

log "done"
