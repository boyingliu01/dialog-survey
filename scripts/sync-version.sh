#!/usr/bin/env bash
set -euo pipefail

# Sync version from package.json (canonical source) to VERSION file
# Usage: bash scripts/sync-version.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -e "console.log(require('./package.json').version)")

echo "$VERSION" > VERSION
echo "✓ VERSION updated to $VERSION"
