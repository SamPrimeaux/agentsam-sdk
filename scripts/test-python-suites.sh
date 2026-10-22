#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
PYTHON=''
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
    PYTHON="$candidate"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  printf '%s\n' 'Python 3.10 or newer is required for the SDK test suites.' >&2
  exit 2
fi
export PYTHONPATH="$ROOT/python"
"$PYTHON" -m unittest discover -s python/tests -v
"$PYTHON" -m unittest discover -s packages/primetech-procedures/test -v
