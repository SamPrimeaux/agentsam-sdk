#!/usr/bin/env python3
"""Park legacy tables, then create the rebuilt schema under canonical names. No `_v2`."""
from __future__ import annotations

import argparse
from pathlib import Path

from common import ARTIFACT_DIR, d1_file, d1_query

HERE = Path(__file__).resolve().parent
PARK = HERE / "sql/001_park_legacy.sql"
CREATE = HERE / "sql/002_create_canonical_tables.sql"
CANONICAL = {
    "r2_buckets",
    "r2_objects",
    "media_assets",
    "studio_templates",
    "r2_storage_routes",
}
LEGACY = {
    "r2_buckets_legacy",
    "r2_objects_legacy",
    "media_assets_legacy",
    "studio_templates_legacy",
}


def latest_backup() -> Path | None:
    files = sorted(ARTIFACT_DIR.glob("resource-tables-*.sql"), reverse=True)
    return files[0] if files else None


def table_names() -> set[str]:
    return {row["name"] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table'")}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.confirm_production:
        parser.error("--apply requires --confirm-production")
    backup = latest_backup()
    if not backup or not backup.is_file():
        raise SystemExit("BLOCKED: run 01_backup.py first; no local resource-table backup was found.")
    if not PARK.is_file() or not CREATE.is_file():
        raise SystemExit("Missing park/create SQL files under sql/.")

    if not args.apply:
        print(f"DRY RUN: would execute {PARK.name} then {CREATE.name}")
        print(f"Backup prerequisite satisfied: {backup.name}")
        print("Parks live tables as *_legacy, then creates r2_buckets, r2_objects,")
        print("media_assets, studio_templates, and r2_storage_routes under those final names.")
        print("No `_v2` tables are created.")
        return 0

    present = table_names()
    if any(name.endswith("_v2") for name in present):
        raise SystemExit("BLOCKED: found leftover *_v2 tables; remove them before applying this rebuild.")

    already_parked = LEGACY <= present
    still_live = {"r2_buckets", "r2_objects", "media_assets", "studio_templates"} <= present and not already_parked
    if still_live:
        d1_file(PARK)
    elif not already_parked:
        raise SystemExit(
            "BLOCKED: expected either live canonical tables to park, or already-parked *_legacy tables."
        )

    d1_file(CREATE)
    present = table_names()
    if any(name.endswith("_v2") for name in present):
        raise SystemExit("DDL verification failed: `_v2` tables must not exist.")
    missing_canonical = CANONICAL - present
    missing_legacy = LEGACY - present
    if missing_canonical or missing_legacy:
        raise SystemExit(
            "DDL verification failed: missing "
            + ", ".join(sorted(missing_canonical | missing_legacy))
        )
    print("DDL applied. Canonical tables:")
    for name in sorted(CANONICAL):
        print(" -", name)
    print("Legacy parked as:")
    for name in sorted(LEGACY):
        print(" -", name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
