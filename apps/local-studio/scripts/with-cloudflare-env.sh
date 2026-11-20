#!/usr/bin/env bash
# Load optional .env.cloudflare then run the rest of the command line.
# Absence is not fatal: Wrangler auth + wrangler.jsonc may already be enough.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  WRANGLER_BIN="$ROOT/node_modules/.bin/wrangler"
  if [[ -x "$WRANGLER_BIN" ]] && (cd "$ROOT" && env -u CLOUDFLARE_API_TOKEN "$WRANGLER_BIN" whoami -c backend/wrangler.jsonc >/dev/null 2>&1); then
    # A verified Wrangler OAuth session is authoritative. Do not let a stale
    # local CLOUDFLARE_API_TOKEN shadow it, but retain the other optional env.
    set -a
    # shellcheck disable=SC1090
    . <(grep -v '^CLOUDFLARE_API_TOKEN=' "$ENV_FILE")
    set +a
    echo "loaded $ENV_FILE (verified Wrangler OAuth takes precedence)"
  else
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
    echo "loaded $ENV_FILE"
  fi
  LOADED=1
else
  LOADED=0
fi
if [[ $# -eq 0 ]]; then
  if [[ "$LOADED" -eq 1 ]]; then
    echo "loaded $ENV_FILE"
  else
    echo "no $ENV_FILE (optional) — continuing with process env / Wrangler auth"
  fi
  env | grep -E '^(CLOUDFLARE_|IAM_|WORKMODE_|D1_|UI_WORKER|PRODUCT_HOST|ZONE_NAME|OLLAMA_)' | sed 's/=\(.*\)/=***/' || true
  exit 0
fi
exec "$@"
