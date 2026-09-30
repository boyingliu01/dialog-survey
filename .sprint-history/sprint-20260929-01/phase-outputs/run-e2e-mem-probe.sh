#!/usr/bin/env bash
set -u
export PATH="/c/Program Files/nodejs:/c/Users/think/AppData/Roaming/npm:$PATH"
cd "$(dirname "$0")/../.." || exit 1
ROOT="$PWD"
PS="/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
PEAK="$ROOT/.sprint-state/phase-outputs/.e2e-mem-peak.txt"
STOP="$ROOT/.sprint-state/phase-outputs/.e2e-mem-stop.txt"
rm -f "$PEAK" "$STOP"
echo "start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
node node_modules/vitest/vitest.mjs run tests/e2e/*.e2e.test.ts > .sprint-state/phase-outputs/e2e-memory-run.log 2>&1 &
VPID=$!
"$PS" -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$ROOT/.sprint-state/phase-outputs/mem-tree-sampler.ps1")" -OutFile "$(cygpath -w "$PEAK")" -StopFile "$(cygpath -w "$STOP")" &
SPID=$!
wait "$VPID"
VEXIT=$?
touch "$STOP"
wait "$SPID"
echo "vitest_exit=$VEXIT end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat "$PEAK"
tail -6 .sprint-state/phase-outputs/e2e-memory-run.log
