#!/usr/bin/env python3
"""Read-only parity and integrity checks for the canonical rebuild (vs parked legacy)."""
from __future__ import annotations

from common import d1_query


def count(sql: str) -> int:
    rows = d1_query(sql)
    return int(next(iter(rows[0].values()))) if rows else 0


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    names = {row["name"] for row in d1_query("SELECT name FROM sqlite_master WHERE type='table'")}
    leftover_v2 = sorted(name for name in names if name.endswith("_v2"))
    checks.append(("no leftover `_v2` tables", not leftover_v2, f"found={leftover_v2}"))

    old_buckets = count("SELECT COUNT(*) AS n FROM r2_buckets_legacy")
    new_buckets = count("SELECT COUNT(*) AS n FROM r2_buckets")
    checks.append(("R2 buckets cover legacy + first-party seeds", new_buckets >= old_buckets, f"legacy={old_buckets}, canonical={new_buckets}"))

    old_objects = count("SELECT COUNT(*) AS n FROM r2_objects_legacy")
    new_objects = count("SELECT COUNT(*) AS n FROM r2_objects")
    checks.append(("object cache covers legacy rows", new_objects >= old_objects, f"legacy={old_objects}, canonical={new_objects}"))

    old_media = count("SELECT COUNT(*) AS n FROM media_assets_legacy")
    new_media = count("SELECT COUNT(*) AS n FROM media_assets")
    checks.append(("media IDs/rows backfilled", new_media == old_media, f"legacy={old_media}, canonical={new_media}"))

    direct_streams = count("SELECT COUNT(*) AS n FROM media_assets_legacy WHERE bucket='cloudflare_stream'")
    normalized_streams = count(
        "SELECT COUNT(*) AS n FROM media_assets WHERE provider='cloudflare_stream' "
        "AND bucket_id IS NULL AND object_key IS NULL AND provider_resource_id IS NOT NULL"
    )
    checks.append(("Stream is provider identity, not bucket storage", normalized_streams == direct_streams, f"legacy Stream rows={direct_streams}, normalized={normalized_streams}"))

    invalid_r2 = count(
        "SELECT COUNT(*) AS n FROM media_assets WHERE provider='r2' "
        "AND (bucket_id IS NULL OR object_key IS NULL)"
    )
    checks.append(("R2 media rows have real bucket/key identity", invalid_r2 == 0, f"invalid rows={invalid_r2}"))

    old_templates = count("SELECT COUNT(*) AS n FROM studio_templates_legacy")
    new_templates = count("SELECT COUNT(*) AS n FROM studio_templates")
    checks.append(("studio template rows preserved", new_templates == old_templates, f"legacy={old_templates}, canonical={new_templates}"))

    missing_template_bucket = count(
        "SELECT COUNT(*) AS n FROM studio_templates "
        "WHERE status='active' AND payload_r2_key IS NOT NULL AND payload_bucket_id IS NULL"
    )
    checks.append(("active templates resolve their R2 resource", missing_template_bucket == 0, f"missing bucket refs={missing_template_bucket}"))

    orphan_objects = count(
        "SELECT COUNT(*) AS n FROM r2_objects o LEFT JOIN r2_buckets b ON b.id=o.bucket_id WHERE b.id IS NULL"
    )
    checks.append(("R2 object cache has no orphan bucket IDs", orphan_objects == 0, f"orphan objects={orphan_objects}"))

    expected_buckets = ["cad", "cms", "theme-store", "inneranimalmedia-schemas"]
    present = {row["bucket_name"] for row in d1_query(
        "SELECT bucket_name FROM r2_buckets WHERE bucket_name IN "
        "('cad','cms','theme-store','inneranimalmedia-schemas')"
    )}
    missing = sorted(set(expected_buckets) - present)
    checks.append(("first-party R2 stores are registered", not missing, f"missing={missing}"))

    route_count = count("SELECT COUNT(*) AS n FROM r2_storage_routes WHERE status='active'")
    checks.append(("storage destinations are seeded", route_count >= 6, f"active routes={route_count}"))

    movie_links = count(
        "SELECT COUNT(*) AS n FROM asset_relationships "
        "WHERE source_type='moviemode_template' AND relationship_type='uses_media'"
    )
    old_movie_templates = count("SELECT COUNT(*) AS n FROM moviemode_templates")
    checks.append(("MovieMode starter clips retain media relationships", movie_links >= old_movie_templates, f"templates={old_movie_templates}, relationships={movie_links}"))

    template_links = count(
        "SELECT COUNT(*) AS n FROM asset_relationships "
        "WHERE source_type='studio_template' AND relationship_type='uses_payload'"
    )
    checks.append(("CAD templates retain payload relationships", template_links >= old_templates, f"templates={old_templates}, relationships={template_links}"))

    media_schema = d1_query("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_assets'")
    media_sql = media_schema[0]["sql"] if media_schema else ""
    no_scope_columns = all(token not in media_sql for token in ("tenant_id", "workspace_id", "project_id"))
    checks.append(("media_assets is not workspace/tenant/project scoped", no_scope_columns, "scope values are retained only in metadata provenance"))

    bucket_schema = d1_query("SELECT sql FROM sqlite_master WHERE type='table' AND name='r2_buckets'")
    bucket_sql = bucket_schema[0]["sql"] if bucket_schema else ""
    no_bucket_secrets = "credentials_encrypted" not in bucket_sql
    checks.append(("R2 bucket registry contains no credential material", no_bucket_secrets, "OAuth remains in user_oauth_tokens / approved vault"))

    failures = 0
    for label, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {detail}")
        failures += 0 if ok else 1
    print(f"\n{len(checks) - failures}/{len(checks)} checks passed")
    print("Canonical tables own the final names. Parked *_legacy tables remain for rollback until dropped deliberately.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
