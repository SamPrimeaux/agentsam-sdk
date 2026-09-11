#!/usr/bin/env bash
# Load optional .env.cloudflare then run the rest of the command line.
# Absence is not fatal: Wrangler auth + wrangler.jsonc may already be enough.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
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
