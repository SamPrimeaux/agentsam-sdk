-- Wave 1: move the Ecommerce CMS to an account-owned, site-first content model.
-- Run after cms.sql, 002_cms_definitions.sql and 003_definitions_seed_notes.sql.
-- AgentSam owns provider/resource registries. CMS records only provider-neutral object keys.
-- This migration preserves current IDs, revisions, section/block rows and legacy page pointers.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cms_sites (
  id                  TEXT PRIMARY KEY DEFAULT ('cmssite_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  primary_domain      TEXT,
  domain_aliases_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(domain_aliases_json) AND json_type(domain_aliases_json) = 'array'),
  settings_json       TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(settings_json) AND json_type(settings_json) = 'object'),
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  is_default          INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, slug),
  UNIQUE (id, account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_sites_one_default_per_account
  ON cms_sites(account_id) WHERE is_default = 1;
CREATE INDEX IF NOT EXISTS idx_cms_sites_account_status
  ON cms_sites(account_id, status, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_sites_primary_domain
  ON cms_sites(lower(primary_domain)) WHERE primary_domain IS NOT NULL;

INSERT INTO cms_sites (id, account_id, name, slug, status, is_default)
SELECT 'cmssite_' || lower(hex(randomblob(8))), a.id, 'Default site', 'default', 'active', 1
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM cms_sites s WHERE s.account_id = a.id AND s.is_default = 1
);

-- Rename storage columns once, at the schema boundary. Provider selection and
-- object access remain AgentSam responsibilities; CMS persists only object keys.
ALTER TABLE cms_artifacts RENAME COLUMN r2_prefix TO object_prefix;
ALTER TABLE cms_artifacts RENAME COLUMN manifest_r2_key TO manifest_object_key;
ALTER TABLE cms_page_sections RENAME COLUMN content_r2_key TO content_object_key;
ALTER TABLE cms_revisions RENAME COLUMN content_r2_key TO content_object_key;
ALTER TABLE cms_globals RENAME COLUMN content_r2_key TO content_object_key;

-- Rebuild the page/section/block spine so site_id becomes the content boundary
-- and the old UNIQUE(account_id, slug) restriction no longer blocks multi-site accounts.
CREATE TABLE cms_pages__next (
  id                 TEXT PRIMARY KEY DEFAULT ('cmsp_' || lower(hex(randomblob(8)))),
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  site_id            TEXT NOT NULL,
  legacy_page_id     INTEGER UNIQUE,
  slug               TEXT NOT NULL,
  route_path         TEXT,
  parent_page_id     TEXT REFERENCES cms_pages__next(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  page_type          TEXT NOT NULL DEFAULT 'standard'
    CHECK (page_type IN ('standard','scene','global')),
  status             TEXT NOT NULL DEFAULT 'draft',
  template_key       TEXT,
  is_homepage        INTEGER NOT NULL DEFAULT 0 CHECK (is_homepage IN (0,1)),
  nav_visible        INTEGER NOT NULL DEFAULT 1 CHECK (nav_visible IN (0,1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  canonical_url      TEXT,
  robots             TEXT,
  meta_title         TEXT,
  meta_description   TEXT,
  og_image_asset_ref TEXT,
  seo_json           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(seo_json)),
  metadata_json      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, slug),
  UNIQUE (site_id, route_path),
  UNIQUE (id, account_id),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);

INSERT INTO cms_pages__next (
  rowid, id, account_id, site_id, legacy_page_id, slug, route_path, title,
  page_type, status, template_key, is_homepage, nav_visible, sort_order,
  seo_json, metadata_json, created_at, updated_at
)
SELECT
  p.rowid, p.id, p.account_id, s.id, p.legacy_page_id, p.slug,
  CASE
    WHEN p.page_type = 'global' OR p.slug = 'site' THEN NULL
    WHEN p.slug = 'home' THEN '/'
    WHEN p.slug = 'index' AND NOT EXISTS (
      SELECT 1 FROM cms_pages home WHERE home.account_id=p.account_id AND home.slug='home'
    ) THEN '/'
    ELSE '/' || trim(p.slug, '/')
  END,
  p.title, p.page_type, p.status, p.template_key,
  CASE WHEN p.slug = 'home' OR (p.slug = 'index' AND NOT EXISTS (
    SELECT 1 FROM cms_pages home WHERE home.account_id=p.account_id AND home.slug='home'
  )) THEN 1 ELSE 0 END,
  1, 0, '{}', p.metadata_json, p.created_at, p.updated_at
FROM cms_pages p
JOIN cms_sites s ON s.account_id = p.account_id AND s.is_default = 1;

CREATE TABLE cms_page_sections__next (
  id                  TEXT PRIMARY KEY DEFAULT ('cmss_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id),
  page_id             TEXT NOT NULL,
  legacy_section_id   INTEGER UNIQUE,
  section_key         TEXT NOT NULL,
  section_type        TEXT NOT NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  inline_content_json TEXT NOT NULL DEFAULT '{}',
  content_object_key  TEXT,
  content_version     INTEGER NOT NULL DEFAULT 0,
  content_hash        TEXT,
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, section_key),
  UNIQUE (id, account_id),
  FOREIGN KEY (page_id, account_id) REFERENCES cms_pages__next(id, account_id) ON DELETE CASCADE
);

INSERT INTO cms_page_sections__next (
  rowid, id, account_id, page_id, legacy_section_id, section_key, section_type,
  sort_order, status, inline_content_json, content_object_key, content_version,
  content_hash, metadata_json, created_at, updated_at
)
SELECT rowid, id, account_id, page_id, legacy_section_id, section_key, section_type,
       sort_order, status, inline_content_json, content_object_key, content_version,
       content_hash, metadata_json, created_at, updated_at
FROM cms_page_sections;

CREATE TABLE cms_section_blocks__next (
  id              TEXT PRIMARY KEY DEFAULT ('cmsb_' || lower(hex(randomblob(8)))),
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  section_id      TEXT NOT NULL,
  parent_block_id TEXT REFERENCES cms_section_blocks__next(id) ON DELETE CASCADE,
  block_key       TEXT NOT NULL,
  block_type      TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','hidden','archived')),
  content_json    TEXT NOT NULL DEFAULT '{}',
  artifact_id     TEXT REFERENCES cms_artifacts(id),
  source_path     TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (section_id, block_key),
  UNIQUE (id, account_id),
  FOREIGN KEY (section_id, account_id) REFERENCES cms_page_sections__next(id, account_id) ON DELETE CASCADE
);

INSERT INTO cms_section_blocks__next (
  rowid, id, account_id, section_id, parent_block_id, block_key, block_type,
  sort_order, status, content_json, artifact_id, source_path, metadata_json,
  created_at, updated_at
)
SELECT rowid, id, account_id, section_id, parent_block_id, block_key, block_type,
       sort_order, status, content_json, artifact_id, source_path, metadata_json,
       created_at, updated_at
FROM cms_section_blocks;

DROP TABLE cms_section_blocks;
DROP TABLE cms_page_sections;
DROP TABLE cms_pages;

ALTER TABLE cms_pages__next RENAME TO cms_pages;
ALTER TABLE cms_page_sections__next RENAME TO cms_page_sections;
ALTER TABLE cms_section_blocks__next RENAME TO cms_section_blocks;

CREATE INDEX idx_cms_pages_site_status ON cms_pages(site_id, status, sort_order, title);
CREATE INDEX idx_cms_pages_site_route ON cms_pages(site_id, route_path);
CREATE UNIQUE INDEX idx_cms_pages_one_homepage_per_site ON cms_pages(site_id) WHERE is_homepage = 1;
CREATE INDEX idx_cms_page_sections_page ON cms_page_sections(page_id, sort_order, id);
CREATE INDEX idx_cms_page_sections_type ON cms_page_sections(account_id, section_type, status);
CREATE INDEX idx_cms_section_blocks_tree ON cms_section_blocks(section_id, parent_block_id, sort_order, id);
CREATE INDEX idx_cms_section_blocks_artifact ON cms_section_blocks(artifact_id) WHERE artifact_id IS NOT NULL;

-- Globals are site-scoped. Account ownership is retained as a tenant guard.
CREATE TABLE cms_globals__next (
  id                  TEXT PRIMARY KEY DEFAULT ('cmsg_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id),
  site_id             TEXT NOT NULL,
  global_key          TEXT NOT NULL,
  global_type         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  inline_content_json TEXT NOT NULL DEFAULT '{}',
  content_object_key  TEXT,
  content_version     INTEGER NOT NULL DEFAULT 0,
  content_hash        TEXT,
  legacy_page_id      INTEGER,
  legacy_section_id   INTEGER UNIQUE,
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, global_key),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);

INSERT INTO cms_globals__next (
  id, account_id, site_id, global_key, global_type, status, inline_content_json,
  content_object_key, content_version, content_hash, legacy_page_id,
  legacy_section_id, metadata_json, created_at, updated_at
)
SELECT g.id, g.account_id, s.id, g.global_key, g.global_type, g.status,
       g.inline_content_json, g.content_object_key, g.content_version, g.content_hash,
       g.legacy_page_id, g.legacy_section_id, g.metadata_json, g.created_at, g.updated_at
FROM cms_globals g
JOIN cms_sites s ON s.account_id = g.account_id AND s.is_default = 1;

DROP TABLE cms_globals;
ALTER TABLE cms_globals__next RENAME TO cms_globals;
CREATE INDEX idx_cms_globals_site ON cms_globals(site_id, global_type, status);

-- Revisions retain entity-level history while acquiring an explicit site scope.
CREATE TABLE cms_revisions__next (
  id               TEXT PRIMARY KEY DEFAULT ('cmsr_' || lower(hex(randomblob(8)))),
  account_id       TEXT NOT NULL REFERENCES accounts(id),
  site_id          TEXT NOT NULL,
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('page','section','block','global')),
  entity_id        TEXT NOT NULL,
  revision_number  INTEGER NOT NULL DEFAULT 0,
  revision_kind    TEXT NOT NULL DEFAULT 'current'
    CHECK (revision_kind IN ('current','history','published','draft','imported')),
  content_object_key TEXT,
  content_hash     TEXT,
  snapshot_json    TEXT NOT NULL DEFAULT '{}',
  metadata_json    TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, entity_type, entity_id, revision_number, revision_kind, content_object_key),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);

INSERT INTO cms_revisions__next (
  id, account_id, site_id, entity_type, entity_id, revision_number, revision_kind,
  content_object_key, content_hash, snapshot_json, metadata_json, created_at
)
SELECT r.id, r.account_id,
  COALESCE(
    CASE r.entity_type
      WHEN 'page' THEN (SELECT p.site_id FROM cms_pages p WHERE p.id = r.entity_id)
      WHEN 'section' THEN (SELECT p.site_id FROM cms_page_sections s JOIN cms_pages p ON p.id = s.page_id WHERE s.id = r.entity_id)
      WHEN 'block' THEN (SELECT p.site_id FROM cms_section_blocks b JOIN cms_page_sections s ON s.id = b.section_id JOIN cms_pages p ON p.id = s.page_id WHERE b.id = r.entity_id)
      WHEN 'global' THEN (SELECT g.site_id FROM cms_globals g WHERE g.id = r.entity_id)
    END,
    (SELECT s.id FROM cms_sites s WHERE s.account_id = r.account_id AND s.is_default = 1)
  ),
  r.entity_type, r.entity_id, r.revision_number, r.revision_kind,
  r.content_object_key, r.content_hash, r.snapshot_json, r.metadata_json, r.created_at
FROM cms_revisions r;

DROP TABLE cms_revisions;
ALTER TABLE cms_revisions__next RENAME TO cms_revisions;
CREATE INDEX idx_cms_revisions_entity ON cms_revisions(site_id, entity_type, entity_id, revision_number DESC);

CREATE TABLE cms_navigation_menus (
  id            TEXT PRIMARY KEY DEFAULT ('cmsnav_' || lower(hex(randomblob(8)))),
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  site_id       TEXT NOT NULL,
  handle        TEXT NOT NULL,
  title         TEXT NOT NULL,
  items_json    TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(items_json) AND json_type(items_json) = 'array'),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, handle),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_cms_navigation_menus_site ON cms_navigation_menus(site_id, status, handle);

CREATE TABLE cms_publications (
  id                   TEXT PRIMARY KEY DEFAULT ('cmspub_' || lower(hex(randomblob(8)))),
  account_id           TEXT NOT NULL REFERENCES accounts(id),
  site_id              TEXT NOT NULL,
  release_number       INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('building','published','rolled_back','failed')),
  manifest_object_key  TEXT NOT NULL,
  manifest_hash        TEXT NOT NULL,
  source_revision_hash TEXT,
  created_by           TEXT,
  metadata_json        TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  published_at         TEXT,
  UNIQUE (site_id, release_number),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_cms_publications_site_history ON cms_publications(site_id, release_number DESC);

CREATE TABLE cms_collections (
  id                      TEXT PRIMARY KEY DEFAULT ('cmscol_' || lower(hex(randomblob(8)))),
  account_id              TEXT NOT NULL REFERENCES accounts(id),
  site_id                 TEXT NOT NULL,
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL,
  description             TEXT,
  kind                    TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','smart')),
  allowed_item_types_json TEXT NOT NULL DEFAULT '["product","asset","content","page"]'
    CHECK (json_valid(allowed_item_types_json) AND json_type(allowed_item_types_json) = 'array'),
  rule_json               TEXT CHECK (rule_json IS NULL OR json_valid(rule_json)),
  tags_json               TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  seo_title               TEXT,
  seo_description         TEXT,
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  visibility              TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','unlisted')),
  sort_order              INTEGER NOT NULL DEFAULT 0,
  metadata_json           TEXT NOT NULL DEFAULT '{}',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, slug),
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_cms_collections_site_status ON cms_collections(site_id, status, sort_order, name);

-- A CMS collection is a presentation/curation surface, not the commerce
-- catalog's store_collections table. It can mix products, shared media and
-- CMS content without duplicating those entities or their source records.
CREATE TABLE cms_collection_items (
  id                TEXT PRIMARY KEY DEFAULT ('cmscoli_' || lower(hex(randomblob(8)))),
  account_id        TEXT NOT NULL REFERENCES accounts(id),
  site_id           TEXT NOT NULL,
  collection_id     TEXT NOT NULL,
  item_type         TEXT NOT NULL CHECK (item_type IN ('product','asset','content','page')),
  item_ref          TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','archived')) ,
  presentation_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(presentation_json) AND json_type(presentation_json) = 'object'),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (collection_id, item_type, item_ref),
  FOREIGN KEY (collection_id) REFERENCES cms_collections(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_cms_collection_items_order
  ON cms_collection_items(collection_id, status, sort_order, id);
CREATE INDEX idx_cms_collection_items_target
  ON cms_collection_items(account_id, site_id, item_type, item_ref);

CREATE TRIGGER trg_cms_collection_item_scope_insert
BEFORE INSERT ON cms_collection_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_collections c
    WHERE c.id=NEW.collection_id AND c.account_id=NEW.account_id AND c.site_id=NEW.site_id
  ) THEN RAISE(ABORT, 'cms_collection_item_scope_mismatch') END;
END;
CREATE TRIGGER trg_cms_collection_item_scope_update
BEFORE UPDATE OF collection_id, account_id, site_id ON cms_collection_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_collections c
    WHERE c.id=NEW.collection_id AND c.account_id=NEW.account_id AND c.site_id=NEW.site_id
  ) THEN RAISE(ABORT, 'cms_collection_item_scope_mismatch') END;
END;

CREATE TRIGGER trg_cms_collection_item_type_insert
BEFORE INSERT ON cms_collection_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_collections c, json_each(c.allowed_item_types_json) allowed
    WHERE c.id=NEW.collection_id AND allowed.value=NEW.item_type
  ) THEN RAISE(ABORT, 'cms_collection_item_type_not_allowed') END;
END;
CREATE TRIGGER trg_cms_collection_item_type_update
BEFORE UPDATE OF collection_id, item_type ON cms_collection_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cms_collections c, json_each(c.allowed_item_types_json) allowed
    WHERE c.id=NEW.collection_id AND allowed.value=NEW.item_type
  ) THEN RAISE(ABORT, 'cms_collection_item_type_not_allowed') END;
END;

CREATE TRIGGER trg_cms_pages_parent_site_insert
BEFORE INSERT ON cms_pages WHEN NEW.parent_page_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cms_pages p WHERE p.id = NEW.parent_page_id AND p.site_id = NEW.site_id)
    THEN RAISE(ABORT, 'cms_page_parent_site_mismatch') END;
END;
CREATE TRIGGER trg_cms_pages_parent_site_update
BEFORE UPDATE OF parent_page_id, site_id ON cms_pages WHEN NEW.parent_page_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cms_pages p WHERE p.id = NEW.parent_page_id AND p.site_id = NEW.site_id)
    THEN RAISE(ABORT, 'cms_page_parent_site_mismatch') END;
END;
CREATE TRIGGER trg_cms_publications_immutable_update
BEFORE UPDATE ON cms_publications
WHEN OLD.status IN ('published','rolled_back')
BEGIN SELECT RAISE(ABORT, 'cms_publication_immutable'); END;
CREATE TRIGGER trg_cms_publications_immutable_delete
BEFORE DELETE ON cms_publications
WHEN OLD.status IN ('published','rolled_back')
BEGIN SELECT RAISE(ABORT, 'cms_publication_immutable'); END;

-- Integrity: nested blocks must stay inside the same tenant + section.
CREATE TRIGGER IF NOT EXISTS trg_cms_blocks_parent_scope_insert
BEFORE INSERT ON cms_section_blocks
WHEN NEW.parent_block_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM cms_section_blocks p
      WHERE p.id = NEW.parent_block_id
        AND p.account_id = NEW.account_id
        AND p.section_id = NEW.section_id
    )
    THEN RAISE(ABORT, 'cms_block_parent_scope_mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_cms_blocks_parent_scope_update
BEFORE UPDATE OF parent_block_id, account_id, section_id ON cms_section_blocks
WHEN NEW.parent_block_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM cms_section_blocks p
      WHERE p.id = NEW.parent_block_id
        AND p.account_id = NEW.account_id
        AND p.section_id = NEW.section_id
    )
    THEN RAISE(ABORT, 'cms_block_parent_scope_mismatch')
  END;
END;

-- Integrity: prevent block-parent cycles.
CREATE TRIGGER IF NOT EXISTS trg_cms_blocks_parent_cycle_update
BEFORE UPDATE OF parent_block_id ON cms_section_blocks
WHEN NEW.parent_block_id IS NOT NULL
BEGIN
  WITH RECURSIVE lineage(id, parent_block_id) AS (
    SELECT id, parent_block_id
    FROM cms_section_blocks
    WHERE id = NEW.parent_block_id
    UNION ALL
    SELECT b.id, b.parent_block_id
    FROM cms_section_blocks b
    JOIN lineage l ON b.id = l.parent_block_id
    WHERE l.parent_block_id IS NOT NULL
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM lineage WHERE id = NEW.id)
    THEN RAISE(ABORT, 'cms_block_parent_cycle')
  END;
END;

-- Integrity: an artifact-backed block cannot cross tenant boundaries.
CREATE TRIGGER IF NOT EXISTS trg_cms_blocks_artifact_scope_insert
BEFORE INSERT ON cms_section_blocks
WHEN NEW.artifact_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM cms_artifacts a
      WHERE a.id = NEW.artifact_id
        AND a.account_id = NEW.account_id
    )
    THEN RAISE(ABORT, 'cms_block_artifact_scope_mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_cms_blocks_artifact_scope_update
BEFORE UPDATE OF artifact_id, account_id ON cms_section_blocks
WHEN NEW.artifact_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM cms_artifacts a
      WHERE a.id = NEW.artifact_id
        AND a.account_id = NEW.account_id
    )
    THEN RAISE(ABORT, 'cms_block_artifact_scope_mismatch')
  END;
END;
