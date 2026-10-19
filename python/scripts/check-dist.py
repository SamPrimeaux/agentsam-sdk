#!/usr/bin/env python3
"""Stdlib-only release gate: inspect built dist/ artifacts before upload.

Usage: python scripts/check-dist.py [dist_dir]   (default: dist)
Fails on: missing wheel/sdist, version drift, no console script, no license,
bytecode/egg-info junk, or machine-specific paths baked into the artifacts.
"""
from __future__ import annotations

import re
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BAD_PATH = re.compile(rb"/Users/|/home/[a-z]|C:\\\\Users")


def main() -> int:
    dist = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist"
    version = re.search(r'__version__\s*=\s*"([^"]+)"', (ROOT / "agentsam_sdk/__init__.py").read_text()).group(1)
    wheels, sdists = sorted(dist.glob("*.whl")), sorted(dist.glob("*.tar.gz"))
    errors: list[str] = []
    if len(wheels) != 1 or len(sdists) != 1:
        errors.append(f"expected exactly 1 wheel + 1 sdist in {dist}, found {len(wheels)}/{len(sdists)}")
    for whl in wheels:
        with zipfile.ZipFile(whl) as z:
            names = z.namelist()
            meta = z.read(next(n for n in names if n.endswith("METADATA"))).decode()
            if f"Version: {version}" not in meta:
                errors.append(f"{whl.name}: METADATA version != __version__ ({version})")
            if "Requires-Python: >=3.10" not in meta:
                errors.append(f"{whl.name}: Requires-Python missing/changed")
            entry = next((z.read(n).decode() for n in names if n.endswith("entry_points.txt")), "")
            if "agentsam = agentsam_sdk.cli:main" not in entry:
                errors.append(f"{whl.name}: console script `agentsam` missing")
            if not any(n.endswith("licenses/LICENSE") or n.endswith("LICENSE") for n in names):
                errors.append(f"{whl.name}: LICENSE not included")
            if not any(n == "agentsam_sdk/py.typed" for n in names):
                errors.append(f"{whl.name}: py.typed missing")
            for n in names:
                if "__pycache__" in n or n.endswith(".pyc") or "tests/" in n:
                    errors.append(f"{whl.name}: unexpected file {n}")
                if n.endswith((".py", ".md")) and BAD_PATH.search(z.read(n)):
                    errors.append(f"{whl.name}: machine-specific path in {n}")
    for sd in sdists:
        with tarfile.open(sd) as t:
            for m in t.getmembers():
                if "__pycache__" in m.name or m.name.endswith(".pyc"):
                    errors.append(f"{sd.name}: unexpected file {m.name}")
    for e in errors:
        print("FAIL", e)
    print(f"checked {len(wheels)} wheel(s), {len(sdists)} sdist(s) for agentsam-sdk {version}: {'FAILED' if errors else 'ok'}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
