#!/usr/bin/env python3
"""Export only the resource tables being rebuilt; optionally retain the backup in private R2."""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from common import ARTIFACT_DIR, d1_export, ensure_artifact_dir, r2_put

TABLES = [
    "r2_buckets", "r2_objects", "media_assets", "studio_templates",
    "moviemode_templates", "asset_relationships",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upload-to-r2", action="store_true", help="Also copy the backup to private agent-sam R2")
    parser.add_argument("--confirm-backup-upload", action="store_true", help="Required with --upload-to-r2")
    parser.add_argument("--bucket", default="agent-sam")
    args = parser.parse_args()
    if args.upload_to_r2 and not args.confirm_backup_upload:
        parser.error("--upload-to-r2 requires --confirm-backup-upload")

    root = ensure_artifact_dir()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sql_path = root / f"resource-tables-{stamp}.sql"
    d1_export(sql_path, TABLES)
    manifest = {
        "schema": "agentsam.d1-resource-backup.v1",
        "database": "inneranimalmedia-business",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tables": TABLES,
        "excluded": ["user_oauth_tokens", "secrets", "vault material"],
        "file": sql_path.name,
        "bytes": sql_path.stat().st_size,
        "sha256": sha256(sql_path),
    }
    manifest_path = root / f"resource-tables-{stamp}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Backup created: {sql_path}")
    print(f"Bytes: {manifest['bytes']:,}  SHA-256: {manifest['sha256']}")

    if args.upload_to_r2:
        prefix = f"backups/d1/inneranimalmedia-business/resource-rebuild/{stamp}"
        r2_put(args.bucket, f"{prefix}/{sql_path.name}", sql_path, "application/sql")
        r2_put(args.bucket, f"{prefix}/{manifest_path.name}", manifest_path, "application/json")
        print(f"Private R2 backup: {args.bucket}/{prefix}/")
    else:
        print("Local-only backup. For durable protection, rerun with --upload-to-r2 --confirm-backup-upload.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
