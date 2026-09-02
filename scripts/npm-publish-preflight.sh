#!/usr/bin/env bash
# Preflight before `npm publish` for @inneranimalmedia/agentsam-sdk.
set -euo pipefail

PKG='@inneranimalmedia/agentsam-sdk'

node scripts/verify-package.mjs

who="$(npm whoami 2>/dev/null || true)"
if [[ -z "$who" ]]; then
  echo "FAIL: not logged in — run: npm login" >&2
  exit 1
fi

echo "npm whoami: $who"

echo "Authenticated. npm will enforce this account's package publishing permissions."
echo "Package: $PKG"
npm view "$PKG" version 2>/dev/null && echo "registry: package exists" || echo "registry: first publish under this scope"

ver="$(node -p "require('./package.json').version")"
echo "local version: $ver"
echo ""
if [[ "$ver" == *-* ]]; then
  echo "Next: npm publish --tag alpha --access public"
else
  echo "Next: npm publish --tag latest --access public"
fi
echo "The prepublishOnly hook runs the complete release verification before upload."
