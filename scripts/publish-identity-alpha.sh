#!/usr/bin/env bash
# Bump + test + publish @inneranimalmedia/agentsam-sdk identity alpha line.
#
# Usage:
#   ./scripts/publish-identity-alpha.sh          # bumps .9 → .10
#   ./scripts/publish-identity-alpha.sh 10         # explicit suffix → 2.0.0-alpha.identity.10
#   ./scripts/publish-identity-alpha.sh --dry-run  # bump + test only, no publish
#
# Requires: npm logged in as inneranimalmedia (see npm-publish-preflight.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
SUFFIX=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$SUFFIX" ]]; then SUFFIX="$arg"; else echo "Unknown arg: $arg" >&2; exit 1; fi
      ;;
  esac
done

if [[ -z "$SUFFIX" ]]; then
  CURRENT="$(node -p "require('./package.json').version")"
  if [[ "$CURRENT" =~ ^2\.0\.0-alpha\.identity\.([0-9]+)$ ]]; then
    SUFFIX=$((BASH_REMATCH[1] + 1))
  else
    echo "FAIL: cannot auto-bump from version $CURRENT (expected 2.0.0-alpha.identity.N)" >&2
    echo "Pass suffix explicitly: ./scripts/publish-identity-alpha.sh 10" >&2
    exit 1
  fi
fi

VERSION="2.0.0-alpha.identity.${SUFFIX}"

echo "=== Bump → ${VERSION} ==="
VERSION="$VERSION" node -e "
import { readFileSync, writeFileSync } from 'node:fs';
const version = process.env.VERSION;
for (const rel of ['package.json', 'packages/identity/package.json']) {
  const j = JSON.parse(readFileSync(rel, 'utf8'));
  j.version = version;
  writeFileSync(rel, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('✓ ' + rel);
}
"

echo ""
echo "=== Test ==="
npm test

if (( DRY_RUN )); then
  echo ""
  echo "[dry-run] skip publish — commit version bump, then:"
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
echo "Legendary OS:"
echo "  cd ~/Legendary-OS"
echo "  pnpm up @inneranimalmedia/agentsam-sdk@${VERSION}"
echo "  pnpm install && pnpm deploy"
echo ""
echo "Receipt: add row to docs/RELEASES.md + inneranimalmedia/docs/RELEASES.iam-mirror.md"
