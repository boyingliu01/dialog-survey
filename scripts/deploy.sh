#!/usr/bin/env bash
# deploy.sh — One-click deployment for Interview Bot
#
# Usage:
#   bash scripts/deploy.sh [production|staging]
#
# Prerequisites:
#   - Node.js >= 20.19.0
#   - PostgreSQL running and accessible via DATABASE_URL
#   - .env file configured (or .env.production / .env.staging)
set -euo pipefail

ENV="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HEALTH_URL="http://localhost:${PORT:-3001}/health"

# Detect platform
IS_WINDOWS=false
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  IS_WINDOWS=true
  log_warn "Windows detected - PM2 is unstable, using direct node mode"
fi
HEALTH_RETRIES=10
HEALTH_INTERVAL=3

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

cd "$PROJECT_DIR"

# ── Phase 1: Prerequisites ──────────────────────────────────────────────
log_info "Checking prerequisites for $ENV deployment..."

# Node.js version check (semver >= 20.19.0, not major-only)
NODE_VERSION_RAW=$(node -v | sed 's/^v//')
NODE_MAJOR=${NODE_VERSION_RAW%%.*}
NODE_REST=${NODE_VERSION_RAW#*.}
NODE_MINOR=${NODE_REST%%.*}
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  log_error "Node.js >= 20.19.0 required, got v$NODE_VERSION_RAW"
  exit 1
fi
log_info "✓ Node.js v$NODE_VERSION_RAW"

# PostgreSQL check
if ! command -v psql &>/dev/null; then
  log_warn "psql not found — skipping database check"
elif [ -n "${DATABASE_URL:-}" ]; then
  if ! psql "$DATABASE_URL" -c "SELECT 1" 2>/dev/null; then
    log_error "PostgreSQL not reachable at DATABASE_URL"
    exit 1
  fi
  log_info "✓ PostgreSQL reachable"
else
  log_warn "DATABASE_URL not set — skipping database check"
fi

# .env file check
ENV_FILE=".env"
if [ "$ENV" = "production" ] && [ -f ".env.production" ]; then
  ENV_FILE=".env.production"
elif [ "$ENV" = "staging" ] && [ -f ".env.staging" ]; then
  ENV_FILE=".env.staging"
fi

if [ ! -f "$ENV_FILE" ]; then
  log_error "$ENV_FILE not found. Copy .env.example and configure it first."
  exit 1
fi
log_info "✓ Using $ENV_FILE"

# ── Phase 2: Stop existing service (prevent Prisma DLL file lock) ──────
log_info "Stopping existing service..."
if [ "$IS_WINDOWS" = false ] && command -v pm2 &>/dev/null; then
  pm2 delete dialog-survey 2>/dev/null || true
fi
pkill -f "node dist/src/server" 2>/dev/null || true
sleep 2
log_info "✓ Existing service stopped"

# ── Phase 3: Install dependencies ──────────────────────────────────────
log_info "Installing dependencies..."
npm ci --ignore-scripts || npm install
log_info "✓ Dependencies installed"

# ── Phase 4: Prisma setup ──────────────────────────────────────────────
log_info "Setting up Prisma..."
npx prisma generate
# Issue #152: migrations (prisma/migrations/) are the source of truth —
# migrate deploy is replayable and rollback-able, unlike `db push`.
if ! npx prisma migrate deploy; then
  # Upgrades from <=v1.9: the DB was created by the old push-based workflow,
  # so tables exist but there is no migration history — the init migration
  # collides. Baseline it once instead of failing with a raw P3005/P3018 dump.
  log_warn "migrate deploy failed — this database may predate issue #152"
  log_warn "(created via the old schema-push flow: tables exist, migration history does not)."
  log_warn "If the schema is already current, baseline the initial migration once:"
  log_warn "  npx prisma migrate resolve --applied 20261004000000_init"
  log_warn "then re-run this script. See DEPLOY.md 'Database Rollback'."
  exit 1
fi
log_info "✓ Prisma ready"

# ── Phase 5: Build ─────────────────────────────────────────────────────
log_info "Building production bundle..."
npm run build
log_info "✓ Build complete"

# ── Phase 6: Quality gates (skip in production, run in staging) ────────
if [ "$ENV" = "staging" ]; then
  log_info "Running quality gates (staging)..."
  npm run type-check
  npm run lint
  npm run lint:prisma
  log_info "✓ Quality gates passed"
else
  log_info "Skipping quality gates for production deploy (run manually before deploy)"
fi

# ── Phase 7: Start service ─────────────────────────────────────────────
log_info "Starting Interview Bot..."
export NODE_ENV="$ENV"

if [ "$IS_WINDOWS" = true ]; then
  # Windows: direct node (PM2 is unstable)
  mkdir -p logs
  nohup node dist/src/server.js > logs/server.log 2>&1 &
  log_info "✓ Started directly (PID: $!, Windows mode)"
elif command -v pm2 &>/dev/null && [ -f "ecosystem.config.cjs" ]; then
  # Linux: PM2 mode
  pm2 start ecosystem.config.cjs --env "$ENV"
  log_info "✓ Started via PM2"
else
  # Fallback: direct node mode
  mkdir -p logs
  nohup node dist/src/server.js > logs/server.log 2>&1 &
  log_info "✓ Started directly (PID: $!)"
  log_warn "Consider installing PM2 for production process management:"
  log_warn "  npm install -g pm2 && pm2 start ecosystem.config.cjs"
fi

# ── Phase 8: Health check ──────────────────────────────────────────────
log_info "Waiting for service to start..."
sleep 2

for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -sf "$HEALTH_URL" 2>/dev/null || echo "{}")
    log_info "✓ Service healthy!"
    log_info "Health check response: $HEALTH_RESPONSE"
    echo ""
    echo "  Access: http://localhost:${PORT:-3001}"
    echo "  Admin:  http://localhost:${PORT:-3001}/admin"
    echo "  Health: $HEALTH_URL"
    echo ""
    exit 0
  fi
  log_warn "Health check $i/$HEALTH_RETRIES failed, retrying in ${HEALTH_INTERVAL}s..."
  sleep "$HEALTH_INTERVAL"
done

log_error "Service failed to start after $HEALTH_RETRIES attempts"
log_error "Check logs:"
if [ -f "logs/server.log" ]; then
  tail -50 logs/server.log
fi

if command -v pm2 &>/dev/null; then
  echo ""
  log_error "PM2 logs:"
  pm2 logs dialog-survey --lines 20 --nostream 2>/dev/null || true
fi

exit 1
