-- Make cms_sites the sole page-ownership authority.
--
-- cms_pages already has 79 valid site_id values. Its old project_id UNIQUE
-- constraints prevent a site from having a stable site-scoped route namespace
-- and one site (inneranimalmedia) already has two unrelated project IDs.
--
-- D1 enforces foreign keys for every query and does not allow foreign_keys=OFF
-- to disable enforcement. Defer checks while the connected CMS tables are
-- rebuilt together, then force validation before the migration completes.
--
-- Preserve complete pre-migration snapshots for every table being rebuilt.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE cms_mig_backup_cms_pages_20261103 AS
SELECT * FROM cms_pages;
CREATE TABLE cms_mig_backup_cms_page_sections_20261103 AS
SELECT * FROM cms_page_sections;
CREATE TABLE cms_mig_backup_cms_section_blocks_20261103 AS
SELECT * FROM cms_section_blocks;
CREATE TABLE cms_mig_backup_cms_liquid_sections_20261103 AS
SELECT * FROM cms_liquid_sections;
CREATE TABLE cms_mig_backup_cms_live_edit_sessions_20261103 AS
SELECT * FROM cms_live_edit_sessions;

-- Rename the dependency graph first. SQLite updates the old tables' foreign
-- keys to these legacy names, leaving the new canonical names available.
ALTER TABLE cms_pages RENAME TO cms_pages__legacy_20261103;
ALTER TABLE cms_page_sections RENAME TO cms_page_sections__legacy_20261103;
ALTER TABLE cms_section_blocks RENAME TO cms_section_blocks__legacy_20261103;
ALTER TABLE cms_liquid_sections RENAME TO cms_liquid_sections__legacy_20261103;
ALTER TABLE cms_live_edit_sessions RENAME TO cms_live_edit_sessions__legacy_20261103;

CREATE TABLE cms_pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  route_path TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN (
    'home','about','services','work','case_study','contact','pricing',
    'privacy','terms','faq','product','collection','blog','post',
    'landing','portal','dashboard','auth','sitemap','custom'
  )),
  title TEXT NOT NULL,
  meta_description TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived','scheduled')),
  seo_title TEXT,
  canonical_url TEXT,
  robots TEXT DEFAULT 'index,follow',
  og_image_asset_id TEXT,
  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  content_type TEXT DEFAULT 'text/html',
  content_size_bytes INTEGER DEFAULT 0,
  config_json TEXT DEFAULT '{}',
  seo_json TEXT DEFAULT '{}',
  analytics_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  is_system_page INTEGER DEFAULT 0,
  requires_auth INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  published_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  archived_at INTEGER,
  nav_visible INTEGER NOT NULL DEFAULT 1,
  published_manifest_r2_key TEXT,
  definition_id TEXT REFERENCES cms_definitions(id),
  template_sku TEXT REFERENCES cms_component_templates(sku),
  site_id TEXT NOT NULL REFERENCES cms_sites(id),
  UNIQUE (site_id, slug),
  UNIQUE (site_id, route_path)
);

INSERT INTO cms_pages (
  id, slug, route_path, page_type, title, meta_description, description,
  status, seo_title, canonical_url, robots, og_image_asset_id,
  r2_bucket, r2_key, r2_url, content_type, content_size_bytes,
  config_json, seo_json, analytics_json, metadata_json,
  is_system_page, requires_auth, sort_order,
  created_by, updated_by, published_by,
  created_at, updated_at, published_at, archived_at, nav_visible,
  published_manifest_r2_key, definition_id, template_sku, site_id
)
SELECT
  id, slug, route_path, page_type, title, meta_description, description,
  status, seo_title, canonical_url, robots, og_image_asset_id,
  r2_bucket, r2_key, r2_url, content_type, content_size_bytes,
  config_json, seo_json, analytics_json, metadata_json,
  is_system_page, requires_auth, sort_order,
  created_by, updated_by, published_by,
  created_at, updated_at, published_at, archived_at, nav_visible,
  published_manifest_r2_key, definition_id, template_sku, site_id
FROM cms_pages__legacy_20261103;

-- These two tables form a nullable reference cycle: page sections can map to
-- imported Liquid sections, and imported Liquid sections can map back to a
-- page section. Create both canonical tables before copying either one.
CREATE TABLE cms_liquid_sections (
  id TEXT PRIMARY KEY DEFAULT ('lsec_' || lower(hex(randomblob(8)))),
  import_id TEXT NOT NULL REFERENCES cms_liquid_imports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_type TEXT,
  liquid_source TEXT,
  schema_json TEXT DEFAULT '{}',
  settings_map_json TEXT DEFAULT '{}',
  render_deps TEXT DEFAULT '[]',
  mapped_template_id TEXT REFERENCES cms_component_templates(id) ON DELETE SET NULL,
  mapped_section_id TEXT REFERENCES cms_page_sections(id) ON DELETE SET NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending','parsed','mapped','registered','failed')),
  parse_error TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  site_id TEXT NOT NULL REFERENCES cms_sites(id)
);

CREATE TABLE cms_page_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  section_name TEXT NOT NULL,
  section_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  css_classes TEXT,
  custom_css TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  liquid_section_id TEXT REFERENCES cms_liquid_sections(id) ON DELETE SET NULL,
  created_at_unix INTEGER,
  draft_r2_key TEXT,
  published_r2_key TEXT,
  r2_bucket TEXT NOT NULL DEFAULT 'cms',
  content_hash TEXT,
  published_hash TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  definition_id TEXT REFERENCES cms_definitions(id),
  template_sku TEXT REFERENCES cms_component_templates(sku),
  section_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
);

CREATE TABLE cms_section_blocks (
  id TEXT PRIMARY KEY DEFAULT ('cmsb_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  section_id TEXT NOT NULL REFERENCES cms_page_sections(id) ON DELETE CASCADE,
  parent_block_id TEXT REFERENCES cms_section_blocks(id) ON DELETE CASCADE,
  block_key TEXT NOT NULL,
  block_type TEXT NOT NULL,
  definition_id TEXT REFERENCES cms_definitions(id),
  template_sku TEXT REFERENCES cms_component_templates(sku),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','hidden','archived')),
  content_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(content_json) AND json_type(content_json)='object'),
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(settings_json) AND json_type(settings_json)='object'),
  source_path TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (parent_block_id IS NULL OR parent_block_id != id),
  UNIQUE (section_id, block_key)
);

CREATE TABLE cms_live_edit_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  is_active INTEGER DEFAULT 1,
  last_activity TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
);

-- Restore every row, including the cyclic Liquid/page-section mappings and
-- nested block parent references. Deferred validation is resolved below.
INSERT INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order,
  is_visible, css_classes, custom_css, created_at, updated_at,
  liquid_section_id, created_at_unix, draft_r2_key, published_r2_key,
  r2_bucket, content_hash, published_hash, schema_version,
  definition_id, template_sku, section_key, metadata_json
)
SELECT
  id, page_id, section_type, section_name, section_data, sort_order,
  is_visible, css_classes, custom_css, created_at, updated_at,
  liquid_section_id, created_at_unix, draft_r2_key, published_r2_key,
  r2_bucket, content_hash, published_hash, schema_version,
  definition_id, template_sku, section_key, metadata_json
FROM cms_page_sections__legacy_20261103;

INSERT INTO cms_liquid_sections (
  id, import_id, file_name, section_key, section_type, liquid_source,
  schema_json, settings_map_json, render_deps, mapped_template_id,
  mapped_section_id, parse_status, parse_error, created_at, site_id
)
SELECT
  id, import_id, file_name, section_key, section_type, liquid_source,
  schema_json, settings_map_json, render_deps, mapped_template_id,
  mapped_section_id, parse_status, parse_error, created_at, site_id
FROM cms_liquid_sections__legacy_20261103;

INSERT INTO cms_section_blocks (
  id, account_id, section_id, parent_block_id, block_key, block_type,
  definition_id, template_sku, sort_order, status, content_json,
  settings_json, source_path, metadata_json, created_at, updated_at
)
SELECT
  id, account_id, section_id, parent_block_id, block_key, block_type,
  definition_id, template_sku, sort_order, status, content_json,
  settings_json, source_path, metadata_json, created_at, updated_at
FROM cms_section_blocks__legacy_20261103;

INSERT INTO cms_live_edit_sessions (
  id, page_id, user_id, session_token, is_active, last_activity, created_at
)
SELECT
  id, page_id, user_id, session_token, is_active, last_activity, created_at
FROM cms_live_edit_sessions__legacy_20261103;

-- Drop only the renamed legacy tables after their complete replacement has
-- been copied and validated. No active page, section, block, or edit-session
-- row is deleted by the rebuild.
DROP TABLE cms_section_blocks__legacy_20261103;
DROP TABLE cms_page_sections__legacy_20261103;
DROP TABLE cms_liquid_sections__legacy_20261103;
DROP TABLE cms_live_edit_sessions__legacy_20261103;
DROP TABLE cms_pages__legacy_20261103;

-- Recreate the previous indexes and add site-scoped lookup indexes.
CREATE INDEX cms_pages_site_system_order
  ON cms_pages(site_id, is_system_page, sort_order, slug);
CREATE INDEX idx_cms_pages_site_id ON cms_pages(site_id);
CREATE INDEX idx_cms_pages_definition ON cms_pages(definition_id);
CREATE INDEX idx_cms_pages_template ON cms_pages(template_sku);
CREATE INDEX idx_cms_pages_site_status ON cms_pages(site_id, status, sort_order);
CREATE INDEX idx_cms_pages_site_route ON cms_pages(site_id, route_path);

CREATE UNIQUE INDEX cms_page_sections_page_section_key_unique
  ON cms_page_sections(page_id, section_key);
CREATE INDEX idx_cms_page_sections_definition
  ON cms_page_sections(definition_id);
CREATE INDEX idx_cms_page_sections_draft_r2_key
  ON cms_page_sections(draft_r2_key);
CREATE INDEX idx_cms_page_sections_published_r2_key
  ON cms_page_sections(published_r2_key);
CREATE INDEX idx_cms_page_sections_template
  ON cms_page_sections(template_sku);

CREATE INDEX idx_cms_section_blocks_definition
  ON cms_section_blocks(definition_id);
CREATE INDEX idx_cms_section_blocks_template
  ON cms_section_blocks(template_sku);
CREATE INDEX idx_cms_section_blocks_tree
  ON cms_section_blocks(section_id, parent_block_id, sort_order, status);

-- D1 validates the entire rebuilt graph here. This fails the migration if any
-- page, section, Liquid mapping, nested block, or live-edit FK is unresolved.
PRAGMA defer_foreign_keys = OFF;
