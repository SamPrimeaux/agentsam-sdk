-- One-time additive repair for deployed AgentSam D1; back up first.
-- DO NOT run migration 004 against this existing CMS schema.
ALTER TABLE cms_sites ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1));
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_sites_one_default_per_account ON cms_sites(account_id) WHERE is_default=1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_sites_id_account ON cms_sites(id,account_id);
-- Do not select an existing company or customer site by name, slug or
-- domain. Only single-site accounts can be assigned unambiguously.
UPDATE cms_sites SET is_default=1 WHERE is_default=0 AND account_id IN
  (SELECT account_id FROM cms_sites GROUP BY account_id HAVING COUNT(*)=1);

-- Canonical theme-project records: account/site scoped, R2 revision pointers.
CREATE TABLE IF NOT EXISTS cms_globals (
  id TEXT PRIMARY KEY DEFAULT ('cmsg_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  site_id TEXT NOT NULL,
  global_key TEXT NOT NULL,
  global_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  inline_content_json TEXT NOT NULL DEFAULT '{}',
  content_object_key TEXT,
  content_version INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  legacy_page_id INTEGER,
  legacy_section_id INTEGER UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id,global_key),
  FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cms_globals_site ON cms_globals(site_id,global_type,status);
CREATE TABLE IF NOT EXISTS cms_revisions (
  id TEXT PRIMARY KEY DEFAULT ('cmsr_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  site_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global')),
  entity_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 0,
  revision_kind TEXT NOT NULL DEFAULT 'current'
    CHECK(revision_kind IN ('current','history','published','draft','imported')),
  content_object_key TEXT,
  content_hash TEXT,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),
  FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cms_revisions_entity ON cms_revisions(site_id,entity_type,entity_id,revision_number DESC);
CREATE TABLE IF NOT EXISTS cms_artifacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  artifact_key TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('section','template','theme','page-build','site-build','app','scene','embed')),
  version TEXT NOT NULL,
  object_prefix TEXT NOT NULL,
  manifest_object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_mode TEXT NOT NULL DEFAULT 'bundle' CHECK(content_mode IN ('bundle','html','component','scene','embed','manifest')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('building','ready','failed','deprecated')),
  source_kind TEXT,
  source_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id,artifact_key,version)
);
CREATE INDEX IF NOT EXISTS idx_cms_artifacts_account_type ON cms_artifacts(account_id,artifact_type,status,created_at);
CREATE INDEX IF NOT EXISTS idx_cms_artifacts_hash ON cms_artifacts(account_id,content_hash);
