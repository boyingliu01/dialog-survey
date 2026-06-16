#!/usr/bin/env bash
# deploy.sh — One-click deployment for Interview Bot
#
# Usage:
#   bash scripts/deploy.sh [production|staging]
#
# Prerequisites:
#   - Node.js >= 20.0.0
#   - PostgreSQL running and accessible via DATABASE_URL
#   - .env file configured (or .env.production / .env.staging)
set -euo pipefail

ENV="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HEALTH_URL="http://localhost:${PORT:-3001}/health"
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

# Node.js version check
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  log_error "Node.js >= 20.0.0 required, got $(node -v)"
  exit 1
fi
log_info "✓ Node.js $(node -v)"

# PostgreSQL check
if ! command -v psql &>/dev/null; then
  log_warn "psql not found — skipping database check"
elif [ -n "${DATABASE_URL:-}" ]; then
  if ! pg_isready -d "$DATABASE_URL" 2>/dev/null; then
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
if command -v pm2 &>/dev/null; then
  pm2 delete dialog-survey 2>/dev/null || true
fi
pkill -f "dist/src/server" 2>/dev/null || true
sleep 2
log_info "✓ Existing service stopped"

# ── Phase 3: Install dependencies ──────────────────────────────────────
log_info "Installing dependencies..."
npm ci --ignore-scripts || npm install
log_info "✓ Dependencies installed"

# ── Phase 4: Prisma setup ──────────────────────────────────────────────
log_info "Setting up Prisma..."
npx prisma generate
npx prisma db push --accept-data-loss
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

# PM2 mode (if available)
if command -v pm2 &>/dev/null && [ -f "ecosystem.config.cjs" ]; then
  pm2 start ecosystem.config.cjs --env "$ENV"
  log_info "✓ Started via PM2"
else
  # Direct node mode
  mkdir -p logs
  nohup node dist/src/server.ts > logs/server.log 2>&1 &
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
