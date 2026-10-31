#!/usr/bin/env python3
"""Register a fully verified R2 stock manifest in the canonical D1 catalog."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from common import ARTIFACT_DIR, PLATFORM_ACCOUNT_ID, d1_file, d1_query, ensure_artifact_dir, json_sql, sql_quote


def object_id(bucket: str, key: str) -> str:
    digest = hashlib.sha256(f"{bucket}/{key}".encode()).hexdigest()[:24]
    return "obj_stock_" + digest


def version_number(value: str) -> int:
    digits = "".join(character for character in str(value) if character.isdigit())
    return int(digits or "1")


def build_registration_sql(manifest: dict[str, Any], bucket_id: str, manifest_path: Path) -> tuple[str, int, int]:
    objects = list(manifest.get("objects", []))
    manifest_bytes = manifest_path.read_bytes()
    objects.append({
        "key": manifest["manifest_key"],
        "content_type": "application/json",
        "size_bytes": len(manifest_bytes),
        "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "role": "library-manifest",
    })

    statements: list[str] = []
    for item in objects:
        key = item["key"]
        category = item.get("role") or (
            "model-source" if key.lower().endswith((".stl", ".obj", ".glb", ".gltf", ".step", ".stp", ".3mf"))
            else "preview" if key.lower().endswith((".webp", ".avif", ".png", ".jpg", ".jpeg"))
            else "template-payload" if "/payload/" in key
            else "stock-library-object"
        )
        metadata = {
            "app_id": manifest["app_id"],
            "version": manifest["version"],
            "manifest_key": manifest["manifest_key"],
            "sha256": item["sha256"],
            "source_repository": manifest.get("source", {}).get("repository"),
        }
        statements.append(
            "INSERT INTO r2_objects (id,tenant_id,bucket_id,object_key,display_name,content_type,file_size,checksum,"
            "metadata_json,r2_metadata_json,is_public,storage_class,category,is_active,created_at,updated_at,inventory_source,verified_at) VALUES ("
            + ",".join([
                sql_quote(object_id(manifest["bucket"], key)), sql_quote("tenant_platform"), sql_quote(bucket_id),
                sql_quote(key), sql_quote(Path(key).name), sql_quote(item.get("content_type")),
                sql_quote(item.get("size_bytes")), sql_quote(item.get("sha256")), json_sql(metadata),
                sql_quote("{}"), "0", sql_quote("STANDARD"), sql_quote(category), "1", "unixepoch()", "unixepoch()",
                sql_quote("publisher"), "unixepoch()",
            ])
            + ") ON CONFLICT(bucket_id,object_key) DO UPDATE SET "
            "display_name=excluded.display_name,content_type=excluded.content_type,file_size=excluded.file_size,"
            "checksum=excluded.checksum,metadata_json=excluded.metadata_json,category=excluded.category,"
            "inventory_source='publisher',verified_at=unixepoch(),updated_at=unixepoch();"
        )

    app_id = manifest["app_id"]
    version = version_number(manifest["version"])
    for entry in manifest.get("entries", []):
        kind = entry.get("kind") or entry.get("specs", {}).get("kind") or "source-part"
        resource_kind = "model_composition" if kind == "composition" else "source_part"
        tags = entry.get("tags") or []
        specs = entry.get("specs") or {}
        source_refs = entry.get("source_refs") or []
        payload_key = entry.get("payload_r2_key")
        preview_key = entry.get("preview_r2_key")
        values = [
            sql_quote(entry["id"]), sql_quote(entry.get("sku")), sql_quote(app_id), sql_quote(resource_kind),
            sql_quote(entry.get("pack_slug")), sql_quote(entry.get("pack_title")), sql_quote(entry.get("category") or "stock"),
            sql_quote(entry.get("title") or entry["id"]), "NULL", "NULL", json_sql(tags), json_sql(specs),
            sql_quote(bucket_id), sql_quote(payload_key), sql_quote(entry.get("payload_sha256")),
            sql_quote(bucket_id if preview_key else None), sql_quote(preview_key), json_sql([app_id]), json_sql(source_refs),
            str(version), sql_quote(entry.get("status") or "active"), str(int(entry.get("sort_order") or 0)),
            "unixepoch()", "unixepoch()",
        ]
        statements.append(
            "INSERT INTO studio_templates (id,sku,app_id,resource_kind,pack_slug,pack_title,category,title,description,use_case,"
            "tags_json,specs_json,payload_bucket_id,payload_r2_key,payload_sha256,preview_bucket_id,preview_r2_key,"
            "compatible_apps_json,source_refs_json,version,status,sort_order,created_at,updated_at) VALUES ("
            + ",".join(values)
            + ") ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,app_id=excluded.app_id,resource_kind=excluded.resource_kind,"
            "pack_slug=excluded.pack_slug,pack_title=excluded.pack_title,category=excluded.category,title=excluded.title,"
            "tags_json=excluded.tags_json,specs_json=excluded.specs_json,payload_bucket_id=excluded.payload_bucket_id,"
            "payload_r2_key=excluded.payload_r2_key,"
            "version=CASE WHEN studio_templates.payload_sha256 IS excluded.payload_sha256 THEN studio_templates.version ELSE studio_templates.version+1 END,"
            "payload_sha256=excluded.payload_sha256,preview_bucket_id=excluded.preview_bucket_id,preview_r2_key=excluded.preview_r2_key,"
            "compatible_apps_json=excluded.compatible_apps_json,source_refs_json=excluded.source_refs_json,"
            "status=excluded.status,sort_order=excluded.sort_order,updated_at=unixepoch();"
        )

        relation_targets = [(payload_key, "uses_payload"), (preview_key, "uses_preview")]
        relation_targets.extend((key, "uses_source") for key in source_refs)
        for target_key, relation_type in relation_targets:
            if not target_key:
                continue
            relation_id = "rel_stock_" + hashlib.sha256(f"{entry['id']}:{relation_type}:{target_key}".encode()).hexdigest()[:24]
            relation_metadata = {"bucket_id": bucket_id, "object_key": target_key, "app_id": app_id, "version": manifest["version"]}
            actual_target_id = (
                "(SELECT id FROM r2_objects WHERE bucket_id=" + sql_quote(bucket_id)
                + " AND object_key=" + sql_quote(target_key) + " LIMIT 1)"
            )
            statements.append(
                "INSERT OR IGNORE INTO asset_relationships (id,source_type,source_id,target_type,target_id,relationship_type,metadata,created_at) VALUES ("
                + ",".join([
                    sql_quote(relation_id), sql_quote("studio_template"), sql_quote(entry["id"]),
                    sql_quote("r2_object"), actual_target_id, sql_quote(relation_type), json_sql(relation_metadata), "unixepoch()",
                ])
                + ");"
            )

    sql = "-- Generated from a fully verified stock-library manifest.\n" + "\n".join(statements) + "\n"
    return sql, len(objects), len(manifest.get("entries", []))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, help="Local manifest saved by 05_stock_r2.py")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    args = parser.parse_args()
    if args.apply and not args.confirm_production:
        parser.error("--apply requires --confirm-production")

    default_manifest = ARTIFACT_DIR / "stock-library/samsketch/v1/manifest.json"
    manifest_path = args.manifest or default_manifest
    if not manifest_path.is_file():
        raise SystemExit(f"Stock manifest not found: {manifest_path}. Run 05_stock_r2.py plan/publish first.")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != "agentsam.stock-library-manifest.v1":
        raise SystemExit("Unsupported stock library manifest schema")
    if manifest.get("bucket") != "cad" or manifest.get("cloudflare_account_id") != PLATFORM_ACCOUNT_ID:
        raise SystemExit("This registrar only accepts the first-party cad bucket/account manifest")

    receipt_path = manifest_path.parent / "verification.json"
    if not receipt_path.is_file():
        raise SystemExit("R2 verification receipt is missing. Run 05_stock_r2.py verify before registering catalog rows.")
    receipt = json.loads(receipt_path.read_text())
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    if receipt.get("schema") != "agentsam.stock-library-verification.v1" or receipt.get("manifest_sha256") != manifest_sha:
        raise SystemExit("R2 verification receipt does not match this exact manifest. Re-run 05_stock_r2.py verify.")
    if int(receipt.get("verified_objects", -1)) != len(manifest.get("objects", [])):
        raise SystemExit("R2 verification receipt does not cover every manifest object.")

    table_rows = d1_query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN "
        "('r2_buckets','r2_objects','studio_templates','asset_relationships')"
    )
    present = {row["name"] for row in table_rows}
    required = {"r2_buckets", "r2_objects", "studio_templates", "asset_relationships"}
    if required - present:
        raise SystemExit("Run 02_apply_ddl.py and 03_backfill.py first; missing: " + ", ".join(sorted(required - present)))

    bucket_rows = d1_query(
        "SELECT id FROM r2_buckets WHERE bucket_name='cad' "
        f"AND provider_account_id={sql_quote(PLATFORM_ACCOUNT_ID)} AND ownership_type='platform' LIMIT 1"
    )
    if not bucket_rows:
        raise SystemExit("Platform cad bucket is not registered in r2_buckets")
    bucket_id = bucket_rows[0]["id"]

    sql, object_count, entry_count = build_registration_sql(manifest, bucket_id, manifest_path)
    output = ensure_artifact_dir() / f"register-{manifest['app_id']}-{manifest['version']}.sql"
    output.write_text(sql)
    print(f"Manifest: {manifest_path}")
    print(f"R2 objects to register: {object_count}")
    print(f"Reusable catalog entries to upsert: {entry_count}")
    print(f"Generated DML: {output}")
    if not args.apply:
        print("DRY RUN: D1 unchanged. Review the SQL, then rerun with --apply --confirm-production.")
        return 0
    d1_file(output)
    print("Stock library registered in studio_templates and r2_objects.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
