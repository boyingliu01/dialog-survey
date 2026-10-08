# Operations Runbook — Dialog Survey

> Updated: 2026-10-08 (issues #178 #179). Covers scheduled backups, restore drill, and Prometheus scraping.

## 0. Before you rely on this

- **First restore drill is a release gate**: automated backups are NOT considered
  working until one full backup → restore → `/health` verification has been
  completed and recorded (see §2). Until then, treat the data as unprotected.
  The CI `Backup/Restore Drill` job runs this continuously for the scripts
  themselves — the on-server drill validates YOUR backup directory and
  credentials, which CI cannot.
- **Prerequisites**: install `postgresql-client` matching your PostgreSQL major
  version (e.g. `postgresql-client-16` for PG 16) — `pg_dump`/`pg_restore` must be
  on the PATH of the user running the timer.
- **Capacity**: keep free space in `BACKUP_DIR` of ≥ 1.2× the current database
  size; a dump failing midway on a full disk still consumes the temp space.
- **Metrics exposure**: `/metrics` reveals route names, request rates, memory and
  pid. Keep the port firewalled to your monitoring host or set `METRICS_TOKEN`;
  production logs a warning when neither is configured.
- **Scale assumption**: these docs assume a single app instance. With multiple
  replicas, scrape each instance separately (`static_configs` with one target per
  replica) — counters and gauges are per-process.

## 1. Automated backups (issue #179)

`scripts/backup.sh` performs a `pg_dump` in PostgreSQL custom format (`-Fc`, already
compressed) into `BACKUP_DIR`, then prunes backups older than `RETENTION_DAYS`.

### Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | — (or PG* vars) | `postgres://user:pass@host:port/db`; alternatively set standard `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` (preferred — keeps the password out of the process list) |
| `BACKUP_DIR` | `/var/backups/dialog-survey` | must be writable by the cron user; retention only touches `dialog-survey-<this-host>-*.dump` files |
| `RETENTION_DAYS` | `14` | older backups of **this host** are deleted |

### Schedule with cron

```cron
0 2 * * * DATABASE_URL='postgres://...' /opt/dialog-survey/scripts/backup.sh >> /var/log/dialog-survey-backup.log 2>&1
```

### Schedule with systemd (recommended)

`/etc/systemd/system/dialog-survey-backup.service`:

```ini
[Unit]
Description=Dialog Survey database backup

[Service]
Type=oneshot
User=dialog-survey
Environment=DATABASE_URL=postgres://user:pass@host:port/db
Environment=BACKUP_DIR=/var/backups/dialog-survey
Environment=RETENTION_DAYS=14
ExecStart=/opt/dialog-survey/scripts/backup.sh
```

`/etc/systemd/system/dialog-survey-backup.timer`:

```ini
[Unit]
Description=Daily Dialog Survey database backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

If the PostgreSQL client lives outside the default systemd PATH, add:

```ini
[Service]
Environment=PATH=/usr/lib/postgresql/16/bin:/usr/bin:/bin
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dialog-survey-backup.timer
systemctl list-timers | grep dialog-survey
```

### Alerting hook

The script writes one `backup completed` / `ERROR` line per run to stdout/stderr.
Failure alerting requires a consumer — for systemd, ship this unit so
`OnFailure=` has something to call (adapt the webhook URL):

`/etc/systemd/system/notify-admin@.service`:

```ini
[Unit]
Description=Notify admin of failed %i

[Service]
Type=oneshot
# POST the failure to your alerting endpoint (Slack/DingTalk webhook, PagerDuty…)
ExecStart=/usr/bin/curl -fsS -X POST -H "Content-Type: application/json" \
  -d '{"msgtype":"text","text":{"content":"dialog-survey %i FAILED on %H"}}' \
  https://your-webhook.example.com/hook
```

For cron deployments, monitor the log for `ERROR:` lines, or alert on the age of
the newest `dialog-survey-*.dump` in `BACKUP_DIR` (a backup older than ~25h means
the schedule silently broke).

## 2. Restore drill (run monthly)

Restore replaces the target database schema and data (`pg_restore --clean --if-exists`).

```bash
# 1. Pick a recent backup and verify the archive is readable
pg_restore --list /var/backups/dialog-survey/dialog-survey-host-20261008-020000.dump | head

# 2. Restore into a SCRATCH database first (never straight into production)
createdb dialog_survey_restore_test
DATABASE_URL='postgres://.../dialog_survey_restore_test' ./scripts/restore.sh \
  /var/backups/dialog-survey/dialog-survey-host-20261008-020000.dump

# 3. Verify row counts / spot-check data, then promote if this was a real recovery:
#    stop app → restore into the real database → start app → GET /health

# Non-interactive variant for scripts:
FORCE_RESTORE=1 DATABASE_URL='...' ./scripts/restore.sh <file>
```

**Drill checklist**

- [ ] Backup file passes `pg_restore --list`
- [ ] Restore into scratch DB succeeds without errors
- [ ] Row counts match expectations (plans / templates / interviews)
- [ ] App boots against restored DB and `/health` returns `healthy`
- [ ] Restore completed within acceptable RTO; note the elapsed time

## 3. Prometheus scraping (issue #178)

`GET /metrics` exposes Prometheus text format (HTTP request counters/duration,
process uptime and memory). No PII in labels; route labels use the Fastify route
pattern (e.g. `/api/plans/:id`), unmatched requests are labeled `unmatched`.

Optional access control: set `METRICS_TOKEN` in the app environment; scrapers must
then send `Authorization: Bearer <METRICS_TOKEN>`.

```yaml
scrape_configs:
  - job_name: dialog-survey
    metrics_path: /metrics
    scrape_interval: 15s
    authorization:
      type: Bearer
      credentials: <METRICS_TOKEN>   # only when METRICS_TOKEN is set
    static_configs:
      - targets: ['survey.internal:3001']
```

Suggested starter alerts:

- `dialog_survey_http_requests_total{status=~"5.."}` rate > 0 for 5m
- `dialog_survey_process_uptime_seconds` resets outside a deploy window
- `/health` probe failure (blackbox exporter)
