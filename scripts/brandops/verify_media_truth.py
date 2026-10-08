#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

from common import read_json, sha256_file


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Verify that masters survived and materialized derivatives are real."
    )
    ap.add_argument("--manifest", required=True)
    args = ap.parse_args()

    manifest = read_json(Path(args.manifest))
    failures: List[str] = []
    checked = 0

    for asset in manifest.get("assets", []):
        src = Path(asset["source"])
        expected_hash = asset.get("source_sha256")
        if not src.exists():
            failures.append(f"missing source: {src}")
            continue

        if expected_hash:
            actual = sha256_file(src)
            if actual != expected_hash:
                failures.append(f"source mutated: {src}")

        src_bytes = src.stat().st_size

        for variant in asset.get("variants", []):
            checked += 1
            out = Path(variant["path"])
            if not out.exists():
                failures.append(f"missing derivative: {out}")
                continue

            if out.resolve() == src.resolve():
                failures.append(f"derivative points at original: {out}")

            if variant.get("sha256"):
                actual_variant = sha256_file(out)
                if actual_variant != variant["sha256"]:
                    failures.append(f"derivative hash mismatch: {out}")

            if variant.get("purpose") in {"thumbnail", "grid"}:
                if out.stat().st_size >= src_bytes and src_bytes > 256 * 1024:
                    failures.append(
                        f"{variant.get('purpose')} not smaller than master: {out}"
                    )

            if expected_hash and sha256_file(out) == expected_hash:
                failures.append(f"derivative bytes identical to master: {out}")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("PASS")
    print(f"variants checked: {checked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
