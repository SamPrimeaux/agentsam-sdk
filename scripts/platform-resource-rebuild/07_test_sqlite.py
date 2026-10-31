#!/usr/bin/env python3
"""Offline SQLite fixture test for park → create → backfill; no Cloudflare access."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PARK = (HERE / "sql/001_park_legacy.sql").read_text()
DDL = (HERE / "sql/002_create_canonical_tables.sql").read_text()
DML = (HERE / "sql/003_backfill_from_legacy.sql").read_text()
ACCOUNT = "ede6590ac0d2fb7daf155b35653457b2"


def main() -> int:
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")

    db.executescript("""
    CREATE TABLE user_oauth_tokens (
      user_id TEXT, provider TEXT, account_identifier TEXT, scope TEXT,
      is_active INTEGER DEFAULT 1, revoked_at INTEGER, updated_at INTEGER,
      PRIMARY KEY(user_id,provider,account_identifier)
    );
    CREATE TABLE r2_buckets (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'system', bucket_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL, description TEXT, region TEXT DEFAULT 'auto', public_access INTEGER DEFAULT 0,
      cors_enabled INTEGER DEFAULT 0, cors_config_json TEXT DEFAULT '{}', lifecycle_rules_json TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1, total_objects INTEGER DEFAULT 0, total_size_bytes INTEGER DEFAULT 0,
      created_by TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      s3_url TEXT, catalog_url TEXT, warehouse_name TEXT, public_dev_url TEXT, custom_domain TEXT,
      upload_enabled INTEGER DEFAULT 0, credentials_encrypted TEXT
    );
    CREATE TABLE r2_objects (
      id TEXT PRIMARY KEY, tenant_id TEXT DEFAULT 'system', bucket_id TEXT NOT NULL, object_key TEXT NOT NULL,
      display_name TEXT, content_type TEXT, file_size INTEGER, etag TEXT, checksum TEXT,
      metadata_json TEXT DEFAULT '{}', r2_metadata_json TEXT DEFAULT '{}', is_public INTEGER DEFAULT 0,
      public_url TEXT, version TEXT, storage_class TEXT DEFAULT 'STANDARD', tags TEXT, category TEXT,
      uploaded_by TEXT, is_active INTEGER DEFAULT 1, last_accessed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(bucket_id) REFERENCES r2_buckets(id), UNIQUE(bucket_id,object_key)
    );
    CREATE TABLE media_assets (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, project_id TEXT,
      source_kind TEXT NOT NULL DEFAULT 'r2', source_uri TEXT, bucket TEXT NOT NULL, object_key TEXT NOT NULL,
      filename TEXT, content_type TEXT, media_kind TEXT NOT NULL DEFAULT 'unknown', size_bytes INTEGER,
      duration_ms INTEGER, width INTEGER, height INTEGER, fps REAL, frame_count INTEGER,
      checksum_sha256 TEXT, etag TEXT, status TEXT NOT NULL DEFAULT 'registered', metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      vectorize_id TEXT, embed_model TEXT, embedded_at TEXT, stream_uid TEXT, cloudflare_account_id TEXT,
      provider_credential_source TEXT, created_by_user_id TEXT, created_from_workspace_id TEXT, provider_status TEXT
    );
    CREATE TABLE studio_templates (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, app_id TEXT NOT NULL, pack_slug TEXT, pack_title TEXT,
      category TEXT NOT NULL, title TEXT NOT NULL, description TEXT, use_case TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]', specs_json TEXT NOT NULL DEFAULT '{}',
      payload_bucket TEXT, payload_r2_key TEXT NOT NULL, payload_sha256 TEXT, preview_r2_key TEXT,
      source_refs_json TEXT NOT NULL DEFAULT '[]', definition_id TEXT, version INTEGER DEFAULT 1,
      scope TEXT DEFAULT 'platform', workspace_id TEXT, status TEXT DEFAULT 'active', sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE moviemode_templates (
      id TEXT PRIMARY KEY, pack_slug TEXT NOT NULL, pack_title TEXT NOT NULL, slug TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, template_kind TEXT DEFAULT 'clip', scope TEXT DEFAULT 'platform',
      workspace_id TEXT, tenant_id TEXT, stream_uid TEXT, stream_hls_url TEXT, thumbnail_url TEXT,
      duration_sec REAL, timeline_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}', sort_order INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 1, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE asset_relationships (
      id TEXT PRIMARY KEY DEFAULT ('rel_' || lower(hex(randomblob(8)))),
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL, metadata TEXT, created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(source_type,source_id,target_type,target_id,relationship_type)
    );
    """)

    db.execute("INSERT INTO user_oauth_tokens VALUES (?,?,?,?,?,?,?)", ("user_sam", "cloudflare", ACCOUNT, "workers-r2.read workers-r2.write", 1, None, 100))
    buckets = [
        ("r2_cad", "tenant_platform", "cad", "MeauxCAD"),
        ("r2_inneranimalmedia", "tenant_platform", "inneranimalmedia", "InnerAnimalMedia"),
        ("r2_agent_sam", "tenant_platform", "agent-sam", "Agent Sam"),
    ]
    for bucket_id, tenant_id, name, label in buckets:
        db.execute(
            "INSERT INTO r2_buckets (id,tenant_id,bucket_name,display_name,s3_url) VALUES (?,?,?,?,?)",
            (bucket_id, tenant_id, name, label, f"https://{ACCOUNT}.r2.cloudflarestorage.com/{name}"),
        )
    db.execute("INSERT INTO r2_objects (id,tenant_id,bucket_id,object_key,display_name,content_type,file_size,metadata_json,r2_metadata_json) VALUES (?,?,?,?,?,?,?,?,?)",
               ("obj_legacy", "tenant_platform", "r2_cad", "legacy/test.json", "legacy", "application/json", 10, "{}", "{}"))

    db.execute("""INSERT INTO media_assets
      (id,tenant_id,workspace_id,source_kind,source_uri,bucket,object_key,filename,content_type,media_kind,size_bytes,status,metadata_json,stream_uid,cloudflare_account_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("asset_stream", "tenant_platform", "ws_old", "stream", f"stream://{'a'*32}", "cloudflare_stream", f"stream/{ACCOUNT}/{'a'*32}", "clip.mp4", "video/mp4", "video", 1000, "ready", '{"stream_uid":"' + 'a'*32 + '","cloudflare_account_id":"' + ACCOUNT + '"}', 'a'*32, ACCOUNT))
    db.execute("""INSERT INTO media_assets
      (id,tenant_id,workspace_id,source_kind,source_uri,bucket,object_key,filename,content_type,media_kind,size_bytes,status,metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("asset_stream_r2_copy", "tenant_platform", "ws_old", "stream", 'a'*32, "inneranimalmedia", "moviemode/imports/source/stream/a.mp4", "clip-copy.mp4", "video/mp4", "video", 1000, "uploaded", '{"stream_uid":"' + 'a'*32 + '","imported_from":"cloudflare_stream"}'))
    db.execute("""INSERT INTO media_assets
      (id,tenant_id,workspace_id,source_kind,source_uri,bucket,object_key,filename,content_type,media_kind,size_bytes,status,metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("asset_image", "tenant_platform", "ws_old", "r2", None, "inneranimalmedia", "cms/photo.webp", "photo.webp", "image/webp", "image", 2000, "ready", "{}"))

    db.execute("""INSERT INTO studio_templates
      (id,sku,app_id,pack_slug,pack_title,category,title,tags_json,specs_json,payload_bucket,payload_r2_key,payload_sha256,source_refs_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
      ("tpl_test", "CAD-TEST-001", "cad-creator", "starter", "Starter", "architecture", "Test Villa", "[]", "{}", "cad", "studio-templates/cad-creator/platform/test/v1/project.json", "f"*64, "[]", "active"))
    db.execute("""INSERT INTO moviemode_templates (id,pack_slug,pack_title,slug,title,stream_uid,status)
      VALUES (?,?,?,?,?,?,?)""",
      ("mmtmpl_test", "starter-broll", "Starter B-roll", "test-clip", "Test clip", 'a'*32, "active"))

    db.executescript(PARK)
    db.executescript(DDL)
    db.executescript(DML)

    registrar_path = HERE / "06_register_stock_library.py"
    spec = importlib.util.spec_from_file_location("stock_registrar_test", registrar_path)
    registrar = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(registrar)
    with tempfile.TemporaryDirectory(prefix="agentsam-register-fixture-") as temporary:
        manifest_path = Path(temporary) / "manifest.json"
        source_key = "library/stock/samsketch/v1/stl/test-part.stl"
        payload_key = "library/stock/samsketch/v1/payload/source-part/test-part.json"
        preview_key = "library/stock/samsketch/v1/previews/test-part.webp"
        manifest = {
            "schema": "agentsam.stock-library-manifest.v1",
            "app_id": "samsketch",
            "bucket": "cad",
            "cloudflare_account_id": ACCOUNT,
            "version": "v1",
            "manifest_key": "library/stock/samsketch/v1/manifest.json",
            "objects": [
                {"key": source_key, "content_type": "model/stl", "size_bytes": 120, "sha256": "1"*64},
                {"key": payload_key, "content_type": "application/json", "size_bytes": 80, "sha256": "2"*64},
                {"key": preview_key, "content_type": "image/webp", "size_bytes": 40, "sha256": "3"*64},
            ],
            "entries": [{
                "id": "tpl_samsketch_source_part_test-part", "sku": "AB-999", "app_id": "samsketch",
                "kind": "source-part", "collection": "source-parts", "pack_slug": "source-parts",
                "pack_title": "Source parts", "category": "Source STL", "title": "Test Part",
                "tags": ["source-part"], "specs": {"kind": "source-part", "format": "STL"},
                "payload_bucket": "cad", "payload_r2_key": payload_key, "payload_sha256": "2"*64,
                "preview_r2_key": preview_key, "source_refs": [source_key], "status": "active", "sort_order": 1,
            }],
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        registration_sql, registered_objects, registered_entries = registrar.build_registration_sql(manifest, "r2_cad", manifest_path)
        db.executescript(registration_sql)

    table_names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    checks = {
        "no `_v2` tables exist": not any(name.endswith("_v2") for name in table_names),
        "legacy parked": {"r2_buckets_legacy", "r2_objects_legacy", "media_assets_legacy", "studio_templates_legacy"} <= table_names,
        "canonical tables present": {"r2_buckets", "r2_objects", "media_assets", "studio_templates", "r2_storage_routes"} <= table_names,
        "all three media rows copied": db.execute("SELECT COUNT(*) FROM media_assets").fetchone()[0] == 3,
        "Stream UID is not a bucket/key": db.execute("SELECT COUNT(*) FROM media_assets WHERE id='asset_stream' AND provider='cloudflare_stream' AND bucket_id IS NULL AND object_key IS NULL AND provider_resource_id=?", ('a'*32,)).fetchone()[0] == 1,
        "R2 copy of Stream source stays R2": db.execute("SELECT COUNT(*) FROM media_assets WHERE id='asset_stream_r2_copy' AND provider='r2' AND bucket_id='r2_inneranimalmedia' AND object_key LIKE 'moviemode/%'",).fetchone()[0] == 1,
        "CAD template copied": db.execute("SELECT COUNT(*) FROM studio_templates WHERE id='tpl_test' AND payload_bucket_id='r2_cad'").fetchone()[0] == 1,
        "first-party buckets seeded": db.execute("SELECT COUNT(*) FROM r2_buckets WHERE bucket_name IN ('cms','theme-store','inneranimalmedia-schemas')").fetchone()[0] == 3,
        "MovieMode relationship created": db.execute("SELECT COUNT(*) FROM asset_relationships WHERE source_type='moviemode_template' AND source_id='mmtmpl_test' AND relationship_type='uses_media'").fetchone()[0] == 1,
        "CAD payload relationship created": db.execute("SELECT COUNT(*) FROM asset_relationships WHERE source_type='studio_template' AND source_id='tpl_test' AND relationship_type='uses_payload'").fetchone()[0] == 1,
        "no workspace/tenant/project columns on media": not any(row["name"] in {"tenant_id","workspace_id","project_id"} for row in db.execute("PRAGMA table_info(media_assets)")),
        "no bucket credentials copied": "credentials_encrypted" not in db.execute("SELECT sql FROM sqlite_master WHERE name='r2_buckets'").fetchone()[0],
        "stock manifest registers its R2 objects": db.execute("SELECT COUNT(*) FROM r2_objects WHERE object_key LIKE 'library/stock/samsketch/v1/%'").fetchone()[0] == 4,
        "stock manifest registers reusable catalog entry": db.execute("SELECT COUNT(*) FROM studio_templates WHERE id='tpl_samsketch_source_part_test-part' AND resource_kind='source_part'").fetchone()[0] == 1,
        "stock catalog links payload, preview and source": db.execute("SELECT COUNT(*) FROM asset_relationships WHERE source_type='studio_template' AND source_id='tpl_samsketch_source_part_test-part' AND relationship_type IN ('uses_payload','uses_preview','uses_source')").fetchone()[0] == 3,
        "registration DML counts expected objects and entries": registered_objects == 4 and registered_entries == 1,
    }
    failures = 0
    for label, passed in checks.items():
        print(f"{'PASS' if passed else 'FAIL'}  {label}")
        failures += 0 if passed else 1
    print(f"\n{len(checks)-failures}/{len(checks)} offline migration checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
