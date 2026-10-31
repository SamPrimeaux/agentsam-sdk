#!/usr/bin/env python3
"""Backfill canonical tables from parked *_legacy sources; default is a dry run."""
from __future__ import annotations

import argparse
from pathlib import Path

from common import ARTIFACT_DIR, d1_file, d1_query

SQL = Path(__file__).resolve().parent / "sql/003_backfill_from_legacy.sql"
REQUIRED = {
    "r2_buckets",
    "r2_objects",
    "media_assets",
    "studio_templates",
    "r2_storage_routes",
    "r2_buckets_legacy",
    "r2_objects_legacy",
    "media_assets_legacy",
    "studio_templates_legacy",
}


def latest_backup() -> Path | None:
    files = sorted(ARTIFACT_DIR.glob("resource-tables-*.sql"), reverse=True)
    return files[0] if files else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.confirm_production:
        parser.error("--apply requires --confirm-production")
    backup = latest_backup()
    if not backup or not backup.is_file():
        raise SystemExit("BLOCKED: run 01_backup.py first.")
    if not SQL.is_file():
        raise SystemExit(f"Missing DML file: {SQL}")
    if not args.apply:
        print(f"DRY RUN: would execute {SQL}")
        print(f"Backup prerequisite satisfied: {backup.name}")
        print("DML preserves media/template IDs, maps Stream UIDs as provider IDs,")
        print("keeps legacy scope in metadata, and registers cms/theme-store/schemas.")
        print("Writes only to canonical table names. No `_v2`.")
        return 0

    present = {row["name"] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table'")}
    if any(name.endswith("_v2") for name in present):
        raise SystemExit("BLOCKED: leftover *_v2 tables found; this rebuild never uses `_v2`.")
    missing = REQUIRED - present
    if missing:
        raise SystemExit("BLOCKED: apply 02_apply_ddl.py first; missing " + ", ".join(sorted(missing)))
    d1_file(SQL)
    print("Backfill applied to canonical tables. Run 04_validate.py next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
