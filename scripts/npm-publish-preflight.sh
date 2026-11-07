#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

git fetch origin --prune >/dev/null

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "REFUSE PUBLISH: branch is not main" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "REFUSE PUBLISH: working tree is not clean" >&2
  git status -sb >&2
  exit 1
fi

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "REFUSE PUBLISH: HEAD does not equal origin/main" >&2
  exit 1
fi

if [[ "${CI:-}" == "true" ]]; then
  if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
    echo "REFUSE PUBLISH: GitHub Actions OIDC is unavailable" >&2
    exit 1
  fi
else
  npm whoami >/dev/null
fi
npm run release:train:check
node scripts/verify-registry-train.mjs --intent-only

echo "PUBLISH PREFLIGHT PASS"
echo "branch=main"
echo "sha=$(git rev-parse HEAD)"
echo "version=$(node -p 'require("./package.json").version')"
