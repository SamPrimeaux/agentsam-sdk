#!/usr/bin/env bash
# Standalone read-only launcher. Project root is the caller's current directory.
set -euo pipefail
here="$(cd -- "$(dirname -- "$0")" && pwd)"
for python in python3.12 python3.11 python3.10 python3; do
  if command -v "$python" >/dev/null 2>&1; then
    exec "$python" -B -I -S "$here/run.py" '{}'
  fi
done
printf '%s\n' '{"schema":"inneranimalmedia.primetech.asset-inventory.v1","ok":false,"error":"python_3_10_or_newer_required"}' >&2
exit 2
