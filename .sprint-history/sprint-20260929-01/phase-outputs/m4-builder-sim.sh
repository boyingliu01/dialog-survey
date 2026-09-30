#!/usr/bin/env bash
# M4 docker tier-(c) builder-stage simulation: runs the exact Dockerfile builder
# chain (npm ci --ignore-scripts -> npx prisma generate -> npm run build) on a
# clean HEAD checkout inside WSL Ubuntu, then boots the built artifact against
# the local PG and probes /health. Docker itself is unavailable (registry-1.
# docker.io blocked); this is the equivalent-tool substitute.
# Usage: build the archive first on the Windows side:
#   git archive HEAD -o /c/Users/think/AppData/Local/Temp/m4-src.tar
set -uo pipefail
ARCHIVE=/mnt/c/Users/think/AppData/Local/Temp/m4-src.tar
DST=/tmp/m4-builder-sim
LOG=/mnt/d/projects/dialog-survey/.worktrees/sprint-20260929-01/.sprint-state/phase-outputs/m4-builder-sim.log

exec > "$LOG" 2>&1
echo "=== M4 builder simulation (WSL Ubuntu) ==="
echo "date: $(date -Is)"

source "$HOME/.nvm/nvm.sh" || { echo "FAIL: nvm missing"; exit 1; }

rm -rf "$DST"; mkdir -p "$DST"
tar -xf "$ARCHIVE" -C "$DST" || { echo "FAIL: tar extract"; exit 1; }
echo "files extracted: $(find "$DST" -type f | wc -l)"
echo ".nvmrc: $(cat "$DST/.nvmrc")"
echo "archive sha256: $(sha256sum "$ARCHIVE" | cut -d' ' -f1)"

cd "$DST"
if nvm install 20.19 >/tmp/nvm-install.log 2>&1; then
  nvm use 20.19 >/dev/null
else
  echo "WARN: nvm install 20.19 failed; falling back to default"
  tail -5 /tmp/nvm-install.log
  nvm use default >/dev/null
fi
echo "node $(node -v) / npm $(npm -v)"

echo; echo "=== npm ci --ignore-scripts ==="
time npm ci --ignore-scripts
CI_EXIT=$?
echo "npm-ci exit: $CI_EXIT"

if [ "$CI_EXIT" -eq 0 ]; then
  echo; echo "=== npx prisma generate ==="
  time npx prisma generate
  GEN_EXIT=$?
  echo "generate exit: $GEN_EXIT"

  echo; echo "=== npm run build ==="
  time npm run build
  BUILD_EXIT=$?
  echo "build exit: $BUILD_EXIT"
  ls -la dist/src/server.js dist/src/generated/prisma/client.js 2>&1

  echo; echo "=== linux boot + /health (local PG) ==="
  PORT=3905 DATABASE_URL='postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test' \
  SESSION_SECRET='m4-sim-dummy-session-secret-0123456789abcdef' SESSION_SALT='abcdef0123456789abcdef0123456789' \
  DINGTALK_CLIENT_ID='smoke-dummy-id' DINGTALK_CLIENT_SECRET='smoke-dummy-secret' \
  NODE_ENV=production node dist/src/server.js > /tmp/m4-sim-boot.log 2>&1 &
  BPID=$!
  sleep 10
  echo "--- boot log ---"; tail -6 /tmp/m4-sim-boot.log
  echo "--- /health ---"; curl -s -m 10 http://127.0.0.1:3905/health; echo
  echo "--- /admin/login ---"; curl -s -m 10 -o /dev/null -w "HTTP %{http_code} %{size_download}b\n" http://127.0.0.1:3905/admin/login
  kill "$BPID" 2>/dev/null
fi

echo; echo "=== DONE $(date -Is) ==="
