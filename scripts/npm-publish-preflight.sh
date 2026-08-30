#!/usr/bin/env bash
# Preflight before `npm publish` for @inneranimalmedia/agentsam-sdk.
set -euo pipefail

REQUIRED_SCOPE='inneranimalmedia'
PKG='@inneranimalmedia/agentsam-sdk'

node scripts/verify-package.mjs

who="$(npm whoami 2>/dev/null || true)"
if [[ -z "$who" ]]; then
  echo "FAIL: not logged in — run: npm login" >&2
  exit 1
fi

echo "npm whoami: $who"

if [[ "$who" != "$REQUIRED_SCOPE" ]]; then
  echo "FAIL: publish account must be npm user '$REQUIRED_SCOPE' (package maintainer)." >&2
  echo "      You are '$who'. Logout and login as the org owner, or get Developer+ on the org." >&2
  echo "      npm logout && npm login" >&2
  exit 1
fi

echo "OK: maintainer account"
echo "Package: $PKG"
npm view "$PKG" version 2>/dev/null && echo "registry: package exists" || echo "registry: first publish under this scope"

ver="$(node -p "require('./package.json').version")"
echo "local version: $ver"
echo ""
echo "Next: npm run verify && npm publish --tag alpha --access public"
