-- agentsam-engine: d1
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
  site_id TEXT NOT NULL REFERENCES cms_sites(id),
  slug TEXT NOT NULL,
  route_path TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'page' CHECK (length(trim(page_type)) > 0),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  -- Authored SEO only: title, description, og_image, canonical (override), noindex.
  -- Site defaults live in cms_sites.settings_json.seo; backend/cms/seo.mjs resolves both.
  seo_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(seo_json)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  definition_id TEXT REFERENCES cms_definitions(id),
  -- NULL = bespoke page; set = built from a prebuilt company template (platform-owned, no FK).
  template_sku TEXT,
  requires_auth INTEGER NOT NULL DEFAULT 0 CHECK (requires_auth IN (0,1)),
  nav_visible INTEGER NOT NULL DEFAULT 1 CHECK (nav_visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_object_key TEXT,
  published_manifest_object_key TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (site_id, slug),
  UNIQUE (site_id, route_path)
);

INSERT INTO cms_pages (
  id, site_id, slug, route_path, page_type, title, status, seo_json, metadata_json,
  definition_id, template_sku, requires_auth, nav_visible, sort_order,
  content_object_key, published_manifest_object_key, published_at, created_at, updated_at
)
SELECT
  p.id, p.site_id, p.slug, p.route_path,
  CASE WHEN p.page_type = 'home' OR p.route_path = '/' THEN 'landing' ELSE p.page_type END,
  p.title,
  CASE WHEN p.status = 'archived' OR p.archived_at IS NOT NULL OR p.is_active = 0 THEN 'archived'
       WHEN p.status = 'scheduled' THEN 'draft' ELSE p.status END,
  json_patch(
    json_patch('{}', json_object(
      'title', p.seo_title,
      'description', COALESCE(p.meta_description, p.description),
      'canonical', p.canonical_url,
      'og_image', p.og_image_asset_id,
      'noindex', CASE WHEN lower(COALESCE(p.robots, '')) LIKE '%noindex%' THEN json('true') END)),
    CASE WHEN json_valid(p.seo_json) THEN p.seo_json ELSE '{}' END),
  json_patch(
    CASE WHEN json_valid(p.metadata_json)
         THEN json_remove(p.metadata_json, '$.legacy_site_page_id', '$.legacy_project_id')
         ELSE '{}' END,
    json_object('migrated_from', json_object(
      'project_id', p.project_id, 'project_slug', p.project_slug,
      'path', CASE WHEN p.path <> p.route_path AND p.path <> COALESCE(p.r2_key, '') THEN p.path END,
      'config', json(CASE WHEN json_valid(p.config_json) AND p.config_json NOT IN ('', '{}')
                          THEN p.config_json END)))),
  p.definition_id, p.template_sku,
  CASE WHEN p.requires_auth = 1 THEN 1 ELSE 0 END,
  COALESCE(p.nav_visible, 1), COALESCE(p.sort_order, 0),
  p.r2_key, p.published_manifest_r2_key, p.published_at, p.created_at, p.updated_at
FROM cms_pages__legacy_20261103 p;

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
CREATE INDEX idx_cms_pages_definition ON cms_pages(definition_id);
CREATE INDEX idx_cms_pages_template ON cms_pages(template_sku);
CREATE INDEX idx_cms_pages_site_status ON cms_pages(site_id, status, sort_order);

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
