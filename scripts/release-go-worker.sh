#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"

if [[ "$MODE" != "check" && "$MODE" != "deploy" ]]; then
  echo "usage: ./scripts/release-go-worker.sh [check|deploy]"
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID is required"
  exit 1
fi

OFFICIAL_RELEASE_GUARD="${AGENTSAM_INNERANIMALMEDIA_OFFICIAL_RELEASE:-${AGENTSAM_IAM_OFFICIAL_RELEASE:-}}"

if [[ "$OFFICIAL_RELEASE_GUARD" != "1" ]]; then
  echo "ERROR: AGENTSAM_INNERANIMALMEDIA_OFFICIAL_RELEASE=1 is required"
  exit 1
fi

# Normalize the active process onto the canonical guard even when a legacy
# caller supplied AGENTSAM_IAM_OFFICIAL_RELEASE.
export AGENTSAM_INNERANIMALMEDIA_OFFICIAL_RELEASE=1

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "ERROR: official Go release must run from main"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree must be clean"
  git status --short
  exit 1
fi

git fetch origin main

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "ERROR: local main must exactly match origin/main"
  exit 1
fi

if [[ "${CI:-}" == "true" && "${AGENTSAM_ALLOW_CI_OFFICIAL_RELEASE:-}" != "1" ]]; then
  echo "ERROR: automatic CI production release is disabled"
  exit 1
fi

COMMON=(
  go
  --cloudflare
  agentsam-go-worker
  --official-release
  --account
  "$CLOUDFLARE_ACCOUNT_ID"
)

if [[ "$MODE" == "check" ]]; then
  exec ./bin/agentsam "${COMMON[@]}" --dry-run
fi

exec ./bin/agentsam "${COMMON[@]}" --yes
