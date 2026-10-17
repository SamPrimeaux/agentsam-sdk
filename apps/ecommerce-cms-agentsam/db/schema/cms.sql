-- Canonical CMS schema.
-- Compatible with Cloudflare D1 and plain SQLite.
-- Heavy documents / generated code / bundles live in object storage (R2 locally or remotely);
-- D1/SQLite stores identity, structure, references, versions and relationships.
--
-- Assumes the shared accounts table already exists.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cms_pages (
  id                 TEXT PRIMARY KEY
    DEFAULT ('cmsp_' || lower(hex(randomblob(8)))),
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  legacy_page_id     INTEGER UNIQUE,
  slug               TEXT NOT NULL,
  title              TEXT NOT NULL,
  page_type          TEXT NOT NULL DEFAULT 'standard'
    CHECK (page_type IN ('standard','scene','global')),
  status             TEXT NOT NULL DEFAULT 'draft',
  template_key       TEXT,
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_account_status
  ON cms_pages(account_id, status, slug);

CREATE TABLE IF NOT EXISTS cms_page_sections (
  id                  TEXT PRIMARY KEY
    DEFAULT ('cmss_' || lower(hex(randomblob(8)))),
  account_id          TEXT NOT NULL REFERENCES accounts(id),
  page_id             TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  legacy_section_id   INTEGER UNIQUE,
  section_key         TEXT NOT NULL,
  section_type        TEXT NOT NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  inline_content_json TEXT NOT NULL DEFAULT '{}',
  content_r2_key      TEXT,
  content_version     INTEGER NOT NULL DEFAULT 0,
  content_hash        TEXT,
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_page_sections_page
  ON cms_page_sections(page_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_cms_page_sections_type
  ON cms_page_sections(account_id, section_type, status);

CREATE TABLE IF NOT EXISTS cms_artifacts (
  id TEXT PRIMARY KEY,

  account_id TEXT NOT NULL REFERENCES accounts(id),

  artifact_key TEXT NOT NULL,

  artifact_type TEXT NOT NULL
    CHECK (artifact_type IN (
      'section',
      'template',
      'theme',
      'page-build',
      'site-build',
      'app',
      'scene',
      'embed'
    )),

  version TEXT NOT NULL,

  -- Immutable object-storage location.
  r2_prefix TEXT NOT NULL,
  manifest_r2_key TEXT NOT NULL,

  content_hash TEXT NOT NULL,

  content_mode TEXT NOT NULL DEFAULT 'bundle'
    CHECK (content_mode IN (
      'bundle',
      'html',
      'component',
      'scene',
      'embed',
      'manifest'
    )),

  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN (
      'building',
      'ready',
      'failed',
      'deprecated'
    )),

  -- Provider-neutral provenance:
  -- package | cms | generator | import | build
  source_kind TEXT,
  source_ref TEXT,

  -- Provider/model/tool-call provenance belongs here as metadata, not as provider-specific columns.
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(account_id, artifact_key, version)
);

CREATE INDEX IF NOT EXISTS idx_cms_artifacts_account_type
  ON cms_artifacts(account_id, artifact_type, status, created_at);

CREATE INDEX IF NOT EXISTS idx_cms_artifacts_hash
  ON cms_artifacts(account_id, content_hash);

CREATE TABLE IF NOT EXISTS cms_section_blocks (
  id              TEXT PRIMARY KEY
    DEFAULT ('cmsb_' || lower(hex(randomblob(8)))),

  account_id      TEXT NOT NULL REFERENCES accounts(id),

  section_id      TEXT NOT NULL
    REFERENCES cms_page_sections(id) ON DELETE CASCADE,

  -- NULL = top-level block; non-NULL = child of a container/group block.
  parent_block_id TEXT
    REFERENCES cms_section_blocks(id) ON DELETE CASCADE,

  block_key       TEXT NOT NULL,
  block_type      TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','hidden','archived')),

  -- Small settings/content only. Generated code/bundles are cms_artifacts.
  content_json    TEXT NOT NULL DEFAULT '{}',

  -- Used by artifact-backed blocks such as custom/embed/app blocks.
  artifact_id     TEXT REFERENCES cms_artifacts(id),

  source_path     TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(section_id, block_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_section_blocks_tree
  ON cms_section_blocks(section_id, parent_block_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_cms_section_blocks_artifact
  ON cms_section_blocks(artifact_id)
  WHERE artifact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cms_revisions (
  id               TEXT PRIMARY KEY
    DEFAULT ('cmsr_' || lower(hex(randomblob(8)))),
  account_id       TEXT NOT NULL REFERENCES accounts(id),
  entity_type      TEXT NOT NULL
    CHECK (entity_type IN ('page','section','block','global')),
  entity_id        TEXT NOT NULL,
  revision_number  INTEGER NOT NULL DEFAULT 0,
  revision_kind    TEXT NOT NULL DEFAULT 'current'
    CHECK (revision_kind IN ('current','history','published','draft','imported')),
  content_r2_key   TEXT,
  content_hash     TEXT,
  snapshot_json    TEXT NOT NULL DEFAULT '{}',
  metadata_json    TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id, revision_number, revision_kind, content_r2_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_revisions_entity
  ON cms_revisions(account_id, entity_type, entity_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS cms_globals (
  id                    TEXT PRIMARY KEY
    DEFAULT ('cmsg_' || lower(hex(randomblob(8)))),
  account_id            TEXT NOT NULL REFERENCES accounts(id),
  global_key            TEXT NOT NULL,
  global_type           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  inline_content_json   TEXT NOT NULL DEFAULT '{}',
  content_r2_key        TEXT,
  content_version       INTEGER NOT NULL DEFAULT 0,
  content_hash          TEXT,
  legacy_page_id        INTEGER,
  legacy_section_id     INTEGER UNIQUE,
  metadata_json         TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, global_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_globals_account
  ON cms_globals(account_id, global_type, status);

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
