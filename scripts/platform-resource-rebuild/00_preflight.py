#!/usr/bin/env python3
"""Read-only inventory of the exact D1 tables touched by the resource rebuild."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from common import ARTIFACT_DIR, d1_query, ensure_artifact_dir

TABLES = [
    "r2_buckets", "r2_objects", "media_assets", "studio_templates",
    "moviemode_templates", "asset_relationships", "project_storage",
]


def scalar(sql: str) -> int:
    rows = d1_query(sql)
    return int(next(iter(rows[0].values()))) if rows else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Optional JSON report destination")
    args = parser.parse_args()

    schemas = d1_query(
        "SELECT name, sql FROM sqlite_master WHERE type='table' "
        "AND name IN (" + ",".join("'" + name + "'" for name in TABLES) + ") ORDER BY name"
    )
    counts = {name: scalar(f"SELECT COUNT(*) AS n FROM {name}") for name in TABLES}
    credential_count = scalar(
        "SELECT COUNT(*) AS n FROM r2_buckets "
        "WHERE credentials_encrypted IS NOT NULL AND credentials_encrypted <> ''"
    )
    invalid_json = {
        "r2_buckets": scalar("SELECT COUNT(*) AS n FROM r2_buckets WHERE json_valid(COALESCE(cors_config_json,'{}'))=0 OR json_valid(COALESCE(lifecycle_rules_json,'{}'))=0"),
        "r2_objects": scalar("SELECT COUNT(*) AS n FROM r2_objects WHERE json_valid(COALESCE(metadata_json,'{}'))=0 OR json_valid(COALESCE(r2_metadata_json,'{}'))=0"),
        "media_assets": scalar("SELECT COUNT(*) AS n FROM media_assets WHERE json_valid(COALESCE(metadata_json,'{}'))=0"),
        "studio_templates": scalar("SELECT COUNT(*) AS n FROM studio_templates WHERE json_valid(COALESCE(tags_json,'[]'))=0 OR json_valid(COALESCE(specs_json,'{}'))=0 OR json_valid(COALESCE(source_refs_json,'[]'))=0"),
    }
    invalid_json_types = scalar(
        "SELECT COUNT(*) AS n FROM studio_templates WHERE "
        "json_type(COALESCE(tags_json,'[]'))!='array' OR "
        "json_type(COALESCE(specs_json,'{}'))!='object' OR "
        "json_type(COALESCE(source_refs_json,'[]'))!='array'"
    )
    unresolved_account_rows = d1_query(
        "SELECT id,bucket_name,tenant_id,s3_url,catalog_url FROM r2_buckets "
        "WHERE s3_url IS NULL OR s3_url NOT LIKE 'https://%.r2.cloudflarestorage.com%' ORDER BY bucket_name"
    )
    media_groups = d1_query(
        "SELECT source_kind,bucket,media_kind,COUNT(*) AS n "
        "FROM media_assets GROUP BY source_kind,bucket,media_kind ORDER BY n DESC"
    )
    media_scope = d1_query(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN tenant_id IS NOT NULL THEN 1 ELSE 0 END) AS tenant_values, "
        "SUM(CASE WHEN workspace_id IS NOT NULL THEN 1 ELSE 0 END) AS workspace_values, "
        "SUM(CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) AS project_values, "
        "SUM(CASE WHEN created_from_workspace_id IS NOT NULL THEN 1 ELSE 0 END) AS created_from_workspace_values, "
        "SUM(CASE WHEN vectorize_id IS NOT NULL THEN 1 ELSE 0 END) AS vectorize_values "
        "FROM media_assets"
    )
    buckets = d1_query(
        "SELECT id,tenant_id,bucket_name,display_name,region,public_access,total_objects,total_size_bytes,"
        "s3_url,catalog_url,custom_domain,upload_enabled,"
        "CASE WHEN credentials_encrypted IS NULL OR credentials_encrypted='' THEN 0 ELSE 1 END AS has_stored_credentials "
        "FROM r2_buckets ORDER BY bucket_name"
    )
    oauth = d1_query(
        "SELECT user_id,account_identifier,account_display,scope,is_active,revoked_at,updated_at "
        "FROM user_oauth_tokens WHERE lower(provider)='cloudflare' ORDER BY updated_at DESC"
    )
    templates = d1_query(
        "SELECT id,app_id,sku,title,payload_bucket,payload_r2_key,payload_sha256,preview_r2_key,status "
        "FROM studio_templates ORDER BY app_id,sort_order,id"
    )
    movie_templates = d1_query(
        "SELECT id,pack_slug,slug,title,template_kind,stream_uid,status,sort_order "
        "FROM moviemode_templates ORDER BY sort_order,id"
    )

    report = {
        "schema": "agentsam.resource-rebuild.preflight.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "database": "inneranimalmedia-business",
        "read_only": True,
        "counts": counts,
        "schemas": schemas,
        "r2_buckets": buckets,
        "cloudflare_oauth_connections_safe_fields_only": oauth,
        "media_groups": media_groups,
        "media_scope_counts": media_scope[0] if media_scope else {},
        "studio_templates": templates,
        "moviemode_templates": movie_templates,
        "credential_guard": {
            "nonempty_credentials_encrypted_rows": credential_count,
            "safe_to_rebuild_without_secret_migration": credential_count == 0,
        },
        "invalid_json_counts": invalid_json,
        "invalid_studio_template_json_types": invalid_json_types,
        "unresolved_account_rows": unresolved_account_rows,
        "notes": [
            "OAuth access/refresh token values are deliberately never selected or exported.",
            "r2_buckets.total_objects and r2_objects are inventory metadata, not proof of a complete R2 listing.",
            "No legacy table is changed by this script.",
        ],
    }

    output = args.output or (ensure_artifact_dir() / "preflight-latest.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")

    print(f"D1 preflight saved: {output}")
    for name, count in counts.items():
        print(f"  {name:24} {count:>8}")
    print(f"  encrypted bucket credentials: {credential_count}")
    print(f"  Cloudflare OAuth account records: {len(oauth)} (token values not read)")
    print(f"  media identity groups: {len(media_groups)}")
    print(f"  existing studio templates: {len(templates)}")
    print(f"  existing MovieMode templates: {len(movie_templates)}")

    bad_json_total = sum(invalid_json.values())
    print(f"  invalid JSON values in migrated tables: {bad_json_total}")
    print(f"  invalid template JSON types: {invalid_json_types}")
    print(f"  R2 buckets requiring account-ID resolution: {len(unresolved_account_rows)}")
    if credential_count:
        print("BLOCKED: encrypted bucket credentials exist. Move them to the approved secret vault before rebuilding r2_buckets.")
        return 2
    if bad_json_total or invalid_json_types:
        print("BLOCKED: invalid JSON or JSON types exist in a field that receives a stricter CHECK constraint. Repair it before applying DDL/backfill.")
        return 2
    if unresolved_account_rows:
        print("WARNING: unresolved buckets will be retained without a provider account ID and cannot be selected as a storage destination until resolved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
