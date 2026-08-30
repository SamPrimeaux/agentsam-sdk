#!/usr/bin/env bash
# Bump + verify + publish @inneranimalmedia/agentsam-sdk identity alpha line.
#
# Usage:
#   ./scripts/publish-identity-alpha.sh               # bumps .11 → .12
#   ./scripts/publish-identity-alpha.sh 12            # explicit suffix
#   ./scripts/publish-identity-alpha.sh --publish-only
#   ./scripts/publish-identity-alpha.sh --dry-run
#
# Requires: npm logged in as inneranimalmedia (see npm-publish-preflight.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
PUBLISH_ONLY=0
SUFFIX=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --publish-only) PUBLISH_ONLY=1 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$SUFFIX" ]]; then SUFFIX="$arg"; else echo "Unknown arg: $arg" >&2; exit 1; fi
      ;;
  esac
done

set_versions() {
  local version="$1"
  VERSION="$version" node -e "
import { readFileSync, writeFileSync } from 'node:fs';
const version = process.env.VERSION;
for (const rel of ['package.json', 'packages/identity/package.json']) {
  const j = JSON.parse(readFileSync(rel, 'utf8'));
  j.version = version;
  writeFileSync(rel, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('✓ ' + rel + ' -> ' + version);
}
"
  npm install --package-lock-only --ignore-scripts
}

if [[ "$PUBLISH_ONLY" == "1" ]]; then
  VERSION="$(node -p "require('./package.json').version")"
  echo "=== Publish only (no bump) → ${VERSION} ==="
elif [[ -n "$SUFFIX" ]]; then
  VERSION="2.0.0-alpha.identity.${SUFFIX}"
  echo "=== Bump → ${VERSION} ==="
  set_versions "$VERSION"
else
  CURRENT="$(node -p "require('./package.json').version")"
  if [[ "$CURRENT" =~ ^2\.0\.0-alpha\.identity\.([0-9]+)$ ]]; then
    SUFFIX=$((BASH_REMATCH[1] + 1))
  else
    echo "FAIL: cannot auto-bump from version $CURRENT (expected 2.0.0-alpha.identity.N)" >&2
    echo "Pass suffix explicitly: ./scripts/publish-identity-alpha.sh 12" >&2
    exit 1
  fi
  VERSION="2.0.0-alpha.identity.${SUFFIX}"
  echo "=== Bump → ${VERSION} ==="
  set_versions "$VERSION"
fi

echo ""
echo "=== Verify ==="
npm run verify

if (( DRY_RUN )); then
  echo ""
  echo "[dry-run] skip publish. Review package.json + package-lock.json, commit, then:"
  echo "  bash scripts/npm-publish-preflight.sh"
  echo "  npm publish --tag alpha --access public"
  exit 0
fi

echo ""
echo "=== Preflight ==="
bash scripts/npm-publish-preflight.sh

echo ""
echo "=== Publish ==="
npm publish --tag alpha --access public

echo ""
echo "OK — @inneranimalmedia/agentsam-sdk@${VERSION} (tag alpha)"
echo ""
echo "Consumers:"
echo "  npm install @inneranimalmedia/agentsam-sdk@${VERSION}"
echo "  agentsam context --json"
echo ""
echo "Receipt: add row to docs/RELEASES.md"
