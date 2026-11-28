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
# Keep release verification reproducible without relying on globally installed
# developer or runner packages. The Python CLI's only runtime test dependency
# outside the standard library is the declared Rich terminal UI dependency.
PYTHON_ENV="$(mktemp -d "${TMPDIR:-/tmp}/agentsam-python-tests.XXXXXX")"
trap 'rm -rf "$PYTHON_ENV"' EXIT
"$PYTHON" -m venv "$PYTHON_ENV"
TEST_PYTHON="$PYTHON_ENV/bin/python"
"$TEST_PYTHON" -m pip install --disable-pip-version-check --quiet -r "$ROOT/python/requirements-tui.txt"
export PYTHONPATH="$ROOT/python"
"$TEST_PYTHON" -m unittest discover -s python/tests -v
"$TEST_PYTHON" -m unittest discover -s packages/primetech-procedures/test -v
