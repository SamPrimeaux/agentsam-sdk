#!/usr/bin/env bash
# Load .env.cloudflare then run the rest of the command line.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.cloudflare"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — copy .env.cloudflare.example" >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
if [[ $# -eq 0 ]]; then
  echo "loaded $ENV_FILE"
  env | grep -E '^(CLOUDFLARE_|WORKMODE_|D1_|UI_WORKER|PRODUCT_HOST|ZONE_NAME|OLLAMA_)' | sed 's/=\(.*\)/=***/' || true
  exit 0
fi
exec "$@"
