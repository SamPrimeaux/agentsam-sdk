-- Reusable semantic section/block definitions for the existing seven-table CMS spine.
-- Apply through the app's normal ordered D1 migration process, not by running
-- this file against production ad hoc. Existing instances remain untouched.
CREATE TABLE IF NOT EXISTS cms_definitions (
  id TEXT PRIMARY KEY DEFAULT ('cmsd_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  definition_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('section','block')),
  label TEXT NOT NULL,
  description TEXT,
  category TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('built_in','package','imported','generated','app')),
  version TEXT NOT NULL DEFAULT '1',
  artifact_id TEXT REFERENCES cms_artifacts(id),
  settings_schema_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(settings_schema_json)),
  allowed_blocks_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(allowed_blocks_json)),
  max_blocks INTEGER CHECK (max_blocks IS NULL OR max_blocks >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json)),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','draft','deprecated','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, kind, definition_key, version)
);
CREATE INDEX IF NOT EXISTS idx_cms_definitions_catalog
  ON cms_definitions(account_id, kind, status, category, definition_key);
CREATE INDEX IF NOT EXISTS idx_cms_definitions_artifact
  ON cms_definitions(artifact_id);
