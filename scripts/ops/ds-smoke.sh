#!/usr/bin/env bash
# Post-change acceptance for the Docker deployment (upgrade / restart / config change).
# Exits non-zero if any check fails. Run as root to include the iptables check.
#
# Usage: bash ds-smoke.sh            (sudo bash ds-smoke.sh for the iptables rule)
set -uo pipefail

DS_OPS_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./ds-ops-env.sh
[ -f "$DS_OPS_SELF_DIR/ds-ops-env.sh" ] && . "$DS_OPS_SELF_DIR/ds-ops-env.sh"

APP="${DS_APP:-dialog-survey-app}"
DB="${DS_DB:-dialog-survey-db}"
BASE="${DS_BASE_URL:-http://127.0.0.1:3001}"
NETWORK="${DS_NETWORK:-dialog-survey-src_default}"
pass=0
fail=0
ok() { printf 'PASS  %s\n' "$1"; pass=$((pass + 1)); }
no() { printf 'FAIL  %s\n' "$1"; fail=$((fail + 1)); }

# 1. container state
ast="$(docker inspect -f '{{.State.Status}}/{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)"
dst="$(docker inspect -f '{{.State.Status}}/{{.State.Health.Status}}' "$DB" 2>/dev/null || echo missing)"
[ "$ast" = "running/healthy" ] && ok "app 容器 running/healthy" || no "app 容器=$ast"
[ "$dst" = "running/healthy" ] && ok "db 容器 running/healthy" || no "db 容器=$dst"

# 2. migrations finished (entrypoint moved past migrate-deploy)
top="$(docker top "$APP" 2>/dev/null || true)"
if grep -q 'server-entry' <<<"$top"; then
  ok "app 已进入 server-entry（迁移已完成）"
else
  no "app 未进入 server-entry（可能卡在 migrate-deploy）"
fi

# 3. /health
body="$(curl -sS -m 25 "$BASE/health" 2>/dev/null || true)"
status="$(printf '%s' "$body" | jq -r '.status // empty' 2>/dev/null)"
if [ "$status" = "healthy" ]; then
  ok "/health healthy"
else
  no "/health=$( [ -n "$status" ] && printf '%s' "$status" || printf '无响应') $(printf '%s' "$body" | jq -c '.checks // {}' 2>/dev/null)"
fi
for k in db llm dingtalk; do
  v="$(printf '%s' "$body" | jq -r ".checks.$k.status // empty" 2>/dev/null)"
  [ "$v" = "ok" ] && ok "  /health.$k ok" || no "  /health.$k=${v:-缺省}"
done

# 4. DingTalk Stream
stream_last="$(docker logs --since 24h "$APP" 2>&1 | grep -E 'Connected to DingTalk Stream|Stream connection failed' | tail -1)"
case "$stream_last" in
  *"Connected to DingTalk Stream"*) ok "钉钉 Stream 已连接" ;;
  *) no "钉钉 Stream 未连接: ${stream_last:-无日志}" ;;
esac

# 5. admin pages
key="$(docker exec "$APP" printenv ADMIN_API_KEY 2>/dev/null || true)"
if [ -n "$key" ]; then
  for p in /admin /admin/analytics /admin/reports; do
    code="$(curl -s -m 30 -o /dev/null -w '%{http_code}' -H "x-admin-key: $key" "$BASE$p")"
    [ "$code" = "200" ] && ok "$p 200" || no "$p = $code"
  done
else
  no "取不到 ADMIN_API_KEY，无法验后台页面"
fi

# 6. container -> database TCP
if docker exec "$APP" node -e '
const net = require("net");
const s = net.connect(5432, "postgres", () => { console.log("OK"); s.destroy(); });
s.setTimeout(5000, () => { console.log("TIMEOUT"); s.destroy(); process.exit(1); });
s.on("error", (e) => { console.log(e.code); process.exit(1); });
' 2>/dev/null | grep -q '^OK$'; then
  ok "app -> postgres:5432 TCP"
else
  no "app -> postgres:5432 TCP 不通"
fi

# 7. container -> LLM gateway 443 (host taken from the app env, not hard-coded)
llm_host="${DS_LLM_HOST:-$(docker exec "$APP" printenv LLM_BASE_URL 2>/dev/null | sed -E 's#^[a-z]+://##; s#[:/].*##')}"
if [ -z "$llm_host" ]; then
  printf 'SKIP  外网连通性检查（未取到 LLM_BASE_URL，可用 DS_LLM_HOST 指定）\n'
elif docker exec "$APP" node -e "
const net = require('net');
const s = net.connect(443, process.argv[1], () => { console.log('OK'); s.destroy(); });
s.setTimeout(8000, () => { console.log('TIMEOUT'); s.destroy(); process.exit(1); });
s.on('error', (e) => { console.log(e.code); process.exit(1); });
" "$llm_host" 2>/dev/null | grep -q '^OK$'; then
  ok "app -> $llm_host:443 TCP"
else
  no "app -> $llm_host:443 TCP 不通"
fi

# 8. per-network iptables forward rules (needs root; failure carries the verified fix)
if [ "$(id -u)" -eq 0 ]; then
  br="br-$(docker network inspect "$NETWORK" --format '{{.Id}}' 2>/dev/null | cut -c1-12)"
  if iptables -C DOCKER-FORWARD -i "$br" -j ACCEPT 2>/dev/null; then
    ok "iptables FORWARD 规则存在（$br）"
  else
    no "缺少 iptables FORWARD 规则（$br）-> sudo systemctl restart docker"
  fi
else
  printf 'SKIP  iptables 规则检查需要 root（sudo bash %s）\n' "$0"
fi

echo
echo "结果: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
