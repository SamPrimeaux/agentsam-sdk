#!/usr/bin/env bash
set -euo pipefail

# Maintainer helper only. Runtime secrets are never copied into wrangler.jsonc.
# Prefer an explicit override; fall back to the canonical inneranimalmedia checkout.
ENV_FILE="${AGENTSAM_CLOUDFLARE_ENV_FILE:-${HOME}/inneranimalmedia/.env.cloudflare}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN

exec "$@"
