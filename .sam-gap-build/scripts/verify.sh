#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/.sam-gap-build/machine-acceptance"
cd "$ROOT"
bash scripts/sam-machine/verify.sh "$OUT"
"${AGENTSAM_NODE:-node}" scripts/sam-machine/gate.mjs \
  --input "$OUT/acceptance.json" --require js,python,project_crud,sqlite_crud
echo
echo "Generated acceptance: $OUT/acceptance.json"
echo "These are bounded foundation gates; SAM-001..010 and all-language release are not certified."
