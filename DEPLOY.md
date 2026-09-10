# Deployment Guide — Dialog Survey

## Overview

Dialog Survey supports **one-click deployment** to any Linux machine with Node.js 20+ and PostgreSQL 14+.

## Quick Deploy

```bash
# One-command install and run
npx dialog-survey install
npx dialog-survey start
```

The installer will:
1. ✓ Check Node.js version
2. ✓ Verify PostgreSQL connectivity
3. ✓ Check port availability (3001)
4. ✓ Install PM2 process manager
5. ✓ Copy application files to `~/.dialog-survey/`
6. ✓ Generate admin credentials (auto-generated password shown once)
7. ✓ Generate `.env` from your configuration (including session keys)
8. ✓ Install production dependencies
9. ✓ Generate Prisma client and sync schema
10. ✓ Build the production bundle
11. ✓ Start the service via PM2
12. ✓ Verify health endpoint

## Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | >= 20.0.0 | Use `nvm` for version management |
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
ENCRYPTION_KEY=<YOUR_32_BYTE_HEX>     # Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
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
| `MAX_LLM_RETRIES` | `2` | LLM retry attempts |
| `LLM_TIMEOUT` | `30000` | LLM request timeout (ms) |
| `PUBLIC_URL` | — | Public callback URL |

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
npx prisma db push
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

## Health Checks

```bash
# Basic health
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","database":"connected","timestamp":"..."}
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
```bash
# Prisma supports data migrations for schema changes
# Before any schema change, create a backup:
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
npm run build && node dist/src/server.ts
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
# Reset and regenerate
npx prisma generate
npx prisma db push

# Check schema
cat prisma/schema.prisma
```

## Performance Tuning

### Production Defaults
- **Log level**: `info` (JSON format, no pretty printing)
- **DB connection limit**: Environment-specific
- **Memory limit**: 500MB (PM2 `max_memory_restart`)
- **Auto-restart**: Enabled with exponential backoff

### Scaling
For >100 concurrent interviews:
1. Use pgBouncer for connection pooling
2. Increase PM2 `max_memory_restart` to `1G`
3. Run multiple PM2 instances behind a load balancer
4. Use Redis for session sharing (future)

## Security Checklist

- [ ] `ENCRYPTION_KEY` is 32-byte random hex (not default)
- [ ] `ADMIN_PASSWORD_HASH` is a bcrypt hash (cost 12) of a strong password; password not committed anywhere
- [ ] `SESSION_SECRET` is 32 random bytes and `SESSION_SALT` is 16 random bytes — regenerate per environment
- [ ] `ADMIN_API_KEY` (optional) is set only when automation needs it, and is strong and unique
- [ ] Database user has minimal privileges (no superuser)
- [ ] PostgreSQL password is strong
- [ ] HTTPS enabled (reverse proxy or certbot)
- [ ] Firewall blocks unnecessary ports (`ufw allow 3001` only)
- [ ] Log files are not world-readable
- [ ] Node.js security updates applied (`npm audit`)
