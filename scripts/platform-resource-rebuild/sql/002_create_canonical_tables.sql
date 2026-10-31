-- Create the rebuilt schema under its final table names.
-- Prerequisite: 001_park_legacy.sql has freed these names.

CREATE TABLE IF NOT EXISTS r2_buckets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'cloudflare_r2',
  provider_account_id TEXT,
  bucket_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  region TEXT DEFAULT 'auto',
  tenant_id TEXT, -- legacy business tenant; not used as Cloudflare authorization
  ownership_type TEXT NOT NULL DEFAULT 'legacy_unresolved'
    CHECK (ownership_type IN ('platform','user','tenant','external','legacy_unresolved')),
  owner_id TEXT,
  connection_user_id TEXT,
  connection_account_identifier TEXT,
  access_mode TEXT NOT NULL DEFAULT 'oauth_api'
    CHECK (access_mode IN ('binding','oauth_api','s3')),
  binding_name TEXT,
  public_access INTEGER NOT NULL DEFAULT 0,
  cors_enabled INTEGER NOT NULL DEFAULT 0,
  cors_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(cors_config_json)),
  lifecycle_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(lifecycle_rules_json)),
  is_active INTEGER NOT NULL DEFAULT 1,
  total_objects INTEGER NOT NULL DEFAULT 0,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  inventory_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (inventory_status IN ('unverified','legacy_unverified','partial','verified','stale')),
  last_inventory_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  s3_url TEXT,
  catalog_url TEXT,
  warehouse_name TEXT,
  public_dev_url TEXT,
  custom_domain TEXT,
  upload_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_r2_buckets_account_name
  ON r2_buckets(provider_account_id, bucket_name)
  WHERE provider_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_r2_buckets_unresolved_name
  ON r2_buckets(bucket_name)
  WHERE provider_account_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_r2_buckets_owner
  ON r2_buckets(ownership_type, owner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_r2_buckets_connection
  ON r2_buckets(connection_user_id, connection_account_identifier);

CREATE TABLE IF NOT EXISTS r2_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  bucket_id TEXT NOT NULL REFERENCES r2_buckets(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  display_name TEXT,
  content_type TEXT,
  file_size INTEGER,
  etag TEXT,
  checksum TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  r2_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(r2_metadata_json)),
  is_public INTEGER NOT NULL DEFAULT 0,
  public_url TEXT,
  version TEXT,
  storage_class TEXT DEFAULT 'STANDARD',
  tags TEXT,
  category TEXT,
  uploaded_by TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_accessed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  inventory_source TEXT NOT NULL DEFAULT 'legacy_cache'
    CHECK (inventory_source IN ('legacy_cache','catalog_reference','publisher','r2_scan')),
  verified_at INTEGER,
  UNIQUE(bucket_id, object_key)
);
CREATE INDEX IF NOT EXISTS idx_r2_objects_bucket_key
  ON r2_objects(bucket_id, object_key);
CREATE INDEX IF NOT EXISTS idx_r2_objects_category
  ON r2_objects(category, created_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL
    CHECK (provider IN ('r2','cloudflare_stream','cloudflare_images','google_drive','external','local')),
  provider_account_id TEXT,
  provider_resource_id TEXT,
  bucket_id TEXT REFERENCES r2_buckets(id) ON DELETE SET NULL,
  object_key TEXT,
  source_uri TEXT,
  filename TEXT,
  content_type TEXT,
  media_kind TEXT NOT NULL DEFAULT 'unknown'
    CHECK (media_kind IN ('video','image','audio','text','binary','unknown')),
  size_bytes INTEGER,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  fps REAL,
  frame_count INTEGER,
  checksum_sha256 TEXT,
  etag TEXT,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','uploaded','analyzing','ready','failed','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (provider <> 'cloudflare_stream' OR
    (bucket_id IS NULL AND object_key IS NULL AND provider_resource_id IS NOT NULL)),
  CHECK (provider <> 'r2' OR (bucket_id IS NOT NULL AND object_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_provider_resource
  ON media_assets(provider, provider_account_id, provider_resource_id)
  WHERE provider_resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_r2_object
  ON media_assets(bucket_id, object_key)
  WHERE bucket_id IS NOT NULL AND object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_kind_status
  ON media_assets(media_kind, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_provider_account
  ON media_assets(provider, provider_account_id);

CREATE TABLE IF NOT EXISTS studio_templates (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  app_id TEXT NOT NULL,
  resource_kind TEXT NOT NULL,
  pack_slug TEXT,
  pack_title TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  use_case TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  specs_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(specs_json) AND json_type(specs_json) = 'object'),
  payload_bucket_id TEXT REFERENCES r2_buckets(id) ON DELETE SET NULL,
  payload_r2_key TEXT,
  payload_sha256 TEXT,
  payload_schema_uri TEXT,
  preview_bucket_id TEXT REFERENCES r2_buckets(id) ON DELETE SET NULL,
  preview_r2_key TEXT,
  renderer_key TEXT,
  compatible_apps_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(compatible_apps_json) AND json_type(compatible_apps_json) = 'array'),
  source_refs_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(source_refs_json) AND json_type(source_refs_json) = 'array'),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_studio_templates_app
  ON studio_templates(app_id, status, resource_kind, pack_slug, sort_order);
CREATE INDEX IF NOT EXISTS idx_studio_templates_kind
  ON studio_templates(resource_kind, status, category);

CREATE TABLE IF NOT EXISTS r2_storage_routes (
  id TEXT PRIMARY KEY,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('platform','user','tenant')),
  principal_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  bucket_id TEXT NOT NULL REFERENCES r2_buckets(id) ON DELETE RESTRICT,
  is_default INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(principal_type, principal_id, app_id, purpose)
);
CREATE INDEX IF NOT EXISTS idx_r2_storage_routes_bucket
  ON r2_storage_routes(bucket_id, status);
