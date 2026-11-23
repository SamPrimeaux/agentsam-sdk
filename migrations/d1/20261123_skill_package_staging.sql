-- Batch 1 / phase A: stage a corrected multi-skill package catalog.
-- The production agentsam_skill table currently has UNIQUE(npm_package_name,
-- npm_version), which rejects two distinct skills in the same npm SDK version.
-- Keep the old table untouched until source/package receipt and authorization
-- gates pass; the new table is a non-disruptive staging copy.
CREATE TABLE IF NOT EXISTS agentsam_skill_next (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL DEFAULT 'account'
    CHECK(scope_type IN ('platform','account')),
  account_id TEXT,
  name TEXT NOT NULL,
  slash_trigger TEXT NOT NULL CHECK(slash_trigger GLOB '/[a-z0-9][a-z0-9-]*'),
  npm_package_name TEXT,
  npm_version TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0,1)),
  description TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  content_checksum TEXT NOT NULL DEFAULT '',
  globs TEXT NOT NULL DEFAULT '[]',
  always_apply INTEGER NOT NULL DEFAULT 0 CHECK(always_apply IN (0,1)),
  task_types_json TEXT NOT NULL DEFAULT '[]',
  route_keys_json TEXT NOT NULL DEFAULT '[]',
  access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK(access_mode IN ('read_only','read_write')),
  icon TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  invocation_count INTEGER NOT NULL DEFAULT 0,
  last_invoked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((scope_type='platform' AND account_id IS NULL)
     OR (scope_type='account' AND account_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_skill_next_scope_slash
  ON agentsam_skill_next(scope_type,COALESCE(account_id,''),slash_trigger);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_skill_next_package_file
  ON agentsam_skill_next(scope_type,COALESCE(account_id,''),
     npm_package_name,npm_version,file_path)
  WHERE npm_package_name IS NOT NULL AND npm_version IS NOT NULL
    AND file_path!='';
CREATE INDEX IF NOT EXISTS idx_agentsam_skill_next_discoverable
  ON agentsam_skill_next(scope_type,account_id,is_published,is_active);

-- Old rows copied as account-owned evidence, never mass-published.
-- Do not INSERT OR IGNORE old rows: any collision must fail visibly.
INSERT INTO agentsam_skill_next (
  id,scope_type,account_id,name,slash_trigger,npm_package_name,npm_version,
  is_published,description,content_markdown,file_path,content_checksum,
  globs,always_apply,task_types_json,route_keys_json,access_mode,
  icon,tags_json,metadata_json,invocation_count,last_invoked_at,
  version,is_active,sort_order,created_at,updated_at
)
SELECT
  s.id,'account',s.account_id,s.name,s.slash_trigger,s.npm_package_name,s.npm_version,
  s.is_published,s.description,s.content_markdown,s.file_path,s.content_checksum,
  s.globs,s.always_apply,s.task_types_json,s.route_keys_json,s.access_mode,
  s.icon,s.tags_json,s.metadata_json,s.invocation_count,s.last_invoked_at,
  s.version,s.is_active,s.sort_order,s.created_at,s.updated_at
FROM agentsam_skill s
WHERE NOT EXISTS (SELECT 1 FROM agentsam_skill_next existing WHERE existing.id=s.id);
