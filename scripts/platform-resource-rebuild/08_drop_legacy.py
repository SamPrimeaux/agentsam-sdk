#!/usr/bin/env python3
"""Drop parked resource-rebuild *_legacy tables after canonical cutover is confirmed."""
from __future__ import annotations

import argparse
from pathlib import Path

from common import d1_file, d1_query

SQL = Path(__file__).resolve().parent / "sql/004_drop_legacy.sql"
LEGACY = {
    "r2_buckets_legacy",
    "r2_objects_legacy",
    "media_assets_legacy",
    "studio_templates_legacy",
}
CANONICAL = {
    "r2_buckets",
    "r2_objects",
    "media_assets",
    "studio_templates",
    "r2_storage_routes",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.confirm_production:
        parser.error("--apply requires --confirm-production")
    if not SQL.is_file():
        raise SystemExit(f"Missing SQL file: {SQL}")

    present = {row["name"] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table'")}
    missing_canonical = CANONICAL - present
    if missing_canonical:
        raise SystemExit("BLOCKED: canonical tables missing: " + ", ".join(sorted(missing_canonical)))
    if any(name.endswith("_v2") for name in present):
        raise SystemExit("BLOCKED: leftover *_v2 tables exist; aborting.")

    if not args.apply:
        print(f"DRY RUN: would execute {SQL}")
        print("Would drop:", ", ".join(sorted(LEGACY & present)) or "(none present)")
        return 0

    d1_file(SQL)
    after = {row["name"] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table'")}
    leftover = sorted(LEGACY & after)
    if leftover:
        raise SystemExit("Drop verification failed; still present: " + ", ".join(leftover))
    print("Resource-rebuild *_legacy tables dropped. Canonical tables remain:")
    for name in sorted(CANONICAL):
        print(" -", name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
