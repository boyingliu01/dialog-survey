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
#
# Only targets that actually exist are reported. The hook consumes this list to
# `git add` the results of a sync, so advertising absent paths would make it
# stage files that do not exist. The canonical order is preserved; it must stay
# identical to TARGETS in scripts/sync-version.cjs.
if [ "${1:-}" = "--list-targets" ]; then
  for target in \
    package.json \
    src/npm-package/package.json \
    plugins/claude-code/.claude-plugin/plugin.json \
    plugins/opencode/package.json \
    src/npm-package/plugins/claude-code/.claude-plugin/plugin.json \
    src/npm-package/plugins/opencode/package.json \
    AGENTS.md; do
    if [ -e "$target" ]; then
      printf '%s\n' "$target"
    fi
  done
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

# Refuse to start unless every precondition holds. The fan-out mutates several files, so
# validating the AGENTS.md header up front keeps a failure from leaving a partially-applied
# release state (e.g. package.json already bumped while AGENTS.md was rejected).
# AGENTS.md is an optional target; a wholly absent file is not a precondition failure.
# This must stay identical to assertPreconditionsMet() in scripts/sync-version.cjs.
if [ -f AGENTS.md ]; then
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const pattern = /^(> (?:Updated|Generated): .*?)\(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\)/m;
    if (!pattern.test(fs.readFileSync("AGENTS.md", "utf8"))) {
      process.stderr.write("sync-version: no blockquote header with a (vX.Y.Z) token found in AGENTS.md\n");
      process.exit(1);
    }
  '
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

# Refresh the version token in the AGENTS.md blockquote header line when present.
# Anchored single-line replacement: exactly one match, and the header must be present in
# the expected format (v prefix + three numeric segments). A missing or format-mismatched
# header is a hard failure rather than a silent skip, so a release can never quietly leave
# AGENTS.md stale. Skipped entirely when AGENTS.md is absent (it is an optional target).
#
# Both header spellings seen in the wild are accepted (`> Updated: ` and the older
# `> Generated: `) so a header rename does not silently disable the fan-out. This must stay
# identical to AGENTS_HEADER_PATTERN in scripts/sync-version.cjs.
if [ -f AGENTS.md ]; then
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const [, version] = process.argv;
    const pattern = /^(> (?:Updated|Generated): .*?)\(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\)/m;
    const content = fs.readFileSync("AGENTS.md", "utf8");
    if (!pattern.test(content)) {
      process.stderr.write("sync-version: no header version token found in AGENTS.md\n");
      process.exit(1);
    }
    const updated = content.replace(pattern, (_match, prefix) => `${prefix}(v${version})`);
    if (updated !== content) fs.writeFileSync("AGENTS.md", updated);
  ' "$NEW_VERSION"
fi

echo "sync-version: package.json targets and AGENTS.md header set to $NEW_VERSION"
