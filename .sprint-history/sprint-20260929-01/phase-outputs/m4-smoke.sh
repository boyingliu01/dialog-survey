#!/usr/bin/env bash
# M4 smoke suite (task #16) — Windows Git Bash.
# Fresh `npm pack` of HEAD -> extract (no TS source tree) -> boot scenarios:
#   P   = pack layout (dist+views+public+prisma+prisma.config.ts)      -> expect PASS
#   L1b = P with unreachable DB                                        -> expect designed fail-fast
#   L2  = P minus public/ (pre-fix runner emulation, same dist)        -> expect resolve-asset error
# Evidence: m4-smoke.log (+ per-scenario server logs under the temp layout dir)
set -uo pipefail
export PATH="/c/Program Files/nodejs:$PATH"

ROOT=/d/projects/dialog-survey/.worktrees/sprint-20260929-01
ROOT_WIN='D:/projects/dialog-survey/.worktrees/sprint-20260929-01'
BASE=/c/Users/think/AppData/Local/Temp/m4-smoke
BASE_WIN='C:/Users/think/AppData/Local/Temp/m4-smoke'
LOG="$ROOT/.sprint-state/phase-outputs/m4-smoke.log"
DB_OK='postgresql://investigator:zhulaoda@localhost:5432/dialog_survey_test'
DB_BAD='postgresql://investigator:zhulaoda@localhost:5999/dialog_survey_test'
P_PORT=3921; B_PORT=3922; L2_PORT=3923

exec > "$LOG" 2>&1
echo "=== M4 smoke suite $(date -Is) ==="

probe() { # url label
  local resp code body size
  resp=$(curl -s -m 10 -w $'\nHTTPCODE:%{http_code}' "$1" 2>&1) || true
  code=${resp##*HTTPCODE:}
  body=${resp%$'\n'HTTPCODE:*}
  size=$(printf '%s' "$body" | wc -c)
  echo "--- $2 -> HTTP $code (${size}b)"
  printf '%s\n' "$body" | head -c 400
  echo
}

# ---------- 0. fresh pack + extraction ----------
cd "$ROOT"
rm -rf "$BASE/l1p" && mkdir -p "$BASE/l1p"
TARBALL=$(npm pack --pack-destination "$BASE" 2>/dev/null | tail -1)
[ -z "$TARBALL" ] && { echo "FAIL: npm pack produced no tarball"; exit 1; }
echo "tarball: $TARBALL ($(stat -c%s "$BASE/$TARBALL") bytes, sha256 $(sha256sum "$BASE/$TARBALL" | cut -d' ' -f1))"
tar -xzf "$BASE/$TARBALL" -C "$BASE/l1p" --strip-components=1
echo "extracted files: $(find "$BASE/l1p" -type f | wc -l)"
ls "$BASE/l1p"

echo; echo "=== layout assertions (no source tree) ==="
for absent in tsconfig.json tests src/api src/server.ts; do
  if [ -e "$BASE/l1p/$absent" ]; then echo "PRESENT (unexpected): $absent"; else echo "absent OK: $absent"; fi
done
for present in dist/src/server.js dist/src/generated/prisma/client.js src/views/layouts/admin.njk public/css/admin.css prisma/schema.prisma prisma.config.ts package.json ecosystem.config.cjs scripts/cli.mjs; do
  if [ -e "$BASE/l1p/$present" ]; then echo "present OK: $present"; else echo "MISSING (unexpected): $present"; fi
done

echo; echo "=== views diff: worktree vs pack tarball ==="
git ls-files src/views | sed 's|^|package/|' | sort > /tmp/m4-views-wt.txt
tar -tzf "$BASE/$TARBALL" | grep '^package/src/views/' | sort > /tmp/m4-views-pk.txt
if diff /tmp/m4-views-wt.txt /tmp/m4-views-pk.txt > /tmp/m4-views-diff.txt; then
  echo "OK: all $(wc -l < /tmp/m4-views-wt.txt) worktree src/views files present in pack"
else
  echo "FAIL: views diff follows"; cat /tmp/m4-views-diff.txt
fi

node -e "require('fs').symlinkSync('$ROOT_WIN/node_modules', '$BASE_WIN/l1p/node_modules', 'junction')" \
  && echo "node_modules junction OK" || { echo "FAIL: junction"; exit 1; }

# ---------- 1. scenario P: pack layout boot ----------
echo; echo "=== scenario P: pack layout boot (port $P_PORT, real WSL PG) ==="
cd "$BASE/l1p"
env NODE_ENV=production PORT=$P_PORT DATABASE_URL=$DB_OK \
  SESSION_SECRET=smoke-dummy-session-secret-0123456789abcdef SESSION_SALT=abcdef0123456789abcdef0123456789 \
  DINGTALK_CLIENT_ID=smoke-dummy-id DINGTALK_CLIENT_SECRET=smoke-dummy-secret \
  node dist/src/server.js > p-server.log 2>&1 &
P_PID=$!
code=000
for i in $(seq 1 20); do
  code=$(curl -s -m 5 -w '%{http_code}' -o .probe.tmp "http://127.0.0.1:$P_PORT/health" 2>/dev/null || true)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "health reachable: HTTP $code (after ${i}s)"
if [ "$code" = "200" ]; then
  probe "http://127.0.0.1:$P_PORT/health" "GET /health"
  probe "http://127.0.0.1:$P_PORT/admin/login" "GET /admin/login"
  probe "http://127.0.0.1:$P_PORT/css/admin.css" "GET /css/admin.css"
  probe "http://127.0.0.1:$P_PORT/js/htmx.min.js" "GET /js/htmx.min.js"
else
  echo "server boot FAILED — log tail:"; tail -12 p-server.log
fi
kill $P_PID 2>/dev/null; wait $P_PID 2>/dev/null
echo "--- boot log tail ---"; tail -6 p-server.log
sleep 2

# ---------- 2. scenario L1b: unreachable DB ----------
echo; echo "=== scenario L1b: pack layout + unreachable DB (port $B_PORT) ==="
env NODE_ENV=production PORT=$B_PORT DATABASE_URL=$DB_BAD \
  SESSION_SECRET=smoke-dummy-session-secret-0123456789abcdef SESSION_SALT=abcdef0123456789abcdef0123456789 \
  DINGTALK_CLIENT_ID=smoke-dummy-id DINGTALK_CLIENT_SECRET=smoke-dummy-secret \
  node dist/src/server.js > l1b-server.log 2>&1 &
B_PID=$!
alive=0
for i in $(seq 1 15); do kill -0 $B_PID 2>/dev/null || break; alive=1; sleep 1; done
if [ "$alive" = "1" ] && kill -0 $B_PID 2>/dev/null; then
  echo "UNEXPECTED: still running after ${i}s"; kill $B_PID 2>/dev/null; wait $B_PID 2>/dev/null
else
  wait $B_PID; echo "exit=$?"
fi
echo "--- l1b log ---"; tail -8 l1b-server.log

# ---------- 3. scenario L2: pre-fix runner (no public/) ----------
echo; echo "=== scenario L2: pack layout minus public/ (port $L2_PORT) ==="
rm -rf "$BASE/l2/dist" && cp -r "$BASE/l1p/dist" "$BASE/l2/dist"
if [ -d "$BASE/l2/public" ]; then echo "l2 public/ present: yes (unexpected)"; else echo "l2 public/ present: no"; fi
cd "$BASE/l2"
env NODE_ENV=production PORT=$L2_PORT DATABASE_URL=$DB_OK \
  SESSION_SECRET=smoke-dummy-session-secret-0123456789abcdef SESSION_SALT=abcdef0123456789abcdef0123456789 \
  DINGTALK_CLIENT_ID=smoke-dummy-id DINGTALK_CLIENT_SECRET=smoke-dummy-secret \
  node dist/src/server.js > l2-server.log 2>&1 &
L2_PID=$!
alive=0
for i in $(seq 1 15); do kill -0 $L2_PID 2>/dev/null || break; alive=1; sleep 1; done
if [ "$alive" = "1" ] && kill -0 $L2_PID 2>/dev/null; then
  echo "UNEXPECTED: still running after ${i}s"; kill $L2_PID 2>/dev/null; wait $L2_PID 2>/dev/null
else
  wait $L2_PID; echo "exit=$?"
fi
echo "--- l2 log ---"; tail -8 l2-server.log

echo; echo "=== DONE $(date -Is) ==="
