#!/usr/bin/env bash
# Verify host tools for agentsam-sdk (stdlib Python + jq + optional wrangler/D1).
set -euo pipefail

REQUIRE_D1=0
for arg in "$@"; do
  case "$arg" in
    --require-d1) REQUIRE_D1=1 ;;
    -h|--help)
      echo "Usage: $0 [--require-d1]"
      exit 0
      ;;
  esac
done

fail=0
ok() { printf '  OK  %s\n' "$1"; }
bad() { printf '  MISSING  %s\n' "$1"; fail=1; }

echo "agentsam-sdk host tooling"

if command -v python3 >/dev/null 2>&1; then
  pyv=$(python3 -c 'import sys; print("%d.%d"%sys.version_info[:2])')
  # shellcheck disable=SC2072
  if python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)'; then
    ok "python3 ($pyv)"
  else
    bad "python3 >= 3.10 (found $pyv)"
  fi
else
  bad "python3"
fi

if command -v jq >/dev/null 2>&1; then
  ok "jq ($(jq --version 2>&1))"
else
  bad "jq (brew install jq) — needed for JSON filters in docs/tooling.md"
fi

if [[ "$REQUIRE_D1" -eq 1 ]]; then
  if command -v wrangler >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
    ok "wrangler/npx available"
  else
    bad "wrangler or npx"
  fi
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    ok "CLOUDFLARE_API_TOKEN set"
  else
    bad "CLOUDFLARE_API_TOKEN"
  fi
  if [[ -n "${AGENTSAM_D1_DB_NAME:-}" ]]; then
    ok "AGENTSAM_D1_DB_NAME=${AGENTSAM_D1_DB_NAME}"
  else
    bad "AGENTSAM_D1_DB_NAME (or pass --db on each command)"
  fi
else
  echo "  (skip D1 env — pass --require-d1 to enforce)"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "FAIL: install missing tools (see docs/tooling.md)"
  exit 1
fi
echo "PASS"
exit 0
