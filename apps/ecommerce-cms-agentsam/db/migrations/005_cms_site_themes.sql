-- Installed website/storefront theme instances. SQLite and Cloudflare D1 compatible.
-- Requires 004_cms_site_first.sql (cms_sites + composite site/account identity).
-- NOT cms_themes: that table owns admin-shell appearance/colorways.
-- Append-only migration. Do not backfill incomplete theme-project snapshots.
CREATE TABLE IF NOT EXISTS cms_site_themes (
  id TEXT PRIMARY KEY DEFAULT ('cmst_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  site_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),

  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('catalog', 'zip', 'github', 'canvas', 'custom', 'import')
  ),
  source_product_id TEXT REFERENCES agentsam_products(id) ON DELETE SET NULL,
  source_release_id TEXT REFERENCES agentsam_product_releases(id) ON DELETE SET NULL,
  source_ref TEXT,
  source_version TEXT,

  -- Installation readiness and active publication are independent states.
  status TEXT NOT NULL DEFAULT 'installing'
    CHECK (status IN ('installing', 'ready', 'failed', 'archived')),
  is_live INTEGER NOT NULL DEFAULT 0 CHECK (is_live IN (0, 1)),

  -- Logical storage alias resolved by the host's app manifest, not a raw bucket.
  storage_ref TEXT,
  draft_manifest_key TEXT,
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  published_manifest_key TEXT,
  published_revision INTEGER CHECK (published_revision IS NULL OR published_revision >= 0),
  preview_image_key TEXT,

  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,

  FOREIGN KEY (site_id, account_id)
    REFERENCES cms_sites(id, account_id) ON DELETE CASCADE,
  CHECK (status != 'ready' OR (
    storage_ref IS NOT NULL AND length(trim(storage_ref)) > 0
    AND draft_manifest_key IS NOT NULL AND length(trim(draft_manifest_key)) > 0
  )),
  CHECK ((published_manifest_key IS NULL) = (published_revision IS NULL)),
  CHECK (is_live = 0 OR (
    status = 'ready' AND published_manifest_key IS NOT NULL
  ))
);

CREATE INDEX IF NOT EXISTS idx_cms_site_themes_site_status
  ON cms_site_themes(site_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cms_site_themes_account_site
  ON cms_site_themes(account_id, site_id, created_at DESC);

-- No limit on drafts/installed copies; at most one live theme per site.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_site_themes_one_live_per_site
  ON cms_site_themes(site_id) WHERE is_live = 1;
