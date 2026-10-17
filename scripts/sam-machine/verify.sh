#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-/tmp/sam-machine-acceptance}"
cd "$ROOT"
NODE="${AGENTSAM_NODE:-node}"
"$NODE" scripts/sam-machine/build.mjs --out "$OUT" --project "$ROOT" --verify
"$NODE" scripts/verify-source-boundaries.mjs
"$NODE" --test test/integration/sam-kernel.test.mjs test/integration/sam-decision.test.mjs test/integration/sam-machine-public-api.test.mjs
echo "SAM machine outputs: $OUT"
echo "Never infer app integration from generated ID constants."
