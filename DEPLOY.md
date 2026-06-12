# Deployment Guide — Interview Bot

## Overview

Interview Bot supports **one-click deployment** to any Linux machine with Node.js 20+ and PostgreSQL 14+.

## Quick Deploy

```bash
# 1. Copy project to target machine
git clone <repo-url> interview-bot && cd interview-bot

# 2. Configure environment
cp .env.production.example .env.production
# Edit .env.production with actual values (see Configuration section below)

# 3. Deploy
bash scripts/deploy.sh
# or: npm run deploy
```

The deploy script will:
1. ✓ Check Node.js version (>= 20.0.0)
2. ✓ Verify PostgreSQL connectivity
3. ✓ Install dependencies (`npm ci`)
4. ✓ Generate Prisma client + sync schema
5. ✓ Build production bundle (`tsc`)
6. ✓ Start the service (PM2 if available, otherwise direct)
7. ✓ Verify health endpoint

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
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql
```

```sql
CREATE USER interview_bot WITH PASSWORD 'your-secure-password';
CREATE DATABASE interview_bot OWNER interview_bot;
GRANT ALL PRIVILEGES ON DATABASE interview_bot TO interview_bot;
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
DASHSCOPE_API_KEY=sk-xxx         # LLM API key
DINGTALK_CLIENT_ID=xxx           # DingTalk Stream credentials
DINGTALK_CLIENT_SECRET=xxx
DINGTALK_AGENT_ID=xxx
ENCRYPTION_KEY=your-32-byte-hex  # Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
ADMIN_API_KEY=your-secret        # Admin dashboard auth
LOG_LEVEL=info                   # info | warn | error (debug for troubleshooting)
```

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `REPORTS_DIR` | `./reports` | Report storage path |
| `MAX_LLM_RETRIES` | `2` | LLM retry attempts |
| `LLM_TIMEOUT` | `30000` | LLM request timeout (ms) |
| `FUN_ASR_API_KEY` | — | Speech-to-text API key |
| `PUBLIC_URL` | — | Public callback URL |

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
pm2 logs interview-bot    # View logs
pm2 monit                 # Resource monitoring
pm2 stop interview-bot    # Stop
pm2 restart interview-bot # Restart
pm2 delete interview-bot  # Remove from PM2

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
pm2 logs interview-bot # Log stream
pm2 info interview-bot # Process details
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
}" | sudo tee /etc/logrotate.d/interview-bot
```

## Rollback

### Code Rollback
```bash
# Stop current version
pm2 stop interview-bot

# Checkout previous version
git checkout <previous-commit>

# Rebuild and restart
npm ci && npx prisma generate && npm run build
pm2 restart interview-bot
```

### Database Rollback
```bash
# Prisma supports data migrations for schema changes
# Before any schema change, create a backup:
pg_dump -U interview_bot interview_bot > backup-$(date +%Y%m%d).sql

# Restore if needed:
psql -U interview_bot interview_bot < backup-20260612.sql
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
- [ ] `ADMIN_API_KEY` is strong and unique
- [ ] Database user has minimal privileges (no superuser)
- [ ] PostgreSQL password is strong
- [ ] HTTPS enabled (reverse proxy or certbot)
- [ ] Firewall blocks unnecessary ports (`ufw allow 3001` only)
- [ ] Log files are not world-readable
- [ ] Node.js security updates applied (`npm audit`)
