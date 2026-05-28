#!/usr/bin/env bash
set -e

PORT=3000

echo "🔍 Checking port $PORT..."

PID=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -z "$PID" ]; then
  echo "✅ Port $PORT is free."
else
  echo "🗑️  Killing PID $PID on port $PORT..."
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
  echo "✅ Port $PORT freed."
fi

echo ""
echo "🚀 Starting dev server..."
npm run dev
