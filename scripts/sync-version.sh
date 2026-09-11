#!/usr/bin/env bash
set -euo pipefail

# Propagate the VERSION file (canonical source, staged by the release flow)
# OUT to package.json targets and the AGENTS.md header version token.
# Usage: bash scripts/sync-version.sh   (SYNC_VERSION_ROOT overrides the repo
# root so tests can run against fixtures instead of the live repository)

ROOT="${SYNC_VERSION_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# Pure query mode for the pre-commit hook: prints the fan-out target list so
# the hook never has to hardcode a second copy of it. No validation, no writes.
if [ "${1:-}" = "--list-targets" ]; then
  printf '%s\n' \
    package.json \
    src/npm-package/package.json \
    plugins/claude-code/.claude-plugin/plugin.json \
    plugins/opencode/package.json \
    src/npm-package/plugins/claude-code/.claude-plugin/plugin.json \
    src/npm-package/plugins/opencode/package.json \
    AGENTS.md
  exit 0
fi

if [ ! -f VERSION ]; then
  echo "sync-version: VERSION file not found in $ROOT" >&2
  exit 1
fi

NEW_VERSION="$(LC_ALL=C tr -d '[:space:]' < VERSION)"
if ! printf '%s' "$NEW_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "sync-version: refusing invalid VERSION value: '$NEW_VERSION'" >&2
  exit 1
fi

update_package_target() {
  local pkg="$1"
  [ -f "$pkg" ] || return 0
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const [, target, version] = process.argv;
    const json = JSON.parse(fs.readFileSync(target, "utf8"));
    json.version = version;
    fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
  ' "$pkg" "$NEW_VERSION"
}

for pkg in package.json src/npm-package/package.json \
           plugins/claude-code/.claude-plugin/plugin.json \
           plugins/opencode/package.json \
           src/npm-package/plugins/claude-code/.claude-plugin/plugin.json \
           src/npm-package/plugins/opencode/package.json; do
  update_package_target "$pkg"
done

# Refresh the version token in the AGENTS.md header when present.
if [ -f AGENTS.md ]; then
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const [, version] = process.argv;
    const content = fs.readFileSync("AGENTS.md", "utf8");
    const updated = content.replace(/(\(v)\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\))/, `$1${version}$3`);
    if (updated !== content) fs.writeFileSync("AGENTS.md", updated);
  ' "$NEW_VERSION"
fi

echo "sync-version: package.json targets and AGENTS.md header set to $NEW_VERSION"
