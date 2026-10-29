# Deployment Guide — Dialog Survey

## Overview

Dialog Survey supports **one-click deployment** to any Linux machine with Node.js 20.19+ and PostgreSQL 14+.

## Quick Deploy

```bash
# One-command install and run
npx dialog-survey install
npx dialog-survey start
```

The installer will:
1. ✓ Check Node.js version (>= 20.19.0)
2. ✓ Verify PostgreSQL connectivity
3. ✓ Check port availability (3001)
4. ✓ Install PM2 process manager
5. ✓ Copy application files to `~/.dialog-survey/`
6. ✓ Generate admin credentials (auto-generated password shown once)
7. ✓ Generate `.env` from your configuration (including session keys)
8. ✓ Install production dependencies (`npm install --omit=dev`)
9. ✓ Install the Playwright Chromium browser (PDF export)
10. ✓ Apply database migrations with `prisma migrate deploy` (Prisma 7)
11. ✓ Start the service via PM2
12. ✓ Verify health endpoint

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | >= 20.19.0 | Use `nvm` for version management |
| PostgreSQL | 14+ | Dedicated database recommended |
| RAM | >= 512MB | 1GB+ recommended |
| Disk | ~200MB | For code + node_modules + logs |
| OS | Linux (Ubuntu 22.04+, Debian 12+, CentOS 9+) | Windows/macOS supported for dev only |

### Install Prerequisites (Ubuntu/Debian)

```bash
# Node.js 20 (or 22/24 with --node-major=22)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# PM2 process manager
sudo npm install -g pm2

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql
```

```sql
CREATE USER dialog_survey WITH PASSWORD 'your-secure-password';
CREATE DATABASE dialog_survey OWNER dialog_survey;
GRANT ALL PRIVILEGES ON DATABASE dialog_survey TO dialog_survey;
\q
```

### Install Prerequisites (PM2 - Optional but Recommended)

```bash
sudo npm install -g pm2
pm2 startup  # auto-start on boot
pm2 save     # save current process list
```

## Configuration

### Environment Files

| File | Purpose |
|------|---------|
| `.env` | Default configuration (development) |
| `.env.production` | Production overrides |
| `.env.staging` | Staging overrides |
| `.env.production.example` | Template — copy and fill |

### Required Production Variables

```bash
NODE_ENV=production              # Must be "production"
PORT=3001                        # HTTP port (default)
DATABASE_URL="postgresql://..."  # Full connection string
DASHSCOPE_API_KEY=<YOUR_LLM_API_KEY>  # LLM API key
DINGTALK_CLIENT_ID=<YOUR_CLIENT_ID>   # DingTalk Stream credentials
DINGTALK_CLIENT_SECRET=<YOUR_CLIENT_SECRET>
DINGTALK_AGENT_ID=<YOUR_AGENT_ID>
DISABLE_STARTUP_RESEND=            # Optional: 1/true/yes skips the startup resend of unsent messages
LOG_LEVEL=info                   # info | warn | error (debug for troubleshooting)

# Admin browser login (required for the admin UI)
ADMIN_USERNAME=admin                    # Admin UI username
ADMIN_PASSWORD_HASH=<bcrypt-hash>       # Generate: node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 12).then(console.log)"
SESSION_SECRET=<YOUR_64_CHAR_HEX>       # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SALT=<YOUR_32_CHAR_HEX>         # Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `SESSION_MAX_AGE` | `28800` | Admin session inactivity limit (seconds; 28800 = 8 hours) |
| `ADMIN_API_KEY` | — | Optional header-based admin access (`X-Admin-Key`) for automation only |
| `REPORTS_DIR` | `./reports` | Report storage path |
| `LLM_TIMEOUT` | `30000` | LLM request timeout (ms) |
| `ENCRYPTION_KEY` | — | **Deprecated** — not read at runtime (compatibility only; still emitted by `npx dialog-survey install`) |

### Admin Authentication

The admin UI authenticates via a browser login at `/admin/login` using
`ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`. The password is deployment-managed:
there is no online password-change route. To rotate it, see
[Rotate the Admin Password](./README.md#rotate-the-admin-password) in the README.

`ADMIN_API_KEY` is **not** required for the admin UI. Set it only when scripts
or integrations need header-based admin access:

```bash
curl -H "X-Admin-Key: <admin-api-key>" http://localhost:3001/admin
```

`npx dialog-survey install` generates all session/admin variables
automatically and prints the auto-generated admin password once — store it
when the installer shows it.

## Deployment Modes

### Mode 1: Direct Node (Minimal)

```bash
npm run deploy
# or manually:
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

### Mode 2: PM2 Managed (Recommended)

```bash
# PM2 must be installed globally
npm run deploy
# The script detects PM2 and uses ecosystem.config.cjs automatically

# Manual PM2 commands:
pm2 start ecosystem.config.cjs --env production
pm2 logs dialog-survey    # View logs
pm2 monit                 # Resource monitoring
pm2 stop dialog-survey    # Stop
pm2 restart dialog-survey # Restart
pm2 delete dialog-survey  # Remove from PM2

# Auto-start on boot:
pm2 startup
pm2 save
```

### Mode 3: Reverse Proxy (Nginx)

For HTTPS and domain routing:

```nginx
server {
    listen 80;
    server_name interview.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

With Let's Encrypt SSL:
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d interview.example.com
```

> **Proxy caveat**: the app does not enable Fastify `trustProxy`, so behind Nginx every
> client shares the proxy's IP. This affects the admin-login rate limiter (5 failed
> attempts lock out logins for 15 minutes for everyone behind that proxy) and audit-log
> client IPs. Enabling `trustProxy` is deliberately deferred: unless the proxy strips
> client-supplied `X-Forwarded-For`, trusting that header lets callers spoof IPs and
> bypass the limiter entirely. Keep Mode 2 (direct/PM2) for production admin access, or
> harden the proxy before enabling `trustProxy`.

### Mode 4: Docker

The image is a two-stage build on `node:22-slim`. The builder installs everything,
generates the Prisma client, compiles, and then **prunes build-time tooling** — the
runner stage only receives what `dist/` actually imports. Measured: `node_modules`
731 MB → 163 MB, image 1.22 GB → 574 MB.

> **The CJK font must be fetched before building (issue #217).** `assets/fonts/*.otf`
> is a Git LFS object. A clone that never ran `git lfs pull` contains a 133-byte
> pointer file instead — right name, right path, right extension — and the image
> then builds and runs while every exported PDF renders Chinese as blank boxes.
> The build now **fails** with an explicit message instead
> (`scripts/verify-font-asset.mjs`), so run this first:
>
> ```bash
> git lfs install && git lfs pull
> ```

```bash
docker build -t dialog-survey:latest .

docker run -d --name dialog-survey -p 3001:3001 \
  -e DATABASE_URL='postgresql://<user>:<password>@<host>:5432/dialog_survey' \
  -e SESSION_SECRET='<at least 32 chars>' \
  -e SESSION_SALT='<32 hex chars>' \
  -e REPORTS_DIR=/app/reports \
  -v dialog-survey-reports:/app/reports \
  dialog-survey:latest
```

> **`docker run -e` does not interpolate `$`, so a bcrypt hash goes in unescaped
> here.** That is the *opposite* of the compose path below (issue #214) — see
> [Deploy with Docker Compose](#deploy-with-docker-compose) for the `$$` rule.

#### Deploy with Docker Compose

`docker-compose.yml` is the recommended evaluation path, and it is careful about
four things that are easy to get wrong by hand.

**1. Every `$` in a bcrypt hash must be doubled (issue #214).**

`docker compose` interpolates variables inside `env_file` values. A bcrypt hash
reads as `$2b` + `$12` + salt + digest, so compose sees two undefined variables and
replaces them with empty strings. Measured in a container, from an `.env` holding
`$2b$12$<salt><digest>`:

```
unescaped=[$2b$12]                     # the rest was eaten
escaped=  [$2b$12$<salt><digest>]      # correct
```

The symptom is not an error: the service starts, `/health` answers, and the admin
login returns **401 for a correct password forever**. In `.env`:

```bash
ADMIN_PASSWORD_HASH=$$2b$$12$$<salt><digest>
```

`.env.example` carries the same note. A hash that arrives truncated is now
reported as a configuration error (HTTP 500 with an explicit message) instead of
being treated as a wrong password, and the server logs it at `error` level on boot.

**2. `POSTGRES_PASSWORD` is required — there is no default (issue #215).**

`docker-compose.yml` uses `${POSTGRES_PASSWORD:?...}`, so `docker compose up`
refuses to start without it rather than quietly running the database on
`change-me-in-env`. The postgres port is **not published to the host** either: the
app reaches it as `postgres:5432` on the compose network, and a host mapping only
collides with a PostgreSQL you already run and exposes the database to the LAN.
Need `psql` from the host? Use an override, not an edit:

```yaml
# docker-compose.override.yml
services:
  postgres:
    ports: !override
      - "127.0.0.1:${POSTGRES_HOST_PORT:-5432}:5432"
```

`!override` is required: the default merge semantics *append* to `ports`, and the
duplicate mapping fails with a confusing error.

**3. Exported reports live in a named volume (issue #216).**

`reports_data:/app/reports` with `REPORTS_DIR=/app/reports` set explicitly. A
named volume is created by dockerd owned by the image's runtime user (uid 1001
`nodejs`), which is why it is used instead of a bind mount of a host directory
(usually uid 1000) that the container cannot write to. See
[Backup scope for containers](#backup-scope-for-containers) — `postgres_data`
alone is not a complete backup.

**4. The healthcheck asks `/health/ready`, not `/health` (issue #218).**

A degraded deployment (no LLM key, placeholder DingTalk credentials) is a `200`
on `/health` by design — it is a liveness probe — so the container used to show
`healthy` while it could not hold a single interview. `depends_on` and
`restart: unless-stopped` therefore never engaged. Both healthchecks now poll
`/health/ready`, which is `200` only when every dependency works.

> **`SESSION_SALT` is 32 hexadecimal characters, not 16 arbitrary ones.**
> `src/server.ts` does `Buffer.from(salt, 'hex')` and `@fastify/secure-session`
> requires 16 *bytes* after decoding. A 16-character string decodes to 8 bytes and
> fails with `salt must be length 16`, which reads as if 16 characters were given —
> they were; they were just not hex. Generate one with
> `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.

Migrations run automatically before the server starts. The image has no Prisma CLI —
it is pruned away — so `scripts/migrate-deploy.mjs` applies `prisma/migrations/*.sql`
with `pg` and records them in `_prisma_migrations` using Prisma's own schema and
SHA-256 checksums. A database migrated by the image is readable by
`prisma migrate deploy` (Mode 1/2), and vice versa; both directions were verified
against the CLI. Applying is idempotent, so restarts and scale-out replicas are safe.

> **Base image is Debian, not Alpine, on purpose.** `sodium-native` (required by
> `@fastify/secure-session`) ships prebuilt binaries for `linux-x64` (glibc) but not
> `linux-x64-musl`, so an Alpine image cannot load it and dies at boot with
> `Cannot find addon '.' imported from sodium-native/binding.js`. Do not switch the
> base back to `node:22-alpine` without first solving that.

> **Node 22, not 20 (issue #213).** `@fastify/secure-session` pulls
> `@fastify/cookie`, whose `cookie@2` dependency declares `engines.node: >=22`.
> The image, `package.json` `engines` and `.nvmrc` are aligned on 22, and
> `package.json` pins `@fastify/cookie@11.1.0` (the last release still on
> `cookie@1`) so the tree, the manifest and the image agree.
> `tests/docker-engine-consistency.test.ts` fails if any of the three drifts.

To verify the deployed size and schema in one pass:

```bash
docker run --rm dialog-survey:latest du -sh /app/node_modules
docker exec dialog-survey node scripts/migrate-deploy.mjs --dry-run
```

## Health Checks

Two endpoints, two questions (issue #218):

| Endpoint | Question | `healthy` | `degraded` | `unhealthy` |
|----------|----------|-----------|------------|-------------|
| `GET /health` | Is the process alive? | 200 | **200** | 503 |
| `GET /health/ready` | Can it actually work? | 200 | **503** | 503 |

`degraded` means the database is fine but a dependency is not — no LLM key, no
model, placeholder DingTalk credentials. That is a legitimate state for a
read-only deployment, so `/health` keeps answering 200 and stays usable as a
liveness probe; everything that waits for a *working* deployment (container
healthchecks, orchestrators, monitors) must poll `/health/ready`. Both return the
same body, so a monitor can read either:

```bash
curl http://localhost:3001/health
curl -i http://localhost:3001/health/ready   # 503 until the deployment is complete

# Expected response (example):
# {"status":"healthy","timestamp":"...","checks":{"db":{"status":"ok","latencyMs":0},
#  "llm":{"status":"ok"},"dingtalk":{"status":"ok"}}}
# status is "healthy" | "degraded" | "unhealthy"; a failing db check returns HTTP 503.
```

Missing configuration is also reported once at startup, at `error` level, naming
each variable — a container that boots without an LLM key says so in its log
instead of looking healthy:

```
Incomplete deployment configuration (2 issue(s)): no LLM API key configured — every
interview turn will fail; DingTalk credentials are still placeholder values — no
messages will be received
```

## Monitoring

### PM2 Monitoring
```bash
pm2 monit              # Real-time dashboard
pm2 logs dialog-survey # Log stream
pm2 info dialog-survey # Process details
```

### Log Files
```
logs/pm2-out.log       # stdout (PM2 mode)
logs/pm2-error.log     # stderr (PM2 mode)
logs/server.log        # Direct node mode
```

### Log Rotation
PM2 handles log rotation automatically. For direct node:
```bash
sudo apt-get install -y logrotate
echo "logs/server.log {
    daily
    rotate 7
    compress
    missingok
    copytruncate
}" | sudo tee /etc/logrotate.d/dialog-survey
```

### Prometheus Metrics (issue #178)

`GET /metrics` exposes Prometheus text-format metrics: HTTP request counters and
duration histogram (labeled by method + route pattern + status, no PII), process
uptime, and memory usage.

```bash
curl http://localhost:3001/metrics
```

Optional access control — set `METRICS_TOKEN` in `.env`, scrapers must send
`Authorization: Bearer <METRICS_TOKEN>`. `/metrics` reveals route names, request
rates and process memory: keep the port firewalled to your monitoring host or
set the token (production logs a warning when both are missing). Token changes
take effect on process restart. See `docs/operations.md` for a ready-made
`scrape_configs` block and starter alerts.

### Scheduled Backups (issue #179)

```bash
# One-shot manual backup
DATABASE_URL='postgres://...' ./scripts/backup.sh

# Daily 02:00 via cron or systemd timer (recommended) — full setup + restore
# drill runbook: docs/operations.md
```

#### Backup scope for containers

`scripts/backup.sh` dumps the **database**. In a container deployment that is
only part of the backup surface (issue #216) — exported reports are the
deliverable of this product and live outside the database:

| Volume | Holds | Losing it means |
|--------|-------|-----------------|
| `postgres_data` | interviews, templates, plans | everything in the admin UI, permanently |
| `reports_data` | exported PDF/Excel files | the documents already handed to stakeholders cannot be regenerated |

```bash
# Both volumes, named after the compose project (directory name by default)
PROJECT=$(basename "$PWD")
docker run --rm -v "${PROJECT}_postgres_data:/data:ro" -v "$PWD:/backup" \
  docker.m.daocloud.io/library/postgres:16-alpine \
  tar czf /backup/postgres_data-$(date +%F).tar.gz -C /data .
docker run --rm -v "${PROJECT}_reports_data:/data:ro" -v "$PWD:/backup" \
  docker.m.daocloud.io/library/postgres:16-alpine \
  tar czf /backup/reports_data-$(date +%F).tar.gz -C /data .
```

Keep `backup.sh`'s `pg_dump` output as the primary database backup (it is
restorable into any PostgreSQL and is what the restore drill exercises); the
volume copy is the belt-and-braces path for the container case.

> **Do not switch `reports_data` to a bind mount without fixing ownership.**
> `./reports:/app/reports` binds a host directory that is usually owned by uid
> 1000, while the container process is uid 1001 (`nodejs`) — export then fails
> with `EACCES`. Either keep the named volume (recommended), or
> `sudo chown -R 1001:1001 ./reports` and accept that the image's runtime user
> is now a deployment constraint.

## Rollback

### Code Rollback
```bash
# Stop current version
pm2 stop dialog-survey

# Checkout previous version
git checkout <previous-commit>

# Rebuild and restart
npm ci && npx prisma generate && npm run build
pm2 restart dialog-survey
```

### Database Rollback

Schema changes are versioned as SQL migrations under `prisma/migrations/`
(issue #152 — `db push` was retired because it kept no history and silently
skipped data updates for existing rows).

#### Upgrading a database created by `db push` (≤ v1.9)

Databases built with the old `prisma db push` workflow already contain every
table, but have no `_prisma_migrations` history — so the first
`migrate deploy` collides with the existing objects (`already exists`,
P3005/P3018). Back up first, then baseline the initial migration once:

```bash
pg_dump -U dialog_survey dialog_survey > backup-before-baseline.sql

# Mark the init migration as already applied (does NOT touch data):
npx prisma migrate resolve --applied 20261004000000_init

# From here on, normal deploys work:
npx prisma migrate deploy
```

`scripts/deploy.sh` and the CLI installer print these same instructions when
they detect this situation.

```bash
# Apply pending migrations (deploy, installer, manual):
npx prisma migrate deploy

# Create a new migration after editing prisma/schema.prisma:
npx prisma migrate dev --name <description>

# Before any schema change, keep a data backup anyway:
pg_dump -U dialog_survey dialog_survey > backup-$(date +%Y%m%d).sql

# Restore if needed:
psql -U dialog_survey dialog_survey < backup-20260612.sql
```

## Multi-Environment

```bash
# Staging deployment
bash scripts/deploy.sh staging

# Production deployment
bash scripts/deploy.sh production
```

Staging uses:
- Port 3002 (default)
- Runs quality gates (`type-check`, `lint`, `lint:prisma`)
- Separate environment file (`.env.staging`)

## Troubleshooting

### Service won't start
```bash
# Check logs
tail -50 logs/pm2-error.log

# Verify PostgreSQL is running
pg_isready

# Verify NODE_ENV
echo $NODE_ENV

# Test manually
npm run build && node dist/src/server-entry.js
```

### Port already in use
```bash
# Find process on port
sudo lsof -i :3001

# Kill it
sudo kill <PID>

# OR change port
PORT=3002 bash scripts/deploy.sh
```

### Prisma errors
```bash
# Regenerate the client and re-apply pending migrations
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy

# Check schema
cat prisma/schema.prisma
```

## Performance Tuning

### Capacity Baseline (calibrated with real PostgreSQL, 2026-10-22)
Full methodology and three-way data (PGlite / CI postgres:16 / deployment-host PG14):
`docs/reports/loadtest-baseline-2026-10.md` §6 (issues #180/#183). **All numbers below
are calibrated against real PostgreSQL — safe to use for production sizing.**

- Single instance sustains **~1,100 req/s** of business API traffic on the deployment
  host (read P95 197ms / write P95 222ms at 200 concurrent connections); plan with
  **≥500 req/s** on materially weaker hosts (CI runner measured ~600 req/s); scale
  horizontally beyond that.
- DingTalk message handler chain (in-flight conversations) sustains **80–150
  handler-calls/s per process** at the application layer (measured peak 152, P95 ≤1.5s
  at 200 concurrent; LLM round-trip excluded). **LLM caveat unchanged**: real message
  latency is dominated by the LLM round-trip (hundreds of ms to seconds) — the
  concurrent-user ceiling is governed by your LLM provider's quota and latency, not by
  these numbers.
- Connection pool: pg default **max=10** (PrismaPg, no explicit override). Measured
  over a full 24-scenario run via 1s `pg_stat_activity` sampling: backends stable at
  10–11, zero PG-side lock waits, pool elastically shrinks when idle and refills under
  load. Keep **≤10 connections per instance**; add pgBouncer only for multi-instance
  deployments.
- Metrics/health endpoints are never the bottleneck (>4k req/s).
- Scale-out triggers: read P95 > 1s for 5 min, or message-handler P95 > 500ms.

### Production Defaults
- **Log level**: `info` (JSON format, no pretty printing)
- **DB connection limit**: Environment-specific
- **Memory limit**: 500MB (PM2 `max_memory_restart`)
- **Auto-restart**: Enabled with exponential backoff

### Scaling
For >100 concurrent interviews:
1. Use pgBouncer for connection pooling
2. Increase PM2 `max_memory_restart` to `1G`
3. Run multiple PM2 instances behind a load balancer (note: the login rate limiter is
   in-memory per process — each instance tracks failures independently)
4. Use Redis for session sharing (future)

## Security Checklist

- [ ] `ADMIN_PASSWORD_HASH` is a bcrypt hash (cost 12) of a strong password; password not committed anywhere
- [ ] If deployed with `docker compose`, every `$` in `ADMIN_PASSWORD_HASH` is doubled (`$$2b$$12$$...`, issue #214) — verify with `docker compose exec app printenv ADMIN_PASSWORD_HASH`
- [ ] `POSTGRES_PASSWORD` is set explicitly (compose refuses to start without it — no default)
- [ ] `SESSION_SECRET` is 32 random bytes and `SESSION_SALT` is 16 random bytes — regenerate per environment
- [ ] `ADMIN_API_KEY` (optional) is set only when automation needs it, and is strong and unique
- [ ] Database user has minimal privileges (no superuser)
- [ ] PostgreSQL password is strong
- [ ] Exported reports persist (`docker compose` uses the `reports_data` volume; a bind mount needs uid 1001 ownership)
- [ ] Backup covers **both** `postgres_data` and `reports_data`, and a restore has been drilled (`docs/operations.md`)
- [ ] `/health/ready` answers 200 (a `degraded` deployment is not a finished one)
- [ ] HTTPS enabled (reverse proxy or certbot)
- [ ] Firewall blocks unnecessary ports (`ufw allow 3001` only)
- [ ] Log files are not world-readable
- [ ] Node.js security updates applied (`npm audit`)
