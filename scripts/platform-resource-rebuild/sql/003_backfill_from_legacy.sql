-- Idempotent DML into the canonical tables from parked *_legacy sources.
-- No `_v2` names. Rollback remains the 01_backup.py export.

-- 1. Copy existing R2 buckets, deriving the Cloudflare account from each S3 endpoint.
WITH bucket_source AS (
  SELECT b.*,
    CASE
      WHEN b.s3_url LIKE 'https://%.r2.cloudflarestorage.com%'
      THEN substr(
        substr(b.s3_url, 9),
        1,
        instr(substr(b.s3_url, 9), '.r2.cloudflarestorage.com') - 1
      )
      ELSE NULL
    END AS resolved_account_id
  FROM r2_buckets_legacy b
)
INSERT INTO r2_buckets (
  id, provider, provider_account_id, bucket_name, display_name, description, region,
  tenant_id, ownership_type, owner_id,
  connection_user_id, connection_account_identifier,
  access_mode, binding_name,
  public_access, cors_enabled, cors_config_json, lifecycle_rules_json,
  is_active, total_objects, total_size_bytes, inventory_status, last_inventory_at,
  created_by, created_at, updated_at,
  s3_url, catalog_url, warehouse_name, public_dev_url, custom_domain, upload_enabled
)
SELECT
  s.id, 'cloudflare_r2', s.resolved_account_id, s.bucket_name, s.display_name, s.description, s.region,
  s.tenant_id,
  CASE WHEN s.tenant_id IN ('system','tenant_platform') THEN 'platform' ELSE 'tenant' END,
  CASE WHEN s.tenant_id IN ('system','tenant_platform') THEN 'platform' ELSE s.tenant_id END,
  (SELECT o.user_id FROM user_oauth_tokens o
    WHERE lower(o.provider) = 'cloudflare'
      AND o.account_identifier = s.resolved_account_id
      AND COALESCE(o.is_active,1) = 1
      AND (o.revoked_at IS NULL OR o.revoked_at = 0)
    ORDER BY o.updated_at DESC LIMIT 1),
  s.resolved_account_id,
  CASE WHEN s.bucket_name IN ('cad','agentsam-os-blueprint-content') THEN 'binding' ELSE 'oauth_api' END,
  CASE
    WHEN s.bucket_name = 'cad' THEN 'CAD_PROJECT_ASSETS'
    WHEN s.bucket_name = 'agentsam-os-blueprint-content' THEN 'WEBSITE_ASSETS'
    ELSE NULL
  END,
  COALESCE(s.public_access,0), COALESCE(s.cors_enabled,0),
  COALESCE(s.cors_config_json,'{}'), COALESCE(s.lifecycle_rules_json,'{}'),
  COALESCE(s.is_active,1), COALESCE(s.total_objects,0), COALESCE(s.total_size_bytes,0),
  CASE WHEN s.bucket_name = 'cad' THEN 'partial' ELSE 'legacy_unverified' END,
  NULL, s.created_by, s.created_at, s.updated_at,
  s.s3_url, s.catalog_url, s.warehouse_name, s.public_dev_url, s.custom_domain, COALESCE(s.upload_enabled,0)
FROM bucket_source s
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  provider_account_id=excluded.provider_account_id,
  bucket_name=excluded.bucket_name,
  display_name=excluded.display_name,
  description=excluded.description,
  region=excluded.region,
  tenant_id=excluded.tenant_id,
  ownership_type=excluded.ownership_type,
  owner_id=excluded.owner_id,
  connection_user_id=excluded.connection_user_id,
  connection_account_identifier=excluded.connection_account_identifier,
  access_mode=excluded.access_mode,
  binding_name=excluded.binding_name,
  public_access=excluded.public_access,
  cors_enabled=excluded.cors_enabled,
  cors_config_json=excluded.cors_config_json,
  lifecycle_rules_json=excluded.lifecycle_rules_json,
  is_active=excluded.is_active,
  total_objects=excluded.total_objects,
  total_size_bytes=excluded.total_size_bytes,
  s3_url=excluded.s3_url,
  catalog_url=excluded.catalog_url,
  warehouse_name=excluded.warehouse_name,
  public_dev_url=excluded.public_dev_url,
  custom_domain=excluded.custom_domain,
  upload_enabled=excluded.upload_enabled,
  updated_at=excluded.updated_at;

-- 2. Register the three first-party buckets shown in Cloudflare but absent from legacy r2_buckets.
INSERT OR IGNORE INTO r2_buckets (
  id, provider, provider_account_id, bucket_name, display_name, description, region,
  tenant_id, ownership_type, owner_id, connection_user_id, connection_account_identifier,
  access_mode, public_access, is_active, total_objects, total_size_bytes, inventory_status,
  created_at, updated_at, s3_url, catalog_url, warehouse_name, custom_domain
) VALUES
(
  'r2_platform_cms','cloudflare_r2','ede6590ac0d2fb7daf155b35653457b2','cms','CMS assets',
  'First-party CMS media and public website assets. Private drafts must use a separate access path.',
  'WNAM','tenant_platform','platform','platform',
  (SELECT user_id FROM user_oauth_tokens WHERE lower(provider)='cloudflare' AND account_identifier='ede6590ac0d2fb7daf155b35653457b2' AND COALESCE(is_active,1)=1 AND (revoked_at IS NULL OR revoked_at=0) ORDER BY updated_at DESC LIMIT 1),
  'ede6590ac0d2fb7daf155b35653457b2','oauth_api',1,1,0,0,'unverified',unixepoch(),unixepoch(),
  'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/cms',NULL,NULL,'cms.inneranimalmedia.com'
),
(
  'r2_platform_theme_store','cloudflare_r2','ede6590ac0d2fb7daf155b35653457b2','theme-store','Theme Store',
  'Private installable themes, style packs, design systems and prebuild packages.',
  'WNAM','tenant_platform','platform','platform',
  (SELECT user_id FROM user_oauth_tokens WHERE lower(provider)='cloudflare' AND account_identifier='ede6590ac0d2fb7daf155b35653457b2' AND COALESCE(is_active,1)=1 AND (revoked_at IS NULL OR revoked_at=0) ORDER BY updated_at DESC LIMIT 1),
  'ede6590ac0d2fb7daf155b35653457b2','oauth_api',0,1,0,0,'unverified',unixepoch(),unixepoch(),
  'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/theme-store',NULL,NULL,NULL
),
(
  'r2_platform_schemas','cloudflare_r2','ede6590ac0d2fb7daf155b35653457b2','inneranimalmedia-schemas','InnerAnimalMedia Schemas',
  'Versioned application and package schema registry.',
  'WNAM','tenant_platform','platform','platform',
  (SELECT user_id FROM user_oauth_tokens WHERE lower(provider)='cloudflare' AND account_identifier='ede6590ac0d2fb7daf155b35653457b2' AND COALESCE(is_active,1)=1 AND (revoked_at IS NULL OR revoked_at=0) ORDER BY updated_at DESC LIMIT 1),
  'ede6590ac0d2fb7daf155b35653457b2','oauth_api',1,1,0,0,'unverified',unixepoch(),unixepoch(),
  'https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/inneranimalmedia-schemas',
  'https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/inneranimalmedia-schemas',
  'ede6590ac0d2fb7daf155b35657b2_inneranimalmedia-schemas','schemas.inneranimalmedia.com'
);

-- 3. Preserve the existing object cache. It is explicitly marked as legacy/unverified.
INSERT OR IGNORE INTO r2_objects (
  id, tenant_id, bucket_id, object_key, display_name, content_type, file_size, etag, checksum,
  metadata_json, r2_metadata_json, is_public, public_url, version, storage_class, tags, category,
  uploaded_by, is_active, last_accessed_at, created_at, updated_at, inventory_source, verified_at
)
SELECT
  o.id, o.tenant_id, o.bucket_id, o.object_key, o.display_name, o.content_type, o.file_size, o.etag, o.checksum,
  COALESCE(o.metadata_json,'{}'), COALESCE(o.r2_metadata_json,'{}'), COALESCE(o.is_public,0), o.public_url,
  o.version, COALESCE(o.storage_class,'STANDARD'), o.tags, o.category, o.uploaded_by,
  COALESCE(o.is_active,1), o.last_accessed_at, o.created_at, o.updated_at, 'legacy_cache', NULL
FROM r2_objects_legacy o;

-- 4. Add the seven already-published CAD template payloads to the object inventory.
INSERT OR IGNORE INTO r2_objects (
  id, tenant_id, bucket_id, object_key, display_name, content_type, file_size, checksum,
  metadata_json, r2_metadata_json, is_public, storage_class, category, is_active,
  created_at, updated_at, inventory_source, verified_at
)
SELECT
  'obj_studio_template_' || s.id, 'tenant_platform', b.id, s.payload_r2_key,
  s.title || ' payload', 'application/json', NULL, s.payload_sha256,
  json_object('catalog_table','studio_templates','catalog_id',s.id,'sha256',s.payload_sha256),
  '{}', 0, 'STANDARD', 'cad-template-payload', 1, unixepoch(), unixepoch(), 'catalog_reference', NULL
FROM studio_templates_legacy s
JOIN r2_buckets b ON b.bucket_name=s.payload_bucket AND b.ownership_type='platform'
WHERE s.payload_bucket='cad' AND s.payload_r2_key IS NOT NULL;

-- 5. Normalize media identity. Stream UIDs are provider resource IDs, never R2 bucket/key pairs.
WITH mapped AS (
  SELECT m.*,
    b.id AS resolved_bucket_id,
    b.provider_account_id AS resolved_bucket_account_id,
    COALESCE(
      m.stream_uid,
      CASE WHEN json_valid(m.metadata_json) THEN json_extract(m.metadata_json,'$.stream_uid') END,
      CASE WHEN m.source_uri LIKE 'stream://%' THEN substr(m.source_uri,10) END
    ) AS resolved_stream_uid
  FROM media_assets_legacy m
  LEFT JOIN r2_buckets b
    ON b.bucket_name=m.bucket
   AND (m.cloudflare_account_id IS NULL OR b.provider_account_id=m.cloudflare_account_id)
), classified AS (
  SELECT mapped.*,
    CASE
      WHEN bucket='cloudflare_stream' AND resolved_stream_uid IS NOT NULL THEN 'cloudflare_stream'
      WHEN resolved_bucket_id IS NOT NULL AND object_key IS NOT NULL THEN 'r2'
      ELSE 'external'
    END AS resolved_provider
  FROM mapped
)
INSERT INTO media_assets (
  id, provider, provider_account_id, provider_resource_id, bucket_id, object_key, source_uri,
  filename, content_type, media_kind, size_bytes, duration_ms, width, height, fps, frame_count,
  checksum_sha256, etag, status, metadata_json, created_by_user_id, created_at, updated_at
)
SELECT
  id,
  resolved_provider,
  CASE
    WHEN resolved_provider='cloudflare_stream' THEN COALESCE(
      cloudflare_account_id,
      CASE WHEN json_valid(metadata_json) THEN json_extract(metadata_json,'$.cloudflare_account_id') END
    )
    WHEN resolved_provider='r2' THEN resolved_bucket_account_id
    ELSE cloudflare_account_id
  END,
  CASE WHEN resolved_provider='cloudflare_stream' THEN resolved_stream_uid ELSE NULL END,
  CASE WHEN resolved_provider='r2' THEN resolved_bucket_id ELSE NULL END,
  CASE WHEN resolved_provider='cloudflare_stream' THEN NULL ELSE object_key END,
  CASE
    WHEN resolved_provider='cloudflare_stream' THEN 'stream://' || resolved_stream_uid
    WHEN resolved_provider='r2' THEN 'r2://' || COALESCE(resolved_bucket_account_id,'unresolved') || '/' || bucket || '/' || object_key
    ELSE source_uri
  END,
  filename, content_type, media_kind, size_bytes, duration_ms, width, height, fps, frame_count,
  checksum_sha256, etag, status,
  CASE
    WHEN resolved_provider='r2' AND resolved_stream_uid IS NOT NULL THEN
      json_set(
        json_set(
          CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
          '$.migration.legacy',
          json_object(
            'source_kind',source_kind,'bucket',bucket,'object_key',object_key,
            'tenant_id',tenant_id,'workspace_id',workspace_id,'project_id',project_id,
            'created_from_workspace_id',created_from_workspace_id,'source_uri',source_uri
          )
        ),
        '$.origin.provider','cloudflare_stream',
        '$.origin.resource_id',resolved_stream_uid
      )
    ELSE
      json_set(
        CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
        '$.migration.legacy',
        json_object(
          'source_kind',source_kind,'bucket',bucket,'object_key',object_key,
          'tenant_id',tenant_id,'workspace_id',workspace_id,'project_id',project_id,
          'created_from_workspace_id',created_from_workspace_id,'source_uri',source_uri
        )
      )
  END,
  created_by_user_id, created_at, updated_at
FROM classified
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  provider=excluded.provider,
  provider_account_id=excluded.provider_account_id,
  provider_resource_id=excluded.provider_resource_id,
  bucket_id=excluded.bucket_id,
  object_key=excluded.object_key,
  source_uri=excluded.source_uri,
  filename=excluded.filename,
  content_type=excluded.content_type,
  media_kind=excluded.media_kind,
  size_bytes=excluded.size_bytes,
  duration_ms=excluded.duration_ms,
  width=excluded.width,
  height=excluded.height,
  fps=excluded.fps,
  frame_count=excluded.frame_count,
  checksum_sha256=excluded.checksum_sha256,
  etag=excluded.etag,
  status=excluded.status,
  metadata_json=excluded.metadata_json,
  created_by_user_id=excluded.created_by_user_id,
  updated_at=excluded.updated_at;

-- 6. Rebuild the reusable catalog without workspace/tenant scope.
INSERT INTO studio_templates (
  id, sku, app_id, resource_kind, pack_slug, pack_title, category, title, description, use_case,
  tags_json, specs_json, payload_bucket_id, payload_r2_key, payload_sha256,
  preview_bucket_id, preview_r2_key, compatible_apps_json, source_refs_json,
  version, status, sort_order, created_at, updated_at
)
SELECT
  s.id, s.sku, s.app_id,
  CASE WHEN s.app_id='cad-creator' THEN 'cad_project_template' ELSE 'creative_template' END,
  s.pack_slug, s.pack_title, s.category, s.title, s.description, s.use_case,
  COALESCE(s.tags_json,'[]'), COALESCE(s.specs_json,'{}'),
  b.id, s.payload_r2_key, s.payload_sha256,
  CASE WHEN s.preview_r2_key IS NOT NULL THEN b.id ELSE NULL END,
  s.preview_r2_key,
  json_array(s.app_id), COALESCE(s.source_refs_json,'[]'),
  COALESCE(s.version,1),
  CASE WHEN b.id IS NULL THEN 'draft' ELSE s.status END,
  COALESCE(s.sort_order,0), s.created_at, s.updated_at
FROM studio_templates_legacy s
LEFT JOIN r2_buckets b
  ON b.bucket_name=s.payload_bucket AND b.ownership_type='platform'
WHERE 1
ON CONFLICT(id) DO UPDATE SET
  sku=excluded.sku,
  app_id=excluded.app_id,
  resource_kind=excluded.resource_kind,
  pack_slug=excluded.pack_slug,
  pack_title=excluded.pack_title,
  category=excluded.category,
  title=excluded.title,
  description=excluded.description,
  use_case=excluded.use_case,
  tags_json=excluded.tags_json,
  specs_json=excluded.specs_json,
  payload_bucket_id=excluded.payload_bucket_id,
  payload_r2_key=excluded.payload_r2_key,
  payload_sha256=excluded.payload_sha256,
  preview_bucket_id=excluded.preview_bucket_id,
  preview_r2_key=excluded.preview_r2_key,
  compatible_apps_json=excluded.compatible_apps_json,
  source_refs_json=excluded.source_refs_json,
  status=excluded.status,
  sort_order=excluded.sort_order,
  updated_at=excluded.updated_at;

-- 7. Store routing decisions separately from bucket identity.
INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_cad_creator_stock','platform','platform','cad-creator','stock-library',id,1,'active'
FROM r2_buckets WHERE bucket_name='cad' AND ownership_type='platform';

INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_samsketch_stock','platform','platform','samsketch','stock-library',id,1,'active'
FROM r2_buckets WHERE bucket_name='cad' AND ownership_type='platform';

INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_cms_assets','platform','platform','cms','public-assets',id,1,'active'
FROM r2_buckets WHERE bucket_name='cms' AND ownership_type='platform';

INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_theme_packages','platform','platform','agentsam-theme-store','installable-packages',id,1,'active'
FROM r2_buckets WHERE bucket_name='theme-store' AND ownership_type='platform';

INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_schema_registry','platform','platform','agentsam-content','schema-registry',id,1,'active'
FROM r2_buckets WHERE bucket_name='inneranimalmedia-schemas' AND ownership_type='platform';

INSERT OR IGNORE INTO r2_storage_routes (
  id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status
)
SELECT 'route_platform_d1_backups','platform','platform','agentsam-ops','database-backups',id,1,'active'
FROM r2_buckets WHERE bucket_name='agent-sam' AND ownership_type='platform';

-- 8. Connect MovieMode starter clips to canonical Stream media records.
INSERT OR IGNORE INTO asset_relationships (
  id, source_type, source_id, target_type, target_id, relationship_type, metadata, created_at
)
SELECT
  'rel_moviemode_' || m.id,
  'moviemode_template', m.id,
  'media_asset', a.id,
  'uses_media',
  json_object('pack_slug',m.pack_slug,'stream_uid',m.stream_uid),
  unixepoch()
FROM moviemode_templates m
JOIN media_assets a
  ON a.provider='cloudflare_stream' AND a.provider_resource_id=m.stream_uid;

-- 9. Connect CAD template rows to their R2 payload inventory entries.
INSERT OR IGNORE INTO asset_relationships (
  id, source_type, source_id, target_type, target_id, relationship_type, metadata, created_at
)
SELECT
  'rel_template_payload_' || s.id,
  'studio_template', s.id,
  'r2_object', 'obj_studio_template_' || s.id,
  'uses_payload',
  json_object('bucket_id',s.payload_bucket_id,'object_key',s.payload_r2_key),
  unixepoch()
FROM studio_templates s
WHERE s.payload_bucket_id IS NOT NULL AND s.payload_r2_key IS NOT NULL;
