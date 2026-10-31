-- Portable product release registry (themes, apps, desktop natives, SDK packs).
-- Product identity stays on agentsam_products (live host catalog).
-- This table is versioned immutable artifacts only — not plugins, not billing SKUs,
-- not dashboard_versions, not per-user agentsam_artifacts.

CREATE TABLE IF NOT EXISTS agentsam_product_releases (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  product_slug TEXT NOT NULL,
  desktop_app_id TEXT,
  sku TEXT,
  version TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'release'
    CHECK (channel IN ('test', 'preview', 'release')),
  release_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (release_status IN ('draft', 'staged', 'published', 'yanked')),
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'needs_review', 'approved', 'rejected')),
  artifact_kind TEXT NOT NULL
    CHECK (artifact_kind IN (
      'theme_zip',
      'app_bundle',
      'desktop_native',
      'sdk_tarball',
      'cms_seed',
      'preview_site',
      'other'
    )),
  target TEXT,
  arch TEXT,
  r2_bucket TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  artifact_url TEXT,
  sha256 TEXT,
  signature TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  source_sha TEXT,
  package_name TEXT,
  preview_url TEXT,
  cms_manifest_url TEXT,
  compatible_schema_version TEXT,
  runtime_requirements_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(runtime_requirements_json) AND json_type(runtime_requirements_json) = 'object'),
  entitlement_policy_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(entitlement_policy_json) AND json_type(entitlement_policy_json) = 'object'),
  notes TEXT,
  pub_date TEXT,
  published_at_unix INTEGER,
  yanked_at_unix INTEGER,
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  CHECK (target IS NULL OR target IN ('darwin', 'macos', 'linux', 'windows', 'any')),
  CHECK (arch IS NULL OR arch IN ('aarch64', 'x86_64', 'any')),
  -- Desktop rows always carry platform; signature + artifact_url required before publish (app layer).
  CHECK (
    artifact_kind <> 'desktop_native'
    OR (target IS NOT NULL AND arch IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agentsam_product_releases_coord
  ON agentsam_product_releases (
    product_slug,
    version,
    channel,
    artifact_kind,
    ifnull(target, ''),
    ifnull(arch, '')
  );

CREATE INDEX IF NOT EXISTS idx_agentsam_product_releases_lookup
  ON agentsam_product_releases (
    product_slug,
    artifact_kind,
    channel,
    release_status,
    published_at_unix
  );

CREATE INDEX IF NOT EXISTS idx_agentsam_product_releases_desktop
  ON agentsam_product_releases (
    desktop_app_id,
    artifact_kind,
    channel,
    target,
    arch,
    release_status
  )
  WHERE desktop_app_id IS NOT NULL AND artifact_kind = 'desktop_native';

CREATE INDEX IF NOT EXISTS idx_agentsam_product_releases_sku
  ON agentsam_product_releases (sku, version)
  WHERE sku IS NOT NULL;
