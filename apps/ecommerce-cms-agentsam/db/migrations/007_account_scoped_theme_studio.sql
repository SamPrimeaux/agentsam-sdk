-- Theme Studio drafts belong to the authenticated account, not a CMS site.
-- A site/domain is a later publish target; authoring must work before one exists.
CREATE TABLE IF NOT EXISTS cms_theme_studio_projects (
  id TEXT PRIMARY KEY DEFAULT ('ctsp_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','archived')),
  inline_content_json TEXT NOT NULL DEFAULT '{}',
  content_object_key TEXT NOT NULL,
  content_version INTEGER NOT NULL DEFAULT 0 CHECK (content_version >= 0),
  content_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, project_id),
  UNIQUE(id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_cms_theme_studio_projects_account_status
  ON cms_theme_studio_projects(account_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cms_theme_studio_revisions (
  id TEXT PRIMARY KEY DEFAULT ('ctsrev_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_row_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  revision_kind TEXT NOT NULL DEFAULT 'draft' CHECK (revision_kind IN ('draft','imported')),
  content_object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_row_id, revision_number, revision_kind),
  FOREIGN KEY(project_row_id, account_id)
    REFERENCES cms_theme_studio_projects(id, account_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cms_theme_studio_revisions_project
  ON cms_theme_studio_revisions(account_id, project_row_id, revision_number DESC);
